# Crusade Reports

Single Node app (Express) serving a React + shadcn form that captures crusade reports.

- **DB:** SQLite (`better-sqlite3`) — file at `data/reports.sqlite`, WAL mode. Back it up by copying the file.
- **Data model:** `reports` (submitter/context) + `crusades` **fact table** (one row per crusade, the single source of truth). Every metric is stored once, per crusade; all dashboards aggregate from `crusades` with `GROUP BY` — no derived columns to drift. Attribution (zone/group/church/network) is denormalized onto each crusade so any hierarchy level rolls up with a plain `SUM` (reported once → rolls up).
- **Form:** a 3-step stepper (Reporting → Crusades → Review). Countries browse-on-open from a static list; cities via Google Places; one row = one crusade (no bulk multiplier); soft plausibility warnings.
- **Import:** app-generated `.xlsx` template (category dropdown, instructions) → upload → preview + row errors → commit. Template and validator share `client/src/lib/constants.js` so they never drift.
- **Places:** Google Places API (New) proxied server-side (`GOOGLE_PLACES_API_KEY` in `.env`, never exposed to the browser). City search only; countries are a static ISO list (`/api/countries`).
- **Zones/groups:** fetched from `ZONES_URL`, normalized, cached 1h in memory + `data/zones_cache.json` fallback.
- **Networks:** stored in SQLite. Edit `server/seed.js` and re-run `npm run seed` to add more.

## Run

```bash
npm install
cp .env.example .env      # fill GOOGLE_PLACES_API_KEY
npm run seed              # create DB + seed networks (idempotent)

# Development (two processes, HMR + API on :4000):
npm run dev               # client :5173 proxies /api to server :4000

# Production (one process serves the built client + API):
npm run build
npm start                 # http://localhost:4000
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/health` | liveness |
| POST | `/api/reports` | submit a report (zod-validated; writes report + crusade fact rows) |
| GET  | `/api/reports` / `/api/reports/:id` | list / fetch (with crusades) |
| GET  | `/api/stats` | dashboard aggregates: totals + by category / zone / network / country / month |
| GET  | `/api/countries` | static ISO country list (browse-on-open) |
| GET  | `/api/networks` · POST | list / add network |
| GET  | `/api/zones` · `/api/zones/groups?zone=` | zones / groups |
| GET  | `/api/places/autocomplete?input=&country=` | Places city proxy |
| GET  | `/api/import/template` | download the `.xlsx` import template |
| POST | `/api/import` (`?commit=1`) | preview (validate) / commit a filled template |

Report fields and structure: see `report_schema.json`.

## Notes / deferred

- No file uploads — media captured as links (`media_links`). Add `multer` + storage when binary upload is needed.
- No admin/dashboard UI yet — data is queryable via `GET /api/reports` or the SQLite file directly.
- Errors: full stack + context logged server-side (pino); the client only ever sees a safe message.

## Deploy (Coolify)

Dockerfile-based. In Coolify:

1. New resource → this git repo → build pack **Dockerfile** (port 4000).
2. Env vars: `GOOGLE_PLACES_API_KEY`, `ZONES_URL`, `ADMIN_KEY` (see `.env.example`).
3. **Persistent storage**: mount a volume at `/app/data` — the SQLite database lives there; without it, data resets on every deploy.
4. Health check: `GET /api/health` (already declared in the Dockerfile).
