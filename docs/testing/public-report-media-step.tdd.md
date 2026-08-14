# Public report evidence step — TDD evidence

## User journey

As a public reporter using `/report`, I can clearly add highlights, upload image
evidence, and provide photo or video links before reviewing and submitting the
same reporting structure used by zonal and network dashboards.

## RED / GREEN

| Guarantee | Evidence |
|---|---|
| `/report` has a distinct Evidence & media step before Review | `server/validation.test.js`: `public report has an explicit evidence step with the shared image and link workflow` |
| The step reuses the shared media component and multipart submission | Same test plus the complete validation suite |

RED was observed with the original three-step form: the new test failed because
`Evidence & media` was absent. GREEN is recorded after the focused test, full
suite, and production build pass.
