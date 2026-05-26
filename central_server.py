#!/usr/bin/env python3
"""Serve the PEACH app plus centralized shared JSON APIs.

Run:
  python3 central_server.py 8080

Then open:
  http://localhost:8080
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
STATE_FILE = DATA_DIR / "peach-central-state.json"
AUTH_FILE = DATA_DIR / "peach-auth-users.json"
STATE_LOCK = threading.Lock()
AUTH_LOCK = threading.Lock()

USER_ROLES = {"super_admin", "supervisor", "controlling_org", "authorized_user"}
MAX_SUPER_ADMINS = 2
PBKDF2_ITERATIONS = 250_000
SUPER_ADMIN_EMAIL = "admin"
SUPER_ADMIN_PASSWORD = "PeachSuperAdmin13!#"


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_state() -> Dict[str, Any]:
    return {
        "equipment": [],
        "activeLocks": [],
        "lockHistory": [],
        "audit": [],
        "users": [],
        "lockCheckouts": [],
        "lockMaster": [],
        "locations": [],
    }


def normalize_state(state: Dict[str, Any]) -> Dict[str, Any]:
    normalized = default_state()
    for key in normalized:
        value = state.get(key)
        normalized[key] = value if isinstance(value, list) else []
    return normalized


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        json.dump(payload, tmp, indent=2)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, path)


def _read_wrapper() -> Dict[str, Any]:
    if not STATE_FILE.exists():
        wrapper = {
            "version": 0,
            "updatedAt": utc_now_iso(),
            "state": default_state(),
        }
        _atomic_write_json(STATE_FILE, wrapper)
        return wrapper

    try:
        loaded = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        loaded = {}

    version = loaded.get("version")
    version_int = version if isinstance(version, int) and version >= 0 else 0
    updated_at = loaded.get("updatedAt") if isinstance(loaded.get("updatedAt"), str) else utc_now_iso()
    state = loaded.get("state") if isinstance(loaded.get("state"), dict) else {}

    wrapper = {
        "version": version_int,
        "updatedAt": updated_at,
        "state": normalize_state(state),
    }
    return wrapper


def _commit_state(candidate_state: Dict[str, Any], expected_version: int | None, actor: str) -> Dict[str, Any]:
    with STATE_LOCK:
        current = _read_wrapper()
        current_version = current["version"]

        if expected_version is not None and expected_version != current_version:
            return {
                "ok": False,
                "status": 409,
                "message": "Version conflict",
                "current": current,
            }

        next_state = normalize_state(candidate_state)
        next_state["audit"] = list(next_state["audit"])
        next_state["audit"].append(
            {
                "id": f"AUD-SRV-{dt.datetime.now().strftime('%Y%m%d%H%M%S%f')}",
                "timestamp": utc_now_iso(),
                "action": "SERVER_STATE_COMMIT",
                "actor": actor or "Unknown",
                "details": f"Central state updated from version {current_version} to {current_version + 1}",
            }
        )

        next_wrapper = {
            "version": current_version + 1,
            "updatedAt": utc_now_iso(),
            "state": next_state,
        }
        _atomic_write_json(STATE_FILE, next_wrapper)

    return {"ok": True, "status": 200, "wrapper": next_wrapper}


def _hash_password(password: str) -> Dict[str, Any]:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return {
        "salt": salt.hex(),
        "hash": derived.hex(),
        "iterations": PBKDF2_ITERATIONS,
    }


def _verify_password(password: str, stored: Dict[str, Any]) -> bool:
    try:
        salt = bytes.fromhex(str(stored.get("salt") or ""))
        expected = bytes.fromhex(str(stored.get("hash") or ""))
        iterations = int(stored.get("iterations") or PBKDF2_ITERATIONS)
    except Exception:
        return False

    if not salt or not expected or iterations < 100_000:
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


def _validate_password_strength(password: str) -> str:
    if len(password) < 12:
        return "Password must be at least 12 characters."
    if not any(ch.islower() for ch in password) or not any(ch.isupper() for ch in password):
        return "Password must include upper and lower case letters."
    if not any(ch.isdigit() for ch in password):
        return "Password must include at least one number."
    if all(ch.isalnum() for ch in password):
        return "Password must include at least one symbol."
    return ""


def _new_user_id() -> str:
    return f"AUTH-{dt.datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4).upper()}"


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("id", ""),
        "email": user.get("email", ""),
        "displayName": user.get("displayName", ""),
        "role": user.get("role", "authorized_user"),
    }


def _read_auth_store() -> Dict[str, Any]:
    if not AUTH_FILE.exists():
        bootstrap = {
            "users": [],
            "updatedAt": utc_now_iso(),
        }
        _atomic_write_json(AUTH_FILE, bootstrap)

    try:
        loaded = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except Exception:
        loaded = {}

    users = loaded.get("users") if isinstance(loaded.get("users"), list) else []
    normalized_users = []
    for row in users:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "authorized_user").strip().lower()
        if role not in USER_ROLES:
            role = "authorized_user"
        normalized_users.append(
            {
                "id": str(row.get("id") or _new_user_id()),
                "email": str(row.get("email") or "").strip().lower(),
                "displayName": str(row.get("displayName") or "").strip(),
                "role": role,
                "password": row.get("password") if isinstance(row.get("password"), dict) else {},
                "createdAt": str(row.get("createdAt") or utc_now_iso()),
                "updatedAt": str(row.get("updatedAt") or utc_now_iso()),
                "lastLoginAt": str(row.get("lastLoginAt") or ""),
            }
        )

    store = {
        "users": normalized_users,
        "updatedAt": str(loaded.get("updatedAt") or utc_now_iso()),
    }
    changed = _ensure_bootstrap_super_admin(store)
    if changed:
        _write_auth_store(store)
    return store


def _write_auth_store(store: Dict[str, Any]) -> None:
    store["updatedAt"] = utc_now_iso()
    _atomic_write_json(AUTH_FILE, store)


def _ensure_bootstrap_super_admin(store: Dict[str, Any]) -> bool:
    users = store["users"]
    now = utc_now_iso()
    admin_user = None
    for user in users:
        if str(user.get("email") or "").strip().lower() == SUPER_ADMIN_EMAIL:
            admin_user = user
            break

    changed = False
    if admin_user is None:
        users.append(
            {
                "id": _new_user_id(),
                "email": SUPER_ADMIN_EMAIL,
                "displayName": "Admin",
                "role": "super_admin",
                "password": _hash_password(SUPER_ADMIN_PASSWORD),
                "createdAt": now,
                "updatedAt": now,
                "lastLoginAt": "",
            }
        )
        changed = True
    else:
        if admin_user.get("role") != "super_admin":
            admin_user["role"] = "super_admin"
            changed = True
        if not isinstance(admin_user.get("password"), dict) or not admin_user["password"]:
            admin_user["password"] = _hash_password(SUPER_ADMIN_PASSWORD)
            changed = True

    super_admin_count = sum(1 for row in users if row.get("role") == "super_admin")
    if super_admin_count > MAX_SUPER_ADMINS:
        demotions_needed = super_admin_count - MAX_SUPER_ADMINS
        for user in users:
            if demotions_needed <= 0:
                break
            email = str(user.get("email") or "").strip().lower()
            if user.get("role") == "super_admin" and email != SUPER_ADMIN_EMAIL:
                user["role"] = "controlling_org"
                user["updatedAt"] = now
                demotions_needed -= 1
                changed = True

    return changed


def _parse_json_body(raw: bytes) -> Tuple[Dict[str, Any] | None, str | None]:
    try:
        body = json.loads(raw.decode("utf-8"))
    except Exception:
        return None, "Invalid JSON"
    if not isinstance(body, dict):
        return None, "Body must be a JSON object"
    return body, None


def _handle_signup(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    display_name = str(body.get("displayName") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    requested_role = str(body.get("requestedRole") or "authorized_user").strip().lower()

    if not display_name:
        return 400, {"error": "Display name is required."}
    if not email:
        return 400, {"error": "Email is required."}
    if "@" not in email or "." not in email.split("@")[-1]:
        return 400, {"error": "Enter a valid email address."}
    if requested_role == "super_admin":
        return 403, {"error": "Super Admin cannot be created via signup."}
    if requested_role not in USER_ROLES:
        return 400, {"error": "Invalid requested role."}

    password_err = _validate_password_strength(password)
    if password_err:
        return 400, {"error": password_err}

    now = utc_now_iso()
    with AUTH_LOCK:
        store = _read_auth_store()
        users = store["users"]

        for user in users:
            if str(user.get("email") or "").strip().lower() == email:
                return 409, {"error": "Email already registered."}

        role = requested_role if requested_role in USER_ROLES else "authorized_user"
        new_user = {
            "id": _new_user_id(),
            "email": email,
            "displayName": display_name,
            "role": role,
            "password": _hash_password(password),
            "createdAt": now,
            "updatedAt": now,
            "lastLoginAt": "",
        }
        users.append(new_user)
        _write_auth_store(store)

    return 201, {"ok": True, "user": _public_user(new_user)}


def _handle_login(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")

    if not email or not password:
        return 400, {"error": "Email/Admin and password are required."}

    lookup = SUPER_ADMIN_EMAIL if email == "admin" else email

    with AUTH_LOCK:
        store = _read_auth_store()
        users = store["users"]

        target = None
        for user in users:
            if str(user.get("email") or "").strip().lower() == lookup:
                target = user
                break

        if target is None:
            return 401, {"error": "Invalid credentials."}

        if not _verify_password(password, target.get("password") if isinstance(target.get("password"), dict) else {}):
            return 401, {"error": "Invalid credentials."}

        target["lastLoginAt"] = utc_now_iso()
        target["updatedAt"] = utc_now_iso()
        _write_auth_store(store)

    return 200, {"ok": True, "user": _public_user(target)}


class PeachHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self._json_response(
                200,
                {
                    "status": "ok",
                    "timestamp": utc_now_iso(),
                },
            )
            return

        if parsed.path == "/api/state":
            with STATE_LOCK:
                wrapper = _read_wrapper()
            self._json_response(200, wrapper)
            return

        return super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self._json_response(404, {"error": "Not Found"})
            return

        content_length = self.headers.get("Content-Length")
        try:
            total = int(content_length) if content_length else 0
        except ValueError:
            total = 0

        if total <= 0:
            self._json_response(400, {"error": "Request body required"})
            return

        body, parse_error = _parse_json_body(self.rfile.read(total))
        if parse_error:
            self._json_response(400, {"error": parse_error})
            return
        assert body is not None

        state = body.get("state")
        if not isinstance(state, dict):
            self._json_response(400, {"error": "Body.state must be an object"})
            return

        expected_version_raw = body.get("expectedVersion")
        expected_version = None
        if expected_version_raw is not None:
            if not isinstance(expected_version_raw, int) or expected_version_raw < 0:
                self._json_response(400, {"error": "expectedVersion must be a non-negative integer"})
                return
            expected_version = expected_version_raw

        actor = str(body.get("actor") or "Unknown")
        result = _commit_state(state, expected_version, actor)

        if not result["ok"]:
            self._json_response(
                result["status"],
                {
                    "error": result["message"],
                    "current": result["current"],
                },
            )
            return

        self._json_response(200, result["wrapper"])

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        content_length = self.headers.get("Content-Length")
        try:
            total = int(content_length) if content_length else 0
        except ValueError:
            total = 0

        if total <= 0:
            self._json_response(400, {"error": "Request body required"})
            return

        body, parse_error = _parse_json_body(self.rfile.read(total))
        if parse_error:
            self._json_response(400, {"error": parse_error})
            return
        assert body is not None

        if parsed.path == "/api/auth/signup":
            status, payload = _handle_signup(body)
            self._json_response(status, payload)
            return

        if parsed.path == "/api/auth/login":
            status, payload = _handle_login(body)
            self._json_response(status, payload)
            return

        self._json_response(404, {"error": "Not Found"})

    def _json_response(self, status: int, payload: Dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(encoded)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve PEACH app + centralized state API")
    parser.add_argument("port", nargs="?", type=int, default=8080)
    parser.add_argument("--host", default="0.0.0.0")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with STATE_LOCK:
        _read_wrapper()
    with AUTH_LOCK:
        _read_auth_store()

    with ThreadingHTTPServer((args.host, args.port), PeachHandler) as server:
        print(f"PEACH server listening on http://{args.host}:{args.port}")
        print("Central state API: GET/PUT /api/state")
        print("Auth API: POST /api/auth/signup, POST /api/auth/login")
        server.serve_forever()


if __name__ == "__main__":
    main()
