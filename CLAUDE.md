# Fantasy Football Tracker

One place to see all of a user's fantasy football leagues across ESPN and Sleeper. A user enters their
account credentials and the app discovers and loads every league, with no league IDs.

## Layout

- `backend/`: FastAPI (Python 3.11). Venv at `backend/.venv`.
  - `app/main.py`: routes and CORS. `app/models.py`: request/response models, the same shape for both platforms.
  - `app/espn_client.py`: ESPN leagues and waivers via the open-source `espn-api` library.
  - `app/sleeper_client.py`: Sleeper leagues and waivers via Sleeper's public API.
  - `app/nfl_client.py`: NFL schedule, byes and injury reports (ESPN public endpoints, no auth).
  - `app/teams.py`: NFL team abbreviation normalization.
  - `scripts/fetch_leagues.py`: CLI that calls the running API using credentials from `backend/.env`.
- `frontend/`: Next.js 16 + React 19 + Tailwind 4, TypeScript. Client components only.
  - `src/lib/`: API client, types (mirror `models.py`), credential storage, cross-league insights, NFL joins.
  - `src/components/`: UI. `Dashboard.tsx` is the root; `NflContext.tsx` provides NFL data to everything.

## Running

```bash
# backend (http://127.0.0.1:8000, docs at /docs)
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# frontend (http://localhost:3000)
cd frontend && npm run dev

# CLI against the running backend
cd backend && python scripts/fetch_leagues.py [--json] [--waivers --position RB]
```

`backend/.env` (git-ignored, local testing only) holds `ESPN_SWID`, `ESPN_S2`, `SLEEPER_USERNAME`.
Env vars: `ALLOWED_ORIGINS` (backend CORS, comma-separated), `NEXT_PUBLIC_API_URL` (frontend, optional: by
default the frontend calls `/api` on its own origin) and `API_PROXY_TARGET` (where `next dev` proxies `/api`,
default `http://127.0.0.1:8000`).

**Deploying:** `vercel.json` deploys both apps as one Vercel project with services. `/api/*` goes to the FastAPI
`backend` service (entrypoint `app.main:app`; it sees the full `/api/...` path) and everything else goes to
`frontend`. The browser calls the backend directly, so there are no service bindings. Vercel runs Python 3.12
(3.11 isn't offered). `vercel dev` runs both services locally (needs Vercel CLI 48.1.8+).

Checks: `cd frontend && npx eslint src && npx tsc --noEmit && npm run build`. If `tsc` complains about
`LayoutProps`, run the build first; Next generates that type.

## Core decisions (don't change without asking)

- **Never store or log user credentials on the server.** The backend is stateless: credentials arrive with
  each request and are discarded. The frontend keeps them in browser storage only (localStorage if
  "remember" is checked, sessionStorage otherwise).
- **Error messages must not echo credentials.** httpx errors include the request URL, and ESPN's fan API
  URL contains the SWID. Use `_safe_error_message` in `espn_client.py` for anything returned to users.
- **Read-only for now.** ESPN writes are possible through the unofficial `lm-api-writes` endpoint, and
  Sleeper has no public write API. The user chose to stay read-only.
- **Discover leagues, don't configure them.** ESPN: `fan.api.espn.com/apis/v2/fans/{SWID}` lists the
  account's leagues and team IDs. Sleeper: username → user ID → leagues. The season comes from Sleeper's
  `/state/nfl` unless a request specifies one.

## Data quirks

- **Credentials:** ESPN needs the `SWID` and `espn_s2` cookies (DevTools → Application → Cookies →
  `https://fantasy.espn.com`). `espn_s2` is a login session, so treat it like a password. Password login
  isn't possible because ESPN requires reCAPTCHA (see the comment in `espn_api/requests/espn_requests.py`).
- **Player matching:** ESPN and Sleeper player IDs differ, so cross-league matching uses normalized name
  plus position (`playerKey` in `frontend/src/lib/insights.ts`, `normalizeName` in `nfl.ts`): it strips
  Jr./III and punctuation. Defenses match by NFL team ("Titans D/ST" vs "Tennessee Titans").
- **Team abbreviations:** ESPN uses `WSH` and Sleeper uses `WAS`. Every backend response goes through
  `normalize_team`, so the API always says `WAS`.
- **Injuries:** Sleeper's player DB (~5 MB) is cached for 24h at Sleeper's request, so its injury statuses
  can be a day old. The frontend prefers ESPN's injury report (`effectiveInjuryStatus`) when a player
  appears there.
- **`espn-api` quirk:** `player.injuryStatus` can be `[]` instead of `None`; use `_injury_status()`.
- **Undocumented endpoints:** ESPN's endpoints (fan API, scoreboard, injuries, `proTeamSchedules_wl`) are
  undocumented. NFL data is cached server-side and shared by all users: games 60s, injuries 10 min (a
  manual refresh at most once a minute), byes 24h. Keep request volume low.
- **Sleeper lineups:** a starter slot of `"0"` means the slot is empty. IR and TAXI players can't start, so
  they're excluded from start/sit mismatch checks.

## Environment gotchas

- The project used to live in `~/Desktop/Projects/`, which syncs to iCloud with "Optimize Mac Storage" on
  a nearly full disk. macOS removed local copies of files, which then read as **empty**. If a file
  unexpectedly reads empty, run `ls -lO <file>` and look for `dataless` before editing; never rewrite a
  file from an empty read. An old stale copy may still exist on the Desktop. Work only in
  `~/Projects/fantasy-football-tracker`.
- Next.js 16 differs from older versions; read `frontend/node_modules/next/dist/docs/` before using
  unfamiliar APIs (see `frontend/AGENTS.md`).

## Deferred / ideas

- Interactive ESPN login: open a Playwright window, the user logs in, the app captures the cookies. This
  only works when running locally; a hosted site would need a cookie-paste guide or a browser extension.
- Sleeper as a fallback source for injuries and schedule if ESPN's endpoints break.
- Live per-player scoring, opponent lineups, transactions feed, showing ESPN's `RB/WR/TE` and `D/ST` as
  `FLEX` and `DEF`, and short-term caching of league data.
- On Vercel the in-memory caches (Sleeper player DB, NFL data) are per function instance, so they help less
  than on one long-running server. A shared cache (e.g. Redis) would restore the "keep request volume low" goal.
