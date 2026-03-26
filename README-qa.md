# Momentum QA System v2

Autonomous quality assurance for the Momentum Agent app.
Three-phase sweep: **selector contracts → page contracts → route sweep**.

---

## Quick start

```bash
# Full sweep (all three phases)
QA_EMAIL=you@example.com QA_PASSWORD=secret npx tsx tests/qa/index.ts

# Phase 1 only — static selector check (no browser, instant)
npm run qa:selector

# Phase 2 only — page contract tests (Playwright)
QA_EMAIL=... QA_PASSWORD=... npm run qa:contracts

# Phase 3 only — full 31-route sweep
QA_EMAIL=... QA_PASSWORD=... npm run qa:sweep
```

---

## The three phases

### Phase 1 — Selector contract check (static)

Scans `client/src/` for components that access Redux state directly
(`state.leads` or `state.clients`) instead of using the centralized
selectors in `client/src/state/appSelectors.ts`.

**Why:** A regression where `EricaWorkspace` read `state.leads` instead of
`state.app.leads` caused leads to silently return `[]`, making the
Selection tab show "Leads (0)" even with real data loaded.

Fix violations by importing from `appSelectors.ts`:

```ts
import { selectLeads, selectClients } from '@/state/appSelectors';
const leads   = useSelector(selectLeads);
const clients = useSelector(selectClients);
```

### Phase 2 — Page contract tests

Runs structural checks against key routes with a real authenticated browser:

| Route | Contract |
|---|---|
| `/erica` | Selection tab renders, Leads (N) label present, Batch Name input visible |
| `/pipeline` | Sidebar renders, pipeline content visible |
| `/focus` | Sidebar renders, focus content visible |
| `/exec` | Exec dashboard tabs/KPIs visible |
| `/my-work` | Work queue content visible |

Add new contracts in `tests/qa/registry.ts`.

### Phase 3 — Full route sweep

Crawls all 31 app routes at desktop + mobile viewports, checking for:

- React crashes / blank screens
- Stuck loading spinners
- Scroll locks
- Network errors (filtered for internal APIs only)
- Route access failures (auth gates)

Reports written to `tests/qa/reports/`.

---

## Seed test data

Creates 5 leads in Firestore for the `testco` org so Erica Selection
shows real counts:

```bash
npx tsx scripts/seed-test-data.ts
npx tsx scripts/seed-test-data.ts --org myOrgId --clear
npx tsx scripts/seed-test-data.ts --dryrun
```

---

## Dev-only routes

When running in development (`NODE_ENV !== production`), the server
mounts a `/__dev/` namespace:

| Endpoint | Purpose |
|---|---|
| `GET /__dev/health` | Liveness ping |
| `GET /__dev/outbox` | Last 20 outbound emails/SMS |
| `POST /__dev/outbox` | Inject a message manually |
| `DELETE /__dev/outbox` | Clear the outbox |

---

## Client-side dev tools

Available in dev/test only (no-op in production):

```ts
import { qaAuditPush, qaAuditGet } from '@/lib/devMocks/qaAudit';
// Push a domain event (accessible from Playwright via page.evaluate)
qaAuditPush({ type: 'call_launched', payload: { batchId } });

import { calendarMock } from '@/lib/devMocks/calendarMock';
const event = await calendarMock.createEvent({ title, start, end });

import { dialerMock } from '@/lib/devMocks/dialerMock';
const { callSid } = await dialerMock.connect({ to: '+61412000001' });
await dialerMock.hangup(callSid);
```

In Playwright tests, read events with:

```ts
const events = await page.evaluate(() => window.__qaAudit ?? []);
```

---

## CI integration

Add to your CI pipeline:

```yaml
# PRs — fast static + contract checks
- name: QA selector check
  run: npm run qa:selector

- name: QA page contracts
  run: QA_EMAIL=${{ secrets.QA_EMAIL }} QA_PASSWORD=${{ secrets.QA_PASSWORD }} npm run qa:contracts

# Nightly — full sweep
- name: QA full sweep
  run: QA_EMAIL=${{ secrets.QA_EMAIL }} QA_PASSWORD=${{ secrets.QA_PASSWORD }} npm run qa:sweep
  if: github.event_name == 'schedule'
```

---

## File map

```
client/src/state/appSelectors.ts      Centralized Redux selectors
client/src/lib/devMocks/qaAudit.ts    window.__qaAudit shim
client/src/lib/devMocks/calendarMock  Calendar mock (dev/test)
client/src/lib/devMocks/dialerMock    Dialer mock (dev/test)
server/routes/dev.ts                  /__dev/ outbox + health
scripts/seed-test-data.ts             Firestore seed
tests/qa/index.ts                     QA orchestrator (v2)
tests/qa/registry.ts                  Page contract definitions
tests/e2e/contracts.ts                Contract test runner
tests/e2e/erica-flow.ts               Erica sell+book flow
tools/eslint-rules/no-direct-state-access.js  Selector guard
```
