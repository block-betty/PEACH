# PEACH

PEACH (Protected Equipment Access Control Hub) is a lightweight LOTO tracker with centralized persistence and built-in local authentication.

## Quick Start

```bash
python3 central_server.py 8090
```

Open `http://127.0.0.1:8090`.

This serves:
- Static app files
- Shared state API: `GET/PUT /api/state`
- Auth API: `POST /api/auth/signup`, `POST /api/auth/login`

## Default Super Admin Account

A bootstrap Super Admin account is created automatically by the local server:

- Login ID: `Admin`
- Password: `PeachSuperAdmin13!#`

Important:
- Super Admin is hidden from signup.
- Maximum Super Admin accounts allowed: `2`.
- Change this bootstrap credential before production use.

## User Groups and Access Levels

- `Super Admin`: full read/write/edit/delete, add/remove users.
- `Supervisor`: read/write, add users, no edit, no delete.
- `Controlling Organization`: read/write/edit, add users, no delete.
- `Authorized User`: basic read/write access.

## Authentication Behavior

- Login and signup are separate views (only one form visible at a time).
- Signup requires valid email and strong password.
- Super Admin cannot be self-created through signup.

## Centralized Data

Shared state includes:
- Equipment master list
- Lock master list
- Active lock events
- Completed lock history
- User index
- Lock checkout history
- Audit records

## Config

Primary runtime settings are in `config.js`:
- `apiBasePath` defaults to `/api` for local server mode.
- `firebase.enabled` can be turned on if you want managed cloud auth/storage.

## Government Approval Considerations

Potential concerns for strict government security reviews:
- Bootstrap credentials in source must be rotated and managed securely.
- Role enforcement for UI actions exists in client logic; hardened server-side authorization for every write path is still recommended.
- If your environment requires immutable audit controls, add tamper-evident audit export/WORM retention.
- If MFA/SSO is required by contract, integrate enterprise identity rather than local password auth.

