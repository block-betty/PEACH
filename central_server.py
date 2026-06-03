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
SELF_SERVICE_ROLES = {"supervisor", "controlling_org", "authorized_user"}
ROLE_CAPABILITIES = {
    "super_admin": {"view_dashboard", "sync_state"},
    "supervisor": {"view_dashboard", "sync_state"},
    "controlling_org": {"view_dashboard", "sync_state"},
    "authorized_user": {"view_dashboard", "sync_state"},
}
MAX_SUPER_ADMINS = 4
PBKDF2_ITERATIONS = 250_000
SESSION_TTL_HOURS = 8
AUTH_SESSIONS: Dict[str, Dict[str, Any]] = {}
SUPER_ADMIN_EMAIL = "admin"
SUPER_ADMIN_PASSWORD = "PeachSuperAdmin13!#"
TEST_USER_PASSWORD = "PeachTestUser13!#"
TEST_AUTH_USERS = [
    ("test-super-admin-1@peach.local", "Test Super Admin 1", "super_admin"),
    ("test-super-admin-2@peach.local", "Test Super Admin 2", "super_admin"),
    ("test-super-admin-3@peach.local", "Test Super Admin 3", "super_admin"),
    ("test-supervisor-1@peach.local", "Test Supervisor 1", "supervisor"),
    ("test-supervisor-2@peach.local", "Test Supervisor 2", "supervisor"),
    ("test-supervisor-3@peach.local", "Test Supervisor 3", "supervisor"),
    ("test-controlling-org-1@peach.local", "Test Controlling Org 1", "controlling_org"),
    ("test-controlling-org-2@peach.local", "Test Controlling Org 2", "controlling_org"),
    ("test-controlling-org-3@peach.local", "Test Controlling Org 3", "controlling_org"),
    ("test-authorized-user-1@peach.local", "Test Authorized User 1", "authorized_user"),
    ("test-authorized-user-2@peach.local", "Test Authorized User 2", "authorized_user"),
    ("test-authorized-user-3@peach.local", "Test Authorized User 3", "authorized_user"),
]


