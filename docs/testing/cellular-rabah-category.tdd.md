# Cellular and RABAH category merge

## User journeys

- As an administrator, I see cell registrations and RABAH crusades in one cellular reporting category.
- As an administrator, I can drill into a merged cellular figure and see the same records used to calculate it.
- As a data owner, I retain every original organization type, event type, report link, and RABAH outcome value.

## Test specification

| Guarantee | Test | Result | Evidence |
|---|---|---|---|
| Cell registrations and RABAH event types form one union | `cell and RABAH registrations merge into one cellular category without double counting` | PASS | The fixture includes cell/mega, zone/RABAH, and cell/RABAH rows. |
| A row that is both cell-owned and RABAH is counted once | Same test | PASS | The merged planned total is `10`, not `15`, and the merged registration count is `3`. |
| Dashboard drill-down filtering returns the same merged population | Same test | PASS | The generated registration filter returns exactly the three union rows. |
| RABAH is no longer emitted as a second zone-breakdown category | `registered crusades are broken down by type and cellular level for each zone` | PASS | The RABAH amount remains in the total and merged cellular figure but not in `types`. |
| Existing cell hierarchy analysis still works | `cell analysis is structured by zone, group, church, and cell` | PASS | Existing hierarchy regression remains green. |
| Live Registrations and Planned-vs-Held use the same merged category | `cell and RABAH registrations merge into one cellular category without double counting` | PASS | Both dashboard sources emit `cellular`, omit raw `rabah`, and add the same union total. |

## RED/GREEN evidence

- RED: the first focused run failed because `cellularRegistrationsBy` was not exported or implemented as a merged union.
- GREEN: `npm test -- --test-name-pattern='registered crusades are broken down|cell and RABAH registrations merge|cell analysis is structured'` passed after implementation and again after refactoring.
- Full suite: `npm test` passed 58/58 tests.
- Build: `npm run build` passed; Vite emitted its existing large-chunk warning.
- Syntax/diff: `node --check server/routes/registrations.js && node --check server/routes/stats.js && node --check server/validation.test.js && git diff --check` passed.
- Review completion: the same focused test first failed because `registrationTypeBreakdown` did not exist, then passed after Live Registrations and Planned-vs-Held were routed through the merged category.

## Data-safety evidence

The implementation changes only `SELECT` predicates, response grouping, labels, and drill-down query parameters. It adds no migration and performs no production `INSERT`, `UPDATE`, `DELETE`, or `ALTER TABLE`. Test fixtures run inside a transaction and always roll back.

## Coverage and known issues

The repository has no coverage script, so no percentage is claimed. `npm audit --omit=dev` continues to report six pre-existing dependency advisories (one low, two moderate, three high); dependency upgrades are outside this data-safe category merge and one suggested path is breaking.
