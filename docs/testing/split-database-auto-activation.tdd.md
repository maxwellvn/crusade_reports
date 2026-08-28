# Split database auto-activation — TDD evidence

## User journey

As an operator, I want the application to activate a verified sibling registrations database after an offline split, so registrations no longer overload report and dashboard requests without risking a stale database pairing.

## Evidence

| Guarantee | Test | Result |
|---|---|---|
| Explicit database configuration remains authoritative | `server/databasePaths.test.js` | PASS |
| A monolithic reports database never activates an unrelated sibling registrations file | `server/databasePaths.test.js` | PASS |
| A report-only database automatically activates its sibling registrations database | `server/databasePaths.test.js` | PASS |

RED: `node --test server/databasePaths.test.js` failed because `server/databasePaths.js` did not exist.

GREEN: `node --test server/databasePaths.test.js server/exporter.test.js server/dashboardCache.test.js` passed all seven tests.

Build: `npm run build` passed. The production data migration remains a separately verified operational step; the code change alone does not split or delete any database data.
