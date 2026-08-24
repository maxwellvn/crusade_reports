# Personal-dashboard bulk report upload — TDD evidence

## User journey

A zone or network dashboard user uploading more than 100 completed report rows can validate and submit the entire spreadsheet without rendering a large row-by-row preview.

## Guarantees

| Guarantee | Test | Result |
|---|---|---|
| A workbook containing exactly 100 valid reports retains the normal preview | `server/portalReportImport.test.js` | PASS |
| A workbook containing 101 or more valid reports returns no preview rows and requires direct commit | `server/portalReportImport.test.js` | PASS |

RED was captured when `portalReportImport.js` did not yet exist. GREEN was captured with:

```sh
node --test server/portalReportImport.test.js
```

The broader focused regression suite passed 13/13 tests, `npm run build` passed, and `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities.

TestSprite deployment verification remains pending until these local commits are pushed and deployed to the public target.
