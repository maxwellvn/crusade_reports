# Admin report permissions and media — TDD evidence

## Source and journeys

No plan file was supplied. The journeys were derived from the reported defects:

- An administrator assigned **Edit reports** can open the reports list, edit every report field, add photos, and update photo/video links.
- An administrator assigned an admin page can use that page's supporting API instead of being rejected by a super-admin-only guard.

## Task report

| Behaviour | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Assigned report editors reach the real edit endpoint | `npm test -- --test-name-pattern='assignable admin pages use their delegated permission middleware'` failed with `SUPER_ADMIN_REQUIRED` for `crusades/edit`. | The same command passed after the route adopted `requirePageAccess("crusades/edit")`. | The route uses the permission configured in Settings. |
| Assigned admin pages use delegated permissions | The route-level test exposed the first super-admin-only assigned endpoint. | The route matrix passes for Edit reports, Manual organisations, Media training, Mission trips, Resources admin, both Blue Elite pages, and Backups. | Each tested page permission is accepted by its actual Express route middleware. |
| Admin report editing supports photos and links | `npm test -- --test-name-pattern='admin report editing uses the shared multipart photo workflow'` failed because the edit form lacked `ReportMediaFields`. | The test passes with the shared media fields and multipart PUT handler installed. | Editors can add report photos and edit multiline photo/video links using the same upload limits as other report forms. |
| Every displayed metric is saved | The multipart workflow test failed because the save payload iterated outcome groups and omitted `online_participation`. | The test passes after the payload iterates `METRIC_KEYS`. | Online participation and all other report metrics are included when saving. |

## Final verification

| Command | Type | Result |
|---|---|---|
| `npm test` | Unit/integration | PASS — 56 tests passed, 0 failed |
| `npm run build` | Production build | PASS — Vite transformed 1,741 modules and emitted the production bundle |
| `git diff --check` | Diff hygiene | PASS |

## Coverage and known gaps

The project does not define a coverage command, so no percentage was reported. Authorization is covered at the actual Express middleware layer; the React integration is additionally verified by the production build and source-level workflow regression. Browser E2E remains a future enhancement because the affected pages require a live KingsChat-authenticated session.

No checkpoint commits were created because the working tree already contained unrelated user changes; the RED/GREEN evidence is preserved here instead.
