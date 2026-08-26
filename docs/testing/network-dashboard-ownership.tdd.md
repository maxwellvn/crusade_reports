# Network personal-dashboard ownership — TDD evidence

## User journey

A network coordinator opening a private dashboard sees only crusades explicitly registered under that network, regardless of crusade type or the submitting zone's name.

## Guarantees

| Guarantee | Test | Result |
|---|---|---|
| Youths Aglow, TEEVOLUTION, and Say Yes to Kids dashboards use strict `network_name` ownership | `server/portalVisibility.test.js` | PASS |
| Zone dashboards continue using strict `zone` ownership | `server/portalVisibility.test.js` | PASS |

RED was captured when `portalVisibility.js` did not exist. GREEN was captured with:

```sh
node --test server/portalVisibility.test.js
```

The broader focused regression suite passed 15/15 tests, `npm run build` passed, and the production dependency audit reported zero vulnerabilities.

Admin statistics and attribution were intentionally left unchanged; this change is limited to capability-link personal dashboards and the queries that reuse their scope.
