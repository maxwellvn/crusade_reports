# Network personal-dashboard ownership — TDD evidence

## User journey

A network coordinator opening a private dashboard sees only crusades explicitly registered under that network by default. A super admin can independently enable related-crusade visibility for Youths Aglow, TEEVOLUTION, or Say Yes to Kids without changing either of the other networks.

## Guarantees

| Guarantee | Test | Result |
|---|---|---|
| Youths Aglow, TEEVOLUTION, and Say Yes to Kids dashboards use strict `network_name` ownership | `server/portalVisibility.test.js` | PASS |
| Enabling one mapped network restores only its related event-type visibility; Youths Aglow also restores its BLW-zone rule | `server/portalVisibility.test.js` | PASS |
| Per-network toggle values persist independently through campaign settings | `server/networkDashboardSetting.test.js` | PASS |
| Zone dashboards continue using strict `zone` ownership | `server/portalVisibility.test.js` | PASS |

RED was captured when `portalVisibility.js` did not exist. GREEN was captured with:

```sh
node --test server/portalVisibility.test.js server/networkDashboardSetting.test.js
```

The broader focused regression suite passed 17/17 tests, `npm run build` passed, and the production dependency audit reported zero vulnerabilities.

Admin statistics and attribution were intentionally left unchanged; this change is limited to capability-link personal dashboards and the queries that reuse their scope.
