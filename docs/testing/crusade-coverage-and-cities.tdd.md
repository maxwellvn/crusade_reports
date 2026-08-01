# Crusade coverage and city creation — TDD evidence

## Source and journeys

Journeys were derived from the feature request:

- As an approved admin, I can compare every directory zone and group with crusade registrations, so I can identify gaps.
- As an admin, I can export the visible coverage list as CSV, Excel, or print-to-PDF.
- As a registrant, I can select a suggested city or explicitly add a missing city, so the form does not block uncommon locations.

## RED / GREEN evidence

| Guarantee | Test target | Type | Result |
|---|---|---|---|
| Directory entries are classified case-insensitively and totals aggregate by zone and group | `server/validation.test.js` — coverage comparison | Unit | PASS |
| Suggested city selections preserve their place ID; manually added cities clear it | `server/validation.test.js` — city selection | Unit | PASS |
| Existing validation and persistence behavior remains intact | `npm test` | Regression | 26/26 PASS |
| Production client compiles with the new route and form integrations | `npm run build` | Build | PASS |

The RED gate was captured in commit `3aab064`: the new test suite failed because `server/coverage.js` did not yet exist. The same target passed after implementation.

## Visual evidence

- Desktop: `/tmp/crusade-coverage-desktop.png`
- Mobile (390px): `/tmp/crusade-coverage-mobile.png`; verified document width equals viewport width.

## Coverage and known gaps

The project has no configured coverage command, so percentage coverage could not be measured. The aggregation and city-selection boundary logic are directly unit-tested; authentication middleware and exporter behavior retain their existing shared implementations.
