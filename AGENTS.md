# AGENTS.md

## Cursor Cloud specific instructions

ArbTrack is a Binom-style arbitrage tracker. Two services run together in dev:

- **Server** (`server/`): Node.js + Express + `better-sqlite3`. Serves the tracking endpoints (`/click/:key`, `/postback`, `/to-offer`) and the JSON API under `/api/*` on port `3001`.
- **Client** (`client/`): React 19 + Vite dev server on port `5173`, proxying `/api`, `/click`, `/postback`, `/to-offer` to the server (see `client/vite.config.js`).

### Run / build / test

Standard commands live in the root `package.json` and `README.md`. Key ones:

- Dev (both services): `npm run dev` (uses `concurrently`; server on 3001, client on 5173).
- Tests: `npm test --prefix server` (Node's built-in test runner; 15 tests covering tracking, API integration, bundles, pipeline).
- Production build of the UI: `npm run build` (outputs `client/dist/`, which the server auto-serves if present).
- There is **no lint script** configured in this repo.

### Non-obvious notes

- The SQLite DB is created automatically on server start (`server/src/db.js` runs `initSchema()`); no migration step is needed. The DB file lives at `server/data/arbtrack.db` and is git-ignored.
- To get demo data (campaigns, offers, sources, clicks, conversions, bundles) in the dashboard, run `npm run seed --prefix server`. It is idempotent — it skips if campaigns/bundles already exist.
- Core tracker functionality (campaigns, offers, landings, sources, clicks, postbacks, stats, bundles) needs **no external tokens or secrets**.
- Optional integrations (LeadGid, Yandex Direct, Yandex Wordstat, Cursor Agents pipeline) require tokens in a root `.env` / `SECRETS.env` (see `.env.example`). These are only needed for the `pipeline`, `setup:ppm`, `check:leadgid`, and Wordstat features — not for running or testing the core app. Env is loaded via `server/src/lib/env.js` from the repo root, priority: `.env` → `env.local` → `SECRETS.env`.
- `better-sqlite3` is a native module installed via prebuilt binaries; a fresh `npm install` pulls the right binary for Node 22.
