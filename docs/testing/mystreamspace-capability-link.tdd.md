# MyStreamSpace capability-link TDD evidence

## Source and journeys

Journeys were derived from the user request in this development session.

- As the super admin, I can generate, rotate, copy, and revoke a private MyStreamSpace update link.
- As a MyStreamSpace team member holding the active link, I can view and update only the two cumulative MyStreamSpace figures without an admin login.
- As an unauthorised visitor, I cannot view the former public dashboard or use an invalid/revoked link.
- As either editor, I see thousands separators while typing large whole numbers.
- As an external read-only API consumer, I continue to receive only real submitted report rows; the manual aggregate is not introduced into that API.

## RED/GREEN evidence

| Guarantee | Test / command | Type | Result | Evidence |
|---|---|---|---|---|
| Tokens are unguessable, stored only as hashes, and revocable | `node --test server/mystreamspaceAccess.test.js` | Unit | RED then PASS | RED: `ERR_MODULE_NOT_FOUND` for the not-yet-created access module. GREEN: 3/3 tests passed. |
| Regeneration invalidates the previous link | `server/mystreamspaceAccess.test.js` | Unit | PASS | Both old- and new-token states asserted against an isolated SQLite database. |
| Large numeric inputs format and parse safely | `server/mystreamspaceAccess.test.js` | Unit | PASS | `416557` formats to `416,557`; invalid text and empty input are rejected. |
| Manual values continue to add exactly once to overall/type/online aggregates | `node --test server/mystreamspaceAccess.test.js server/mystreamspaceStats.test.js` | Unit | PASS | 7/7 relevant tests passed. |
| Client and server compile together | `npm run build` and `node --check server/routes/mystreamspace.js` | Build | PASS | Vite built 1,751 modules; server syntax checks passed. |
| Invalid/revoked links are rejected and tokens are redacted from logs | Local HTTP/browser verification on port 4101 | Integration | PASS | Admin endpoint returned 401; revoked update endpoint returned 404; server log URL contained `[REDACTED]`. |
| Valid token page loads comma-formatted values | T3 collaborative-browser verification | E2E/manual | PASS | Form loaded `416,557` and `308,240,424`; typing `1234567` rendered `1,234,567`. |

## Coverage and known gaps

- Relevant feature tests: 7/7 passing.
- `npm test` remains blocked before executing its suite by the pre-existing missing `applyTranslationGlossary` export in `server/routes/translation.js`; this task does not modify translation code.
- `npm audit --omit=dev`: 0 vulnerabilities.
- TestSprite CLI is authenticated, but the changed version is local and not yet deployed to a reachable URL, so a TestSprite deployment run would test the previous build and was intentionally not run.
- No project coverage script is defined in `package.json`; targeted behavioral and local browser verification is recorded above.

## Checkpoints

- RED: `7dcbae6 test: add MyStreamSpace capability link coverage`
- GREEN primitives: `fac7118 feat: add MyStreamSpace capability token primitives`
