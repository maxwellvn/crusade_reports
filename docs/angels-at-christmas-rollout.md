# Angels at Christmas shared-portal rollout

## Decision

Use the existing NOTC portal as one shared, campaign-aware application. Do not clone the portal and do not create an independent Angels database.

The request host selects the campaign:

- `notc.rhapsodycrusades.org` and unrecognised/local hosts default to `notc`.
- `aac.rhapsodycrusades.org` and `aac.localhost` select `aac`.
- Additional staging hosts can be supplied with `CAMPAIGN_HOSTS_AAC`.

Every campaign-sensitive write stores a server-resolved campaign ID. Every campaign-sensitive read, dashboard, export, lookup, zone portal and admin operation filters by that ID. A browser-supplied campaign value is never trusted.

## Additive database migration

The first start adds `campaign TEXT NOT NULL DEFAULT 'notc'` to:

- `registrations`
- `registration_items`
- `reports`
- `crusades`
- `resources`
- `external_api_keys`

SQLite applies the constant default to all existing rows, so every pre-existing production record remains a NOTC record. No existing table or column is renamed or deleted.

Angels-specific administration uses additive tables for dashboard accounts, permissions, zone/network capability tokens and dashboard layouts. NOTC continues to use its original tables. Campaign settings, snapshot keys and external API keys are also separated.

## Angels rules and presentation

- Angels has its own landing page, emblem, colours, wording, legal copy and metadata.
- Registration and report forms display the Angels identity on the Angels host.
- Crusade dates are enforced by the server for every write path, including manual registration, bulk upload, public reporting, zone portals and admin edits.
- Valid Angels dates are `2026-12-01` through `2026-12-31` inclusive.
- NOTC-only initiatives return `404` on the Angels host and remain unchanged on the NOTC host.
- Administrators can move between the campaign hosts; accounts, permissions, settings, layouts, resources, API keys and statistics remain campaign-specific.

## Production-backup proof

Source archive: `database-backup-2026-11-24T12-03-59-438Z-b975bb.zip`

SHA-256:

`EF769FF1925EDC464BD9024A2A67BD70FEEBE06826AC1394CDD5D11F8FB47F54`

The comparison harness copies both SQLite files into a temporary directory before starting either code version. It never opens the source files for writing.

The latest `origin/main` commit (`4bab09b`) and the campaign branch were run against fresh copies of the same production database pair. The central NOTC figures were identical:

| Measure | Before | After |
| --- | ---: | ---: |
| Registered crusade items | 2,210,218 | 2,210,218 |
| Registration entries | 34,717 | 34,717 |
| Reported registered crusades | 57,340 | 57,340 |
| Awaiting reports | 2,152,878 | 2,152,878 |
| Dashboard crusades (including the existing NOTC adjustment) | 1,275,640 | 1,275,640 |
| Onsite attendance | 188,049,837 | 188,049,837 |
| Online participation | 2,579,183,601 | 2,579,183,601 |
| Salvations | 160,469,817 | 160,469,817 |
| Rhapsody distributed | 30,176,959 | 30,176,959 |
| Countries on the report dashboard | 205 | 205 |

The first start on the production-sized copy took about 16.5 minutes on the development workstation for both main and the campaign branch. Schedule the production migration as a maintenance window and do not depend on an instant container health check during this first start.

Some legacy heavy endpoints timed out in both baseline runs under the 90-second proof-harness limit. They are not counted as equality evidence; successful central dashboard responses and direct integrity/count checks are the release gate.

## Pre-launch gates

Do not deploy until every item below is complete:

1. Download a fresh split-database backup from production and verify both SQLite files with `PRAGMA quick_check`.
2. Copy the backup off the production server and record its SHA-256 checksum.
3. Back up the report-photo directory separately. The database backup ZIP does **not** contain uploaded report photos.
4. Confirm the previous production image/commit and database/photo restore procedure are available.
5. Point a staging hostname to the campaign branch and test both the NOTC and Angels hostnames against the same restored test data.
6. Verify registration, bulk registration, find-my-crusade, manual reporting, registered-crusade reporting, report photos, zone/network portals, dashboards, filters, exports, resources, admin accounts and campaign switching.
7. Re-run `node scripts/campaign-baseline.mjs` against the fresh backup and confirm the NOTC dashboard totals are unchanged.
8. Confirm `aac.rhapsodycrusades.org` DNS and TLS are ready, but do not update the main website CTA yet.

## Deployment

1. Announce a maintenance window of at least 30 minutes.
2. Stop writes or place the portal in maintenance mode.
3. Take and download the final database and photo backups.
4. Record the current NOTC dashboard totals and current production commit.
5. Deploy the tested campaign commit.
6. Allow the first migration/index build to finish; do not repeatedly restart it while CPU and database activity are progressing.
7. Verify `PRAGMA quick_check`, the health endpoint and the NOTC dashboard totals.
8. Verify that a test Angels registration is stored with `campaign = 'aac'` and does not appear on the NOTC host. Remove the test record through the normal admin workflow.
9. Verify that an existing NOTC registration is invisible on the Angels host and unchanged on the NOTC host.
10. Enable the Angels hostname, then update the main Angels website's registration CTA to `https://aac.rhapsodycrusades.org/crusade-registration/register`.

## Rollback

If migration, integrity, totals or host separation checks fail:

1. Stop the new application before accepting more writes.
2. Restore the previous application image/commit.
3. Restore both SQLite databases from the same final backup set.
4. Restore the matching report-photo directory backup.
5. Remove or disable the Angels DNS/route and return the main website CTA to its previous destination.
6. Start the previous portal and verify `PRAGMA quick_check` plus the recorded NOTC totals.

Do not attempt a partial rollback with only one database from the split pair.

## Repeatable checks

```powershell
npm.cmd run build
node --test server/campaignIsolation.test.js server/mediaSelfService.test.js server/portalNetworkReportTemplate.test.js
node scripts/campaign-baseline.mjs record --code <main-worktree> --source <reports.sqlite> --registration-source <registrations.sqlite> --out <before.json>
node scripts/campaign-baseline.mjs record --code <campaign-worktree> --source <reports.sqlite> --registration-source <registrations.sqlite> --out <after.json>
node scripts/campaign-baseline.mjs compare <before.json> <after.json>
```

The repository's broad `npm test` command currently has an unrelated pre-existing translation-test import problem: `validation.test.js` imports translation helpers that `server/routes/translation.js` does not export. Campaign verification uses the focused test commands above until that separate issue is repaired.
