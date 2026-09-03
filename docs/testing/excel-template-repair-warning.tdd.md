# Excel Template Repair Warning — TDD Evidence

## Source and user journey

Derived from the reported Microsoft Excel warning when opening a downloaded personal-dashboard report template.

As a dashboard reporter, I want the downloaded `.xlsx` template to open without Excel repairing it, so that I can enter and upload report figures confidently.

## Task report

- RED: `node --test server/portalReportTemplate.test.js` ran the new generated-package regression and failed with `sheet protection must precede the auto-filter`.
- GREEN: `node --test server/portalReportTemplate.test.js server/portalNetworkReportTemplate.test.js server/portalReportImport.test.js` passed all 7 relevant tests after worksheet XML normalization and Promise-based temporary-file cleanup.
- Coverage: `node --test --experimental-test-coverage server/portalReportTemplate.test.js` passed all 3 tests with 81.01% aggregate line coverage; `portalReportWorkbookWriter.js` reached 100% line coverage.
- Full server suite: `node --test server/*.test.js` passed 41 of 42 tests. The remaining failure is pre-existing and unrelated: `server/validation.test.js` imports a missing `applyTranslationGlossary` export from `server/routes/translation.js`.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Generated report templates place `sheetProtection` after `sheetData` and before `autoFilter`, as required by Excel's worksheet schema | `server/portalReportTemplate.test.js` — `downloaded personal dashboard templates use Excel-compatible worksheet element order` | Integration | PASS |
| 2 | Repacked templates remain readable through the existing import parser for more than 1,000 rows | `server/portalReportTemplate.test.js` — large import test | Integration | PASS |
| 3 | Network-scoped templates still include only pending registrations owned by that network | `server/portalNetworkReportTemplate.test.js` | Integration | PASS |
| 4 | Temporary generated templates are removed through the Promise-based cleanup path | Cleanup hook in the generated-package regression | Integration | PASS |

## Known gaps

The automated checks validate ZIP integrity, worksheet schema ordering, generation, parsing, and cleanup. Microsoft Excel itself is not driven in CI. The repository-wide pre-existing translation test failure is outside this change.

## Merge evidence

- RED checkpoint: `d35f092` (`test: reproduce Excel repair warning for report templates`)
- GREEN: worksheet package normalization and cleanup import correction; relevant tests pass.
