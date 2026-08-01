# Database protection TDD evidence

## Guarantees tested

- Online SQLite snapshots are written to a temporary file, integrity-checked, and atomically renamed.
- Corrupt uploads/snapshots fail verification.
- Retention preserves recent, daily, and weekly recovery points while deleting snapshots beyond policy.
- Production database paths must remain beneath the declared persistent-storage root.

## Red evidence

`npm test` initially failed with `ERR_MODULE_NOT_FOUND` for `server/databaseProtection.js`, confirming that the protection behavior did not yet exist.

## Green evidence

On 2026-08-01, `npm test` passed all 30 tests and `npm run build` completed successfully.
