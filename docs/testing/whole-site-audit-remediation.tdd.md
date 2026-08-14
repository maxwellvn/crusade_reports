# Whole-site audit remediation TDD evidence

## Scope

Journeys were derived from the requested Ponytail whole-site audit remediation. Findings 1, 10, and 13 were explicitly excluded.

## User journeys

- As the super admin, I can assign exact page access without unassigned APIs remaining callable.
- As the super admin, I can intentionally assign no pages and have that choice remain empty.
- As an administrator, opening a submitted photo cannot execute disguised active content.
- As an operator, malformed uploads cannot consume many times the documented combined limit.
- As a screen-reader user, visible form labels provide accessible control names.

## Test specification

| Guarantee | Test target | Result |
|---|---|---|
| Assignable admin APIs use their corresponding delegated permission | `assignable admin pages use their delegated permission middleware` | GREEN |
| Explicit empty permissions do not fall back to defaults | `an explicitly empty delegated permission set stays empty` | GREEN |
| Database restore is restricted to the super admin | `database restore remains super-admin only` | GREEN |
| Network creation is restricted to the super admin | `network creation requires super-admin access` | GREEN |
| Uploaded photo types come from file signatures | `report photos are recognized from file signatures, not supplied metadata` | GREEN |
| Error bodies redact credentials recursively | `error-log redaction removes credentials and portal tokens recursively` | GREEN |
| Shared fields label controls without page-by-page duplication | `shared Field supplies accessible names to unlabeled form controls` | GREEN |

## RED/GREEN evidence

- RED: the focused test target failed at module load because `detectPhotoType` was not implemented.
- GREEN: the focused target passed, then `npm test` passed 64/64 tests. `npm run build` and `npm audit --omit=dev` also passed; the audit reported zero vulnerabilities.

## Known gaps

- This repository does not provide a coverage script, so an 80% coverage percentage cannot be generated. The full Node test suite and browser smoke checks are used instead.
- No commits were created because the working tree already contained mixed user and task changes; avoiding an unsafe checkpoint commit takes precedence.
