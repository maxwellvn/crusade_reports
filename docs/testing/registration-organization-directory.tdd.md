# Registration organization directory enforcement

## User journeys

- As a public registrant, I can select an official zone and its official group without creating duplicate names.
- As an administrator, I can disable manual zone and group entry and have that choice enforced by the server, not only by the browser.
- As a zonal or network dashboard user, I can submit registrations for the organization already assigned by my valid private dashboard token.

## RED/GREEN evidence

| Guarantee | Test | RED evidence | GREEN evidence |
|---|---|---|---|
| Official zone/group names are canonicalized and client-supplied manual flags are ignored | `server/validation.test.js`: `registration organization values obey the server-side manual entry settings` | Initial focused run failed because `validateRegistrationOrganization` was not exported | Focused test and full suite pass |
| Unknown zones, unknown groups, and groups from another zone are rejected while manual entry is disabled | Same test | Initial focused run failed before the enforcement helper existed | Focused test and full suite pass |
| Explicitly enabled manual entry remains supported and is flagged for review | Same test | Initial focused run failed before the enforcement helper existed | Focused test and full suite pass |
| A valid private zonal-dashboard assignment remains trusted even if the public directory is stale | Same test | Focused run failed with `INVALID_ZONE` for `ASSIGNED PORTAL ZONE` | Focused test and full suite pass after the trusted-token path was added |

## Commands and results

- `npm test -- --test-name-pattern='registration organization values obey the server-side manual entry settings'`: RED before each implementation step, then PASS.
- `npm test`: PASS, 57/57 tests.
- `npm run build`: PASS. Vite reports the existing large-chunk warning.
- `node --check server/routes/registrations.js && node --check server/appSettings.js && git diff --check`: PASS.
- `npm audit --omit=dev`: reports six existing dependency advisories (one low, two moderate, three high); dependency upgrades were not included in this scoped fix.

## Coverage and known gaps

The project does not define a coverage script, so no coverage percentage is claimed. The regression directly exercises the new server-side organization policy and its relevant edge cases. Browser-level E2E coverage is not configured in the project test script.

## Merge evidence

No checkpoint commits were created during this working-tree fix. Preserve this report with the eventual commit so the two observed RED states and final GREEN commands remain reviewable.
