# Zone report upload recovery — TDD evidence

## User journeys

- A zone-dashboard user receives accurate, actionable feedback when photos exceed the server or proxy limit.
- A user whose submission was saved before a gateway interruption sees the crusade refreshed as submitted instead of repeatedly resubmitting it.
- Peak registration traffic does not start a full verified database backup for every individual registration.

## Evidence

| Guarantee | Test | RED | GREEN |
|---|---|---|---|
| HTTP 413 is reported as an oversized upload while 502/504 warn that submission status is unknown | `client/src/lib/api.test.js` | Missing `responseErrorDetails` export caused the intended compile-time failure | `node --test client/src/lib/api.test.js` passed 2/2 |
| Application `ALREADY_REPORTED` responses retain their code and message | `client/src/lib/api.test.js` | Missing `responseErrorDetails` export caused the intended compile-time failure | `node --test client/src/lib/api.test.js` passed 2/2 |
| Registration-triggered backups are coalesced for five minutes while scheduled backups remain unaffected | `server/databaseProtectionThrottle.test.js` | Missing `shouldThrottleBackup` export caused the intended compile-time failure | Focused suite passed |

The focused regression command passed 11/11 tests:

```sh
node --test client/src/lib/api.test.js server/databaseProtectionThrottle.test.js client/src/lib/keyboardViewport.test.js server/countries.test.js server/reportOrdering.test.js
```

`npm run build` passed. `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities.

## Known gaps

- The repository's existing `npm test` target currently stops before test execution because `server/validation.test.js` imports a pre-existing missing `applyTranslationGlossary` export. This task did not alter translation behavior.
- TestSprite cannot validate the local commits until they are pushed and deployed to its publicly reachable target URL.