def seed_state() -> Dict[str, Any]:
    now = utc_now_iso()
    locked_at = "2026-06-01T14:00:00Z"
    expected_at = "2026-06-04T14:00:00Z"
    return {
        "equipment": [
            {
                "id": "EQ-TEST-001",
                "building": "494",
                "location": "494",
                "locationDetail": "Central Plant",
                "roomNumber": "M-101",
                "equipmentClass": "Pump",
                "name": "Primary Chilled Water Pump",
                "description": "Test pump record for LOTO validation.",
                "assetNumber": "TST-EQ-001",
                "createdAt": now,
            },
            {
                "id": "EQ-TEST-002",
                "building": "495",
                "location": "495",
                "locationDetail": "Electrical Room",
                "roomNumber": "E-210",
                "equipmentClass": "Breaker",
                "name": "Main Distribution Breaker",
                "description": "Test breaker record for LOTO validation.",
                "assetNumber": "TST-EQ-002",
                "createdAt": now,
            },
            {
                "id": "EQ-TEST-003",
                "building": "460",
                "location": "460",
                "locationDetail": "Mechanical Penthouse",
                "roomNumber": "PH-1",
                "equipmentClass": "AHU",
                "name": "Air Handler Unit 3",
                "description": "Test AHU record for LOTO validation.",
                "assetNumber": "TST-EQ-003",
                "createdAt": now,
            },
        ],
        "activeLocks": [
            {
                "id": "LOCK-TEST-001",
                "equipmentId": "EQ-TEST-001",
                "equipmentName": "Primary Chilled Water Pump",
                "equipmentBuilding": "494",
                "equipmentLocationDetail": "Central Plant",
                "equipmentRoomNumber": "M-101",
                "equipmentClass": "Pump",
                "assetNumber": "TST-EQ-001",
                "lockType": "red",
                "lockNumber": "T-101",
                "lockMasterId": "LCK-TEST-001",
                "lockMasterColor": "Red",
                "lockLocationId": "LOC-TEST-001",
                "lockLocationBuilding": "494",
                "lockLocationRoom": "M-101",
                "lockLocationDescription": "Central Plant Lock Board",
                "lockedBy": "Avery Stone",
                "lockedAt": locked_at,
                "expectedRemovalAt": expected_at,
                "reason": "Test lock event for pump maintenance.",
                "keyLocation": "",
                "createdAt": now,
                "safetyChecklist": {"1_energy_sources_isolated": True, "2_zero_energy_state_verified": True, "3_affected_workers_notified": True},
            },
            {
                "id": "LOCK-TEST-002",
                "equipmentId": "EQ-TEST-002",
                "equipmentName": "Main Distribution Breaker",
                "equipmentBuilding": "495",
                "equipmentLocationDetail": "Electrical Room",
                "equipmentRoomNumber": "E-210",
                "equipmentClass": "Breaker",
                "assetNumber": "TST-EQ-002",
                "lockType": "green",
                "lockNumber": "T-102",
                "lockMasterId": "LCK-TEST-002",
                "lockMasterColor": "Green",
                "lockLocationId": "LOC-TEST-002",
                "lockLocationBuilding": "495",
                "lockLocationRoom": "E-210",
                "lockLocationDescription": "Electrical Lock Cabinet",
                "lockedBy": "Blake Rivers",
                "lockedAt": locked_at,
                "expectedRemovalAt": expected_at,
                "reason": "Test lock event for configuration control.",
                "keyLocation": "Key cabinet 495-E",
                "createdAt": now,
                "safetyChecklist": {"1_energy_sources_isolated": True, "2_zero_energy_state_verified": True, "3_affected_workers_notified": True},
            },
            {
                "id": "LOCK-TEST-003",
                "equipmentId": "EQ-TEST-003",
                "equipmentName": "Air Handler Unit 3",
                "equipmentBuilding": "460",
                "equipmentLocationDetail": "Mechanical Penthouse",
                "equipmentRoomNumber": "PH-1",
                "equipmentClass": "AHU",
                "assetNumber": "TST-EQ-003",
                "lockType": "red",
                "lockNumber": "T-103",
                "lockMasterId": "LCK-TEST-003",
                "lockMasterColor": "Blue",
                "lockLocationId": "LOC-TEST-003",
                "lockLocationBuilding": "460",
                "lockLocationRoom": "PH-1",
                "lockLocationDescription": "Penthouse Lock Station",
                "lockedBy": "Casey Morgan",
                "lockedAt": locked_at,
                "expectedRemovalAt": expected_at,
                "reason": "Test lock event for AHU inspection.",
                "keyLocation": "",
                "createdAt": now,
                "safetyChecklist": {"1_energy_sources_isolated": True, "2_zero_energy_state_verified": True, "3_affected_workers_notified": True},
            },
        ],
        "lockHistory": [],
        "audit": [
            {
                "id": "AUD-TEST-SEED",
                "timestamp": now,
                "action": "TEST_DATA_SEEDED",
                "actor": "System",
                "details": "Seeded PEACH demo records for users, equipment, locks, locations, and lock master data.",
            }
        ],
        "users": [
            {"id": "USR-TEST-AUTH-001", "type": "authorized", "firstName": "Avery", "lastName": "Stone", "department": "Critical Systems", "supervisor": "Jordan Lee", "phone": "555-0101", "cellPhone": "555-1101", "callSign": "AUTH-1", "trainingDate": "2026-05-01", "createdAt": now},
            {"id": "USR-TEST-AUTH-002", "type": "authorized", "firstName": "Blake", "lastName": "Rivers", "department": "Electrical", "supervisor": "Jordan Lee", "phone": "555-0102", "cellPhone": "555-1102", "callSign": "AUTH-2", "trainingDate": "2026-05-02", "createdAt": now},
            {"id": "USR-TEST-AUTH-003", "type": "authorized", "firstName": "Casey", "lastName": "Morgan", "department": "HVAC", "supervisor": "Jordan Lee", "phone": "555-0103", "cellPhone": "555-1103", "callSign": "AUTH-3", "trainingDate": "2026-05-03", "createdAt": now},
            {"id": "USR-TEST-AFF-001", "type": "affected", "firstName": "Drew", "lastName": "Parker", "department": "Operations", "supervisor": "Taylor Kim", "phone": "555-0201", "cellPhone": "555-1201", "callSign": "AFF-1", "trainingDate": "2026-05-04", "createdAt": now},
            {"id": "USR-TEST-AFF-002", "type": "affected", "firstName": "Emery", "lastName": "Quinn", "department": "Safety", "supervisor": "Taylor Kim", "phone": "555-0202", "cellPhone": "555-1202", "callSign": "AFF-2", "trainingDate": "2026-05-05", "createdAt": now},
            {"id": "USR-TEST-AFF-003", "type": "affected", "firstName": "Finley", "lastName": "Reed", "department": "Projects", "supervisor": "Taylor Kim", "phone": "555-0203", "cellPhone": "555-1203", "callSign": "AFF-3", "trainingDate": "2026-05-06", "createdAt": now},
            {"id": "USR-TEST-CTRL-001", "type": "controller", "firstName": "Harper", "lastName": "Sloan", "department": "Controls", "supervisor": "Morgan Hale", "phone": "555-0301", "cellPhone": "555-1301", "callSign": "CTRL-1", "trainingDate": "2026-05-07", "createdAt": now},
            {"id": "USR-TEST-CTRL-002", "type": "controller", "firstName": "Jordan", "lastName": "Vale", "department": "Engineering", "supervisor": "Morgan Hale", "phone": "555-0302", "cellPhone": "555-1302", "callSign": "CTRL-2", "trainingDate": "2026-05-08", "createdAt": now},
            {"id": "USR-TEST-CTRL-003", "type": "controller", "firstName": "Kendall", "lastName": "Wynn", "department": "Critical Infrastructure", "supervisor": "Morgan Hale", "phone": "555-0303", "cellPhone": "555-1303", "callSign": "CTRL-3", "trainingDate": "2026-05-09", "createdAt": now},
        ],
        "lockCheckouts": [],
        "lockMaster": [
            {"id": "LCK-TEST-001", "number": "T-101", "colorId": "red", "colorLabel": "Red", "building": "494", "locationDetail": "Central Plant", "roomNumber": "M-101", "keyLocation": "", "notes": "Seed red lock.", "createdAt": now},
            {"id": "LCK-TEST-002", "number": "T-102", "colorId": "green", "colorLabel": "Green", "building": "495", "locationDetail": "Electrical Room", "roomNumber": "E-210", "keyLocation": "Key cabinet 495-E", "notes": "Seed green lock.", "createdAt": now},
            {"id": "LCK-TEST-003", "number": "T-103", "colorId": "blue", "colorLabel": "Blue", "building": "460", "locationDetail": "Mechanical Penthouse", "roomNumber": "PH-1", "keyLocation": "", "notes": "Seed blue lock.", "createdAt": now},
        ],
        "locations": [
            {"id": "LOC-TEST-001", "building": "494", "room": "M-101", "description": "Central Plant Lock Board", "createdAt": now},
            {"id": "LOC-TEST-002", "building": "495", "room": "E-210", "description": "Electrical Lock Cabinet", "createdAt": now},
            {"id": "LOC-TEST-003", "building": "460", "room": "PH-1", "description": "Penthouse Lock Station", "createdAt": now},
        ],
    }


