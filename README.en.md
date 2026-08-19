# dsh-multi-user

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](README.md) | English

Single-process multi-user **workspace view partitioning** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI: a JWT login wall, per-user workspace/session filtering, and user management.

## Features

- **JWT login wall**: after mounting, visiting `/` first hits the login wall. With no owner set it shows an initialization page; otherwise a login page. On success the plugin self-signs a JWT into an HttpOnly cookie and redirects back to `/`.
- **Per-user workspace partitioning**: each user sees only the workspace directories they were granted; sessions are filtered by the same source.
- **User management**: the owner is set up via setup; other users are added and granted workspace directories through the admin API.

> **Security boundary**: this is **view partitioning + lightweight login**, not isolation. All users in one process share the same `workspaceRegistry` / `sessionPersistence`; `userId` is only a display filter. Anyone with direct filesystem access to the host can see everything.

## Architecture

```
Browser ──► dsh web (127.0.0.1:3080)
             │
             ├─ Host entry src/host/index.ts: login wall (webServer route) + user mgmt API + JWT signing
             ├─ Client entry src/client/index.ts: identity via /api/mu/me/grants + sidebar.workspaces filtering
             └─ Data: $DSH_HOME/plugins-data/dsh-multi-user/ (settings/users/tenants)
```

Identity flow: **authentication calls the backend** (login wall + JWT signing + HttpOnly cookie); **partitioning does not re-verify** (the client fetches `/api/mu/me/grants` once to get userId/role/granted directory list — the browser carries the HttpOnly cookie automatically and the Host verifies it; the client filters workspaces locally).

> **Design note**: the JWT lives in an **HttpOnly cookie** (invisible to `document.cookie`, avoiding XSS token theft). The client therefore does **not** read the cookie — it fetches `/api/mu/me/grants` for identity and grants, the single "who am I" call, same in nature as reading workspace data via `useWorkspaces`.

## Install

```bash
# via npm
npx @deepseek-ai/dsh plugin --profile web add dsh-multi-user

# from GitHub
npx @deepseek-ai/dsh plugin --profile web add github:nabin-qq273274877/dsh-multi-user

# local dev (link)
npx @deepseek-ai/dsh plugin --profile web add link:/path/to/dsh-multi-user
```

Then restart `dsh web` and refresh the page. The Host row is auto-mounted via `dsh.bundle.patch`, and the Client half is scanned into `window.__DSH_BOOT__` via the `dsh.client` field — no manual `cordis.patch.yml` edits required.

## Uninstall

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-multi-user
```

After removal `sidebar.workspaces` returns to the official occupant and the full view is restored; plugin data (`$DSH_HOME/plugins-data/dsh-multi-user/`) is retained.

## First use

1. Visit `http://127.0.0.1:3080/` → the initialization page appears; set the owner.
2. Redirected to the login page → log in as the owner → enter DSH.
3. The owner adds sub-users and grants workspace directories via `/api/mu/admin/*`.

## HTTP API

| Method | Path | Description |
|---|---|---|
| POST | `/api/mu/auth/password` | Password login (writes JWT cookie on success) |
| POST | `/api/mu/auth/logout` | Logout (clears cookie) |
| GET | `/api/mu/auth/me` | Current identity |
| GET | `/api/mu/public/config` | Public config (lifecycle state) |
| POST | `/api/mu/admin/owner` | Initialize owner (fresh state) |
| GET | `/api/mu/me/grants` | Current user identity + granted directory list |
| GET/POST | `/api/mu/admin/users` | List / create sub-users |
| POST | `/api/mu/admin/users/update` | Update user (status/display name) |
| POST | `/api/mu/admin/users/grants` | Grant workspace directories |
| POST | `/api/mu/admin/users/reset-password` | Reset password |
| POST | `/api/mu/admin/users/delete` | Delete user (anonymized retention) |

## Data storage

```
$DSH_HOME/plugins-data/dsh-multi-user/
├─ .jwt-secret            # JWT HMAC secret (0600, auto-generated)
├─ settings.json          # plugin settings (ownerUserId / auth)
├─ users.json             # user store (scrypt salted password hashes)
└─ tenants/<uid>/grants.json  # user → workspace directory list mapping
```

Native `workspaceRegistry` / `sessionPersistence` are never written; removal restores everything.

## Development

```bash
git clone https://github.com/nabin-qq273274877/dsh-multi-user.git
cd dsh-multi-user
pnpm install
pnpm run build      # esbuild bundles to lib/

# link into a DSH profile for live testing
npx @deepseek-ai/dsh plugin --profile web add link:$(pwd)
```

## Project structure

```
src/
├─ types.ts              # shared type definitions
├─ jwt.ts                # JWT sign/verify (HMAC-SHA256, zero deps)
├─ store.ts              # data store façade (scrypt + atomic JSON writes)
├─ lifecycle.ts          # fresh / admin-set state machine
├─ host/
│  └─ index.ts           # host plugin: login wall route + user mgmt API
└─ client/
   └─ index.ts           # client plugin: identity + sidebar.workspaces filtering
scripts/
└─ build.ts              # esbuild: host ESM + client factory bundle
```

## License

[MIT](LICENSE)
