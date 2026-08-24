# Crusade Reports

Single Node app (Express) serving a React + shadcn form that captures crusade reports.

- **DB:** SQLite (`better-sqlite3`) — file at `data/reports.sqlite`, WAL mode, with automatic verified snapshots and guarded restores.
- **Data model:** `reports` (submitter/context) + `crusades` **fact table** (one row per crusade, the single source of truth). Every metric is stored once, per crusade; all dashboards aggregate from `crusades` with `GROUP BY` — no derived columns to drift. Attribution (zone/group/church/network) is denormalized onto each crusade so any hierarchy level rolls up with a plain `SUM` (reported once → rolls up).
- **Form:** a 3-step stepper (Reporting → Crusades → Review). Countries and 34,000+ cities are served locally; one row = one crusade (no bulk multiplier); soft plausibility warnings.
- **Import:** app-generated `.xlsx` template (category dropdown and instructions) → upload → preview + row errors → load the validated rows into the report form for review and normal submission. Template and validator share `client/src/lib/constants.js` so they never drift.
- **Places:** country and city search is local and makes no Google Places requests. The bundled GeoNames catalogue includes coordinates; users can still type smaller places manually.
- **Translation:** Public pages translate only after the visitor chooses a language. Results persist in SQLite so the same text is not purchased again after a restart. `GOOGLE_TRANSLATE_API_KEY` is optional and never sent to the browser.
- **Zones/groups:** fetched from `ZONES_URL`, normalized, cached 5 minutes in memory + `data/zones_cache.json` fallback.
- **Networks:** stored in SQLite. Edit `server/seed.js` and re-run `npm run seed` to add more.

## Run

```bash
npm install
cp .env.example .env      # configure the services you use
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
| GET  | `/api/networks` | list approved networks |
| GET  | `/api/zones` · `/api/zones/groups?zone=` | zones / groups |
| GET  | `/api/places/autocomplete?input=&country=` | local city search |
| GET  | `/api/translation/languages` | public page-translation language list |
| POST | `/api/translation/translate` | server-side Google Translation proxy |
| GET  | `/api/import/template` | download the `.xlsx` import template |
| POST | `/api/import` | validate a filled template and return rows to the report form for review |
| GET  | `/api/auth/kingschat/login` | start KingsChat dashboard sign-in |
| GET  | `/api/auth/accounts` | list approved dashboard usernames |
| GET · PUT | `/api/campaign-settings` | public reporting status · super-admin reporting toggle |

Report fields and structure: see `report_schema.json`.

Dashboard access is KingsChat-based. Only `@maxwellvn` can list, verify, add,
or remove approved dashboard accounts. Tokens and API keys belong only in the
ignored `.env` or ignored runtime token storage, never in source files.

The reporting toggle also gates server submissions. When reporting is closed,
private zone/network dashboards hide their Reports tab and the standalone
report form shows a closed notice. Private dashboard links scope registrations
and unregistered-crusade reports to the correct zone or network.

## Notes / deferred

- Report submissions support photo links, video links, and verified JPEG, PNG, WebP, GIF, HEIC, or HEIF photo uploads. Uploaded report photos are private to approved report administrators.
- Errors: full stack + context logged server-side (pino); the client only ever sees a safe message.

## Deploy (Coolify)

Dockerfile-based. In Coolify:

1. New resource → this git repo → build pack **Dockerfile** (port 4000).
2. Env vars: `KINGSCHAT_CLIENT_ID` and `KINGSCHAT_REDIRECT_URI`; optionally `GOOGLE_TRANSLATE_API_KEY` for visitor-selected translations (see `.env.example`).
3. **Persistent storage**: mount a volume at `/app/data` — the SQLite database, resource files, and report photos (`/app/data/report-photos`) live there; without it, data resets on every deploy.
4. **Proxy upload limit**: set the Coolify/Traefik request body limit to at least **55MB** so the proxy can accept the application's 50MB combined report-photo allowance plus multipart overhead. A proxy `413` means this setting is lower than the application limit.
5. Health check: `GET /api/health` (already declared in the Dockerfile).

Registration-triggered database snapshots are coalesced to one verified backup every five minutes so peak registration traffic does not repeatedly copy and integrity-check the full database. Set `DB_REGISTRATION_BACKUP_MIN_INTERVAL_MINUTES` to a different positive interval if needed; scheduled hourly protection is unaffected.

### Database protection and recovery

- The production container refuses to start if the configured database is outside `/app/data`.
- A consistency-checked backup is created at startup, every hour, and after registrations. Retention keeps 48 recent snapshots, 30 daily points, and 12 weekly points.
- Super admins can create, download, upload, and restore backups at `/dashboard/database-protection`.
- Restore uploads are checked with SQLite `PRAGMA quick_check`. Before replacement, the current live database is backed up; the verified restore is then applied during a clean application restart.
- Configure `DB_BACKUP_MIRROR_DIR` to a second mounted disk or remote filesystem. Backups stored only under `/app/data` protect against bad changes, but not loss of the server or its persistent volume. Also enable Coolify volume backups to external object storage.