def _merge_seed_rows(existing: list[Any], seed_rows: list[Dict[str, Any]]) -> Tuple[list[Any], bool]:
    rows = list(existing)
    existing_ids = {str(row.get("id") or "") for row in rows if isinstance(row, dict)}
    changed = False
    for row in seed_rows:
        row_id = str(row.get("id") or "")
        if row_id and row_id not in existing_ids:
            rows.append(row)
            existing_ids.add(row_id)
            changed = True
    return rows, changed


def ensure_seed_state(state: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    normalized = normalize_state(state)
    seed = seed_state()
    changed = False
    for key, seed_rows in seed.items():
        merged, key_changed = _merge_seed_rows(normalized.get(key, []), seed_rows)
        normalized[key] = merged
        changed = changed or key_changed
    return normalized, changed


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
        initial_state, _ = ensure_seed_state(default_state())
        wrapper = {
            "version": 0,
            "updatedAt": utc_now_iso(),
            "state": initial_state,
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

    normalized_state, seeded = ensure_seed_state(normalize_state(state))
    wrapper = {
        "version": version_int,
        "updatedAt": updated_at,
        "state": normalized_state,
    }
    if seeded:
        wrapper["version"] = version_int + 1
        wrapper["updatedAt"] = utc_now_iso()
        _atomic_write_json(STATE_FILE, wrapper)
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
        "roleRequest": user.get("roleRequest", {}),
    }


def _normalize_role_request(value: Any, role: str, now: str) -> Dict[str, str]:
    if isinstance(value, dict):
        requested_role = str(value.get("requestedRole") or role).strip().lower()
        if requested_role not in USER_ROLES:
            requested_role = role
        status = str(value.get("status") or "").strip().lower()
        if status not in {"not_required", "pending", "approved", "denied"}:
            status = "pending" if requested_role != role else "not_required"
        return {
            "requestedRole": requested_role,
            "status": status,
            "requestedAt": str(value.get("requestedAt") or now),
            "reviewedAt": str(value.get("reviewedAt") or ""),
            "reviewedBy": str(value.get("reviewedBy") or ""),
        }
    return {
        "requestedRole": role,
        "status": "not_required",
        "requestedAt": now,
        "reviewedAt": "",
        "reviewedBy": "",
    }


def _create_session(user: Dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    now = dt.datetime.now(dt.timezone.utc)
    expires_at = now + dt.timedelta(hours=SESSION_TTL_HOURS)
    AUTH_SESSIONS[token] = {
        "userId": str(user.get("id") or ""),
        "email": str(user.get("email") or ""),
        "displayName": str(user.get("displayName") or ""),
        "role": str(user.get("role") or "authorized_user"),
        "expiresAt": expires_at,
    }
    return token


def _session_from_authorization(header_value: str | None) -> Dict[str, Any] | None:
    if not header_value:
        return None
    parts = header_value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    session = AUTH_SESSIONS.get(token)
    if not session:
        return None
    expires_at = session.get("expiresAt")
    if not isinstance(expires_at, dt.datetime) or expires_at <= dt.datetime.now(dt.timezone.utc):
        AUTH_SESSIONS.pop(token, None)
        return None
    return session


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
        row_updated_at = str(row.get("updatedAt") or utc_now_iso())
        normalized_users.append(
            {
                "id": str(row.get("id") or _new_user_id()),
                "email": str(row.get("email") or "").strip().lower(),
                "displayName": str(row.get("displayName") or "").strip(),
                "role": role,
                "roleRequest": _normalize_role_request(row.get("roleRequest"), role, row_updated_at),
                "password": row.get("password") if isinstance(row.get("password"), dict) else {},
                "createdAt": str(row.get("createdAt") or utc_now_iso()),
                "updatedAt": row_updated_at,
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
                "roleRequest": {
                    "requestedRole": "super_admin",
                    "status": "not_required",
                    "requestedAt": now,
                    "reviewedAt": "",
                    "reviewedBy": "",
                },
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

    existing_emails = {str(user.get("email") or "").strip().lower() for user in users}
    for email, display_name, role in TEST_AUTH_USERS:
        if email in existing_emails:
            continue
        users.append(
            {
                "id": _new_user_id(),
                "email": email,
                "displayName": display_name,
                "role": role,
                "roleRequest": {
                    "requestedRole": role,
                    "status": "not_required",
                    "requestedAt": now,
                    "reviewedAt": "",
                    "reviewedBy": "",
                },
                "password": _hash_password(TEST_USER_PASSWORD),
                "createdAt": now,
                "updatedAt": now,
                "lastLoginAt": "",
            }
        )
        existing_emails.add(email)
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
        return 403, {"error": "Super Admin cannot be requested from self-service signup."}
    if requested_role not in SELF_SERVICE_ROLES:
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

        role = "authorized_user"
        new_user = {
            "id": _new_user_id(),
            "email": email,
            "displayName": display_name,
            "role": role,
            "roleRequest": {
                "requestedRole": requested_role,
                "status": "pending" if requested_role != role else "not_required",
                "requestedAt": now,
                "reviewedAt": "",
                "reviewedBy": "",
            },
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
        session_token = _create_session(target)

    return 200, {"ok": True, "user": _public_user(target), "sessionToken": session_token}


class PeachHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
            session, auth_error = self._require_capability("view_dashboard")
            if auth_error:
                self._json_response(*auth_error)
                return
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

        session, auth_error = self._require_capability("sync_state")
        if auth_error:
            self._json_response(*auth_error)
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

        actor = str(body.get("actor") or session.get("email") or session.get("displayName") or "Unknown")
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

    def _require_capability(self, capability: str) -> Tuple[Dict[str, Any] | None, Tuple[int, Dict[str, Any]] | None]:
        session = _session_from_authorization(self.headers.get("Authorization"))
        if not session:
            return None, (401, {"error": "Authentication required."})
        role = str(session.get("role") or "authorized_user")
        allowed = ROLE_CAPABILITIES.get(role, set())
        if capability not in allowed:
            return None, (403, {"error": "Insufficient role permissions."})
        return session, None

    def _json_response(self, status: int, payload: Dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
