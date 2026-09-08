# Spreadsheet Duplicate Protection TDD Evidence

## Source and user journey

The journey was derived from the administrator request: an administrator can turn spreadsheet duplicate-report protection on or off from Settings, while protection remains enabled by default.

## Task report

- RED: `node --test server/spreadsheetDuplicateSetting.test.js` failed because the new setting exports did not exist.
- GREEN: the same command passed after the setting, API response, report-import behavior, and Settings control were implemented.
- Build: `npm run build` completed successfully.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Spreadsheet duplicate protection defaults to on and persists administrator changes | `spreadsheet duplicate protection defaults on and can be changed from campaign settings` | Integration | PASS |
| 2 | Turning protection off accepts duplicate spreadsheet rows while manual submissions remain protected | `turning protection off accepts spreadsheet duplicates but still protects manual submissions` | Integration | PASS |

## Coverage and known gaps

The focused integration test passes and the production frontend builds. The repository does not define a coverage command. The default `npm test` target is presently blocked before test execution by an unrelated stale import of `applyTranslationGlossary` in `server/validation.test.js`. TestSprite could not verify this local change because its CLI requires a publicly reachable deployment containing the change.
