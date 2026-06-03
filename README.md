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
- Maximum Super Admin accounts allowed: `4`.
- Change this bootstrap credential before production use.

## Seeded Test Accounts

The local server seeds test accounts for role testing. All test accounts use:

- Password: `PeachTestUser13!#`

Examples:
- Super Admin: `test-super-admin-1@peach.local` through `test-super-admin-3@peach.local` plus bootstrap `Admin`
- Supervisor: `test-supervisor-1@peach.local` through `test-supervisor-3@peach.local`
- Controlling Organization: `test-controlling-org-1@peach.local` through `test-controlling-org-3@peach.local`
- Authorized User: `test-authorized-user-1@peach.local` through `test-authorized-user-3@peach.local`

## User Groups and Access Levels

- `Super Admin`: full read/write/edit/delete, add/remove users.
- `Supervisor`: read/write, add users, no edit, no delete.
- `Controlling Organization`: read/write/edit, add users, no delete.
- `Authorized User`: basic read/write access.

## Authentication Behavior

- Login and signup are separate views (only one form visible at a time).
- Signup requires valid email and strong password.
- Self-service signup always grants `Authorized User` access by default.
- Requests for `Supervisor` or `Controlling Organization` are retained as pending role requests and must be reviewed before the stored role is elevated.
- Super Admin cannot be self-created or requested through signup.
- Local server login returns a short-lived bearer session used by `GET/PUT /api/state`; state access is rejected when the session is missing or expired.

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
- Seeded test accounts must be removed or disabled before any production, controlled, or government approval environment.
- The local server now requires authenticated sessions for central state sync, but state changes are still submitted as a whole JSON snapshot. For stricter authorization, replace whole-state `PUT /api/state` with server-owned per-action endpoints that enforce role permissions on each create/edit/delete operation.
- If your environment requires immutable audit controls, add tamper-evident audit export/WORM retention.
- If MFA/SSO is required by contract, integrate enterprise identity rather than local password auth.
