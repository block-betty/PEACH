# PEACH

**Protected Equipment Access Control Hub** — a single-page Lock Out Tag Out (LOTO) tracker built with plain HTML, CSS, and JavaScript. Designed to deploy on any static host with no build step and no server-side runtime.

---

## Features

### Toolbar (left sidebar)

- **PEACH Dashboard** — returns to the main dashboard view (closes any open panel).
- **Create Lock Event** — apply a red (Life on the Line) or green (Configuration Control) lock against a piece of equipment. Captures locked-by, lock timestamp, expected removal date, reason, lock type, and per-event safety verification checks.
- **Manage Master Equipment List** — add equipment by hand or bulk-upload from Excel (`.xlsx` / `.xls`); upserts by asset number. Filterable by building.
- **Check Out Lock** — issue a physical lock (red, green, blue, silver) with a lock number to a user from the user index, track returns, and view per-user assignment counts.
- **Manage Users** — index of external personnel (Authorized User / Affected User / Equipment Controller) used for assigning lock events and lock checkouts. Required fields: type, call sign, first name, last name, department (dropdown), supervisor, phone, cell phone, LOTO training date.
- **Reports** — five operational reports (see below).

### Dashboard view

- **At a Glance** — running counts for Active Locks, Red/Green Locks, Overdue Locks, Master Equipment, Locks Checked Out, Indexed Users.
- **Locks by Building** — active lock events grouped by building, counted per color (only colors with count > 0 are shown).
- **Locks by Department** — active lock events grouped by the assigned user's department (matched by name against the user index; unmatched names bucket to "Unassigned").
- **Active Lock Dashboard** — card view of every open lock with overdue flagging.
- **Completed Lock Catalog** — historical record of removed locks.
- **Audit Log** — every state-changing action is recorded with timestamp, actor, and details.

### Reports

1. **Overdue LOTO Training** — users whose training date is older than one year, plus users with no training date on file.
2. **Aged Locks** — active lock events older than 30 days that have not been removed.
3. **Excessive Locks** — users with more than five active lock events (matched by name).
4. **Configuration Warning** — buildings with more than ten active lock events.
5. **Lock Collector** — users holding a green lock for more than three days who have no matching active lock event.

### Access control

The application is gated by a password overlay. The password is stored as a SHA-256 hash in `config.js`; the plaintext is never written to source. Auth state lives in `sessionStorage`, so closing the tab requires re-login. A "Lock Application" button in the sidebar footer logs out manually. **See the Security Notice below — this is a soft gate, not real authentication.**

---

## Files

| File | Purpose |
| ---- | ------- |
| `index.html` | Page structure: sidebar, banner, dashboard panels, modals for each managed feature, login overlay. |
| `styles.css` | Theme (Times New Roman, navy + gold brand palette), layout, modal/dialog styles, responsive rules. |
| `config.js` | All runtime configuration: app text, password hash, building/equipment/department lists, lock colors, lock types, user types, theme colors, safety check labels. |
| `app.js` | All application logic: form handlers, render functions, reports, auth gate, localStorage persistence, audit log. |
| `assets/peach-logo.png` | Application logo. |
| `LOTO.html` | Convenience redirect to `index.html`. |

External script loaded at runtime: `xlsx@0.18.5` from `cdn.jsdelivr.net` (used by the Excel bulk upload feature only). See **Government Deployment** below.

---

## Run Locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Any static file server works — Python is just convenient because it ships with macOS / most Linux distros and avoids installing anything.

---

## Deploy

This is a pure static app. Deploy by uploading the files in this folder as-is to any static host:

- GitHub Pages
- Netlify
- Vercel (static)
- AWS S3 static website hosting
- IIS / Apache / nginx serving from a directory
- Local file share or USB drive (works straight from `index.html` opened in a browser)

There is no build step, no package manager, and no server-side dependency.

---

## Configuration

All operator-tunable values live in `config.js`. Edit and redeploy to change:

- `appTitle`, `appKicker`, `appSubtitle`, `quickNotes` — branding text.
- `passwordHash` — SHA-256 of the application password. Default password is set in source. Rotate via:

  ```bash
  printf '%s' 'new-password-here' | shasum -a 256
  ```

  Replace the `passwordHash` value with the resulting hex digest.
- `sessionKey`, `storageKey` — `sessionStorage` and `localStorage` keys (change to invalidate existing sessions / data).
- `buildingFilters` — building list used in equipment forms and filters.
- `equipmentClasses` — equipment class options.
- `lockColors` — physical lock colors available in Check Out Lock (id, label, hex).
- `userTypes` — non-admin user categories.
- `departments` — department dropdown options for the user index.
- `lockTypes` — lock event categories (red / green) and their UI labels.
- `theme` — color tokens.
- `applySafetyChecks` — the list of checkbox prompts shown when applying a lock.
- `removeWarningText`, `removeVerificationLabel`, `removeConfirmationTitle` — lock removal modal text.

---

## Data Storage

All tracker state (equipment, active locks, lock history, audit log, users, lock checkouts) lives in the browser's `localStorage` under the key from `config.js`. There is no backend. Data is per-browser, per-device — clearing site data wipes the application state.

---

## Security Notice

The password gate is a **client-side soft gate**, not real authentication:

- The password hash and all application code are visible to anyone who views source.
- A user with browser DevTools can bypass the overlay (delete the element or set the session flag manually).
- All tracker data sits unencrypted in `localStorage` and is readable by any code running in the browser.

This is sufficient to deter casual access on a shared workstation. **It is not sufficient for any threat model that includes a determined or technically capable user, and would not pass a serious security review.** Real access control requires a backend service that authenticates users and stores data server-side.

---

## Government Deployment

The app is intentionally simple to maximize deployability into restricted environments (no Node, no npm, no build, no framework). Two notes for government / air-gapped deployment:

1. **Excel bulk upload uses a CDN script.** `index.html` loads `xlsx` from `cdn.jsdelivr.net`. Networks that block external CDNs will silently disable the Excel upload feature — everything else still works. To deploy fully offline, vendor the file: download `xlsx.full.min.js` from the SheetJS distribution, place it under `assets/`, and change the `<script src=...>` in `index.html` to point at the local copy.
2. **No telemetry, no analytics, no outbound calls** other than the CDN script above.

---

## Browser Support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). The auth gate uses `window.crypto.subtle` (SHA-256), which is available everywhere except over plain `http://` on non-localhost origins — deploy via `https://` or `http://localhost`.
