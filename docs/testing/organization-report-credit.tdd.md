# Organization Report Credit TDD Evidence

## Source and user journey

Administrators can turn on a dashboard counting mode so submitted reports count toward each organization's planned total even when the report is not linked to a registered crusade. Reporting on a registered crusade still saves and stays linked.

## Task report

- RED: `node --test server/organizationReportCredit.test.js` failed because organization-type progress let extra reports from one zone fill another zone's plan (`6 !== 5`).
- GREEN: the same command passed after per-organization caps were summed into every planned-vs-held breakdown, and a linked-report save assertion was added.
- Build: `npm run build` completed successfully.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Organization report credit defaults off and persists through campaign settings | `organization report credit is off by default and exposed through campaign settings` | Integration | PASS |
| 2 | Unlinked reports count toward the matching organization's plan and cannot exceed that plan; extra reports do not fill another organization's gap on org-type or event-type rollups | `enabled organization credit counts unlinked reports against plan without exceeding plan` | Integration | PASS |
| 3 | A report submitted against a registered crusade still saves with its registration link when credit is on | `organization credit still saves reports linked to registered crusades` | Integration | PASS |

## Coverage and known gaps

The focused integration test passes. The repository does not define a coverage command. TestSprite cannot verify this local change because its CLI requires a publicly reachable deployment containing the change.
