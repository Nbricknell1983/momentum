# State Ownership — Live Operational Reconciliation

_Completed: Phase 2 of Live Operational State Reconciliation build brief._

---

## What Redux owns

| Slice field | Owner | Notes |
|---|---|---|
| `leads[]` | Firestore listener | Populated from `onSnapshot`; do NOT manually persist here |
| `clients[]` | Firestore listener | Populated from `onSnapshot`; do NOT manually persist here |
| `activities[]` | One-time fetch | Still loaded at login via `fetchAllActivities`; not real-time |
| `selectedLeadId` | Redux UI state | Stable across live updates (ID-based selection) |
| `selectedClientId` | Redux UI state | Stable across live updates |
| `isDrawerOpen` | Redux UI state | Not affected by snapshots |
| `isClientDrawerOpen` | Redux UI state | Not affected by snapshots |
| `searchQuery` | Redux UI state | Applied client-side; survives snapshot refreshes |
| `stageFilter` | Redux UI state | Applied client-side; survives snapshot refreshes |
| `territoryFilter` / `regionFilter` / `areaFilter` | Redux UI state | Applied client-side; survives snapshot refreshes |
| `healthFilter` | Redux UI state | Applied client-side |
| `nurtureTab` | Redux UI state | Applied client-side |
| `user` | Auth context → Redux | Set from Firebase Auth, not from snapshots |
| `nbaQueue` | Redux UI state | Derived/manual queue, not listener-fed |
| `focusMode` | Redux UI state | Session-only UI flag |
| `dailyPlan` / `dailyMetrics` / `tasks` / `touches` / `cadences` | Redux | Remain as-is; not in scope for this brief |

---

## What Firestore listener-backed state owns

### Leads — `orgs/{orgId}/leads`

- **Listener**: `onSnapshot` in `useFirestoreSync` hook (`client/src/lib/firestoreSync.ts`)
- **Scope**: org-scoped; for non-managers filtered by `userId == user.uid`
- **Normalizer**: `normalizeLeadDoc` — converts Timestamps to Dates, applies field defaults (`conversationStage`, `conversationCount`, etc.)
- **Redux update**: `dispatch(setLeads([...]))` on every snapshot event
- **Lifecycle**: Attaches when `authReady && membershipReady && orgId && userId`. Detaches on org change or logout.
- **First snapshot**: Replaces the previous `fetchLeads` one-time call. The `leadsReady` flag gates the loading spinner until the first snapshot arrives.

### Clients — `orgs/{orgId}/clients`

- **Listener**: Same `useFirestoreSync` hook
- **Scope**: org-scoped; same manager/non-manager filter as leads
- **Normalizer**: `normalizeClientDoc` — converts Timestamps, recalculates `churnRiskScore`, `healthStatus`, `healthReasons` via `calculateClientHealth`
- **Redux update**: `dispatch(setClients([...]))` on every snapshot event
- **Lifecycle**: Same as leads listener; both listeners start and stop together.
- **First snapshot**: Replaces the previous `fetchClients` one-time call. `clientsReady` gates the spinner.

---

## Where mutations reconcile

### Current mutation pattern (intentional, controlled optimistic)

```
dispatch(patchLead({ id, updates }))   // optimistic UI
updateLeadInFirestore(orgId, id, updates)  // durable write
// → listener snapshot arrives → dispatch(setLeads([...]))  // reconciliation
```

**Rationale**: Optimistic updates give instant feedback for drag/drop and quick edits. The `onSnapshot` listener provides automatic reconciliation — if the Firestore write succeeds, the snapshot confirms the new state. If the write fails, the next snapshot reverts Redux to Firestore truth. This is safe because:

1. The listener is always running while the app is active
2. Snapshots arrive within 100–500ms of writes
3. Permanent false state in Redux cannot persist beyond the next snapshot

### Firestore-first cases (server-side AI engine writes)

When AI engines (Website Engine, SEO Engine, GBP Engine, Ads Engine, Growth Prescription, Learning Insights, Strategy Intelligence) write to a client document on the server:

- They write directly to `orgs/{orgId}/clients/{clientId}` via Firebase Admin SDK
- The `onSnapshot` listener on the client collection picks up the change automatically
- `ClientFocusView`, `ClientGrowthIntelligencePanel`, and all related panels update without any manual refresh or user action

No additional plumbing is required for AI engine result freshness.

---

## Listener lifecycle — cross-org safety

The `useFirestoreSync` hook tracks the active org via `activeOrgRef`. On orgId change:

1. Old listeners are unsubscribed before new ones attach
2. `setLeads([])` and `setClients([])` are NOT dispatched on teardown — the loading gate (`leadsReady`, `clientsReady`) handles the transition
3. A new set of listeners attaches only when the new `orgId` is confirmed valid

On logout (`userId` becomes null): listeners unsubscribe immediately, `activeOrgRef` is cleared, `leadsReady`/`clientsReady` reset to false.

---

## What changed from before this brief

| Before | After |
|---|---|
| `fetchLeads` + `fetchClients` called once at login | Replaced by `onSnapshot` listeners via `useFirestoreSync` |
| Redux `leads`/`clients` were stale once-loaded snapshots | Redux is now a listener-fed live view |
| AI engine writes required reload to appear | Client listener picks up server writes automatically |
| Multi-tab drift was permanent until reload | Snapshots reconcile all tabs within ~500ms |
| Mutation drift (local patch + Firestore disagree) possible | Listener reconciles after every write |

---

## Known follow-up items

- **Activities** are still loaded once at login. Real-time activity reconciliation was out of scope for this brief.
- **Firestore index requirement**: The manager query uses `orderBy('updatedAt', 'desc')`. This index was already required by the previous `fetchLeads`/`fetchClients` queries, so it should already exist. If a new org triggers a missing-index error, the same index creation step applies as before.
- **Performance at scale**: For very large orgs (thousands of leads), the full-collection snapshot on every change may become expensive. A paginated or date-bounded query can be introduced as a follow-up without architectural disruption.
