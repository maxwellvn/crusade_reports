# Duplicate report management — TDD evidence

## User journey

A super administrator opens **Reports dashboard → Duplicates**, reviews only reports that share a normalized event date, event name, country, and city, searches and paginates those records, and either deletes an individual report or cleans the matching duplicate sets while selecting which record to keep.

Cleanup requires an explicit browser confirmation. The client sends the exact number of extra reports that was reviewed, and the server rechecks that number inside the deletion transaction. If it changed, cleanup aborts without deleting a report.

## RED evidence

- Commit `2199664` introduced duplicate-listing tests before `duplicateReportPage` existed; the test failed because the export was missing.
- Commit `b7ecc9d` introduced keeper-strategy tests before `cleanDuplicateReports` existed; the test failed because the export was missing.
- The stale-confirmation test initially failed with `Missing expected exception` until the expected duplicate count was required and rechecked.

## GREEN evidence

- `node --test server/duplicateReports.test.js`: 10/10 passing.
- Targeted feature coverage: `server/duplicateReports.js` has 98.89% line, 83.02% branch, and 100% function coverage.
- `npm run build`: passing. Vite retains its existing large-chunk advisory.
- `git diff --check`: passing.
- `npm audit --omit=dev` and its JSON form were attempted; the local command returned no audit output or usable exit status, so dependency-audit verification is inconclusive.

## Browser verification

The page was exercised in the collaborative browser against a disposable SQLite database only:

- displayed 15 duplicate sets / 30 matching reports / 15 extra reports;
- search narrowed the summary and table to the matching set;
- pagination moved from page 1 to page 2;
- individual deletion refreshed the list and removed a no-longer-duplicated set;
- bulk cleanup was verified for **Best record** and **Highest reported figures**;
- after cleanup, the summary showed zero duplicate sets and the selected keeper remained.

No production report database was modified during browser verification.

## Full-suite and external verification

`node --test server/*.test.js` ran 50 tests successfully. The suite then stopped on the pre-existing, unrelated `server/validation.test.js` import error: `applyTranslationGlossary` is not exported by `server/routes/translation.js`.

TestSprite CLI 0.7.0 is installed and authenticated. It was not run because the feature is local and no publicly reachable deployed URL containing this change is available; running it against an existing deployment would test the previous build.
