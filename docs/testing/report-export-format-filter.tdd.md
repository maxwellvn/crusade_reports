# Report export format/filter regression

## Source and user journey

This regression was reproduced from the production report table: an administrator
expects CSV and Excel downloads to contain every report matching the visible filters.

## RED evidence

`node --test server/crusadeExportRequest.test.js` failed because
`crusadeExportRequest` did not exist. The production HTTP reproduction returned a
497-byte, header-only CSV and an XLSX workbook with one header row despite the live
query containing 3,454 reports.

## GREEN evidence

`node --test server/crusadeExportRequest.test.js server/exporter.test.js` passed 5/5.
`npm run build` completed successfully.

| Guarantee | Test | Type | Result |
|---|---|---|---|
| Legacy `format=csv|xlsx` selects the file type without filtering report rows | `server/crusadeExportRequest.test.js` | Regression/unit | PASS |
| `export_format=xlsx` preserves an independent `format=physical` report filter | `server/crusadeExportRequest.test.js` | Regression/unit | PASS |
| CSV and XLSX writers emit populated, valid output | `server/exporter.test.js` | Unit | PASS |

## Known unrelated gap

The repository-wide `npm test` command currently fails before executing tests because
`server/validation.test.js` imports a missing `applyTranslationGlossary` export. This
pre-existing translation-suite failure is outside the report-export change.
