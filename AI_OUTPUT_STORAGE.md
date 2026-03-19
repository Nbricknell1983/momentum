# AI Output Storage Model

_Completed: AI Output Metadata & History Hardening build brief._

---

## Overview

All AI engine outputs are now stored as timestamped, traceable intelligence artifacts. Every engine run produces:
1. A **latest snapshot** on the client/lead document — the simple fast-read path the UI uses
2. A **durable history record** in an `engineHistory` subcollection — immutable, never overwritten

---

## Engines covered

| Engine | Field on doc | Doc type | History collection |
|---|---|---|---|
| Website Engine | `websiteEngine` | client | `orgs/{orgId}/clients/{clientId}/engineHistory/{runId}` |
| SEO Engine | `seoEngine` | client | `orgs/{orgId}/clients/{clientId}/engineHistory/{runId}` |
| GBP Engine | `gbpEngine` | client | `orgs/{orgId}/clients/{clientId}/engineHistory/{runId}` |
| Ads Engine | `adsEngine` | client | `orgs/{orgId}/clients/{clientId}/engineHistory/{runId}` |
| Learning Insights | `learningInsight` | client | `orgs/{orgId}/clients/{clientId}/engineHistory/{runId}` |
| Growth Prescription | `growthPrescription` | lead | `orgs/{orgId}/leads/{leadId}/engineHistory/{runId}` |

> **`strategyIntelligence`** is a user-editable form field persisted to lead documents. It is not an AI engine run and does not produce history records.

---

## Metadata shape

Every engine output now carries:

```typescript
interface EngineOutputMeta {
  runId: string;        // e.g. "m8x3k2-a7f9c1" — unique per run
  generatedAt: Date;    // timestamp of this run
  engineType: EngineType; // e.g. 'websiteEngine'
  generatedBy: 'user';  // always 'user' (human-triggered); future: 'autopilot'
  modelUsed: string;    // e.g. 'gpt-4o-mini'
}
```

These fields are added by `enrichWithMeta()` in `client/src/lib/engineOutputService.ts`.

---

## Dual-write flow

On every engine run:

```
1. AI API returns output JSON
2. enrichWithMeta(output, engineType, runId) → adds metadata fields
3. updateClientInFirestore(orgId, clientId, { [engineType]: enrichedOutput })
   → writes latest snapshot to client doc (UI reads from here)
4. persistEngineHistory(orgId, 'clients', clientId, runId, { ...enrichedOutput, clientId, orgId })
   → writes durable record to engineHistory subcollection
5. dispatch(updateClient({ id: clientId, updates }))
   → optimistic Redux update
```

History write (#4) is **non-blocking** — if it fails (e.g., permission error), it is logged to console but never prevents the main write (#3) from completing. The latest output is never lost due to history failure.

---

## History storage path

Option B was chosen: **shared `engineHistory/{runId}` subcollection per entity**, with `engineType` field on each record.

```
orgs/{orgId}/clients/{clientId}/engineHistory/{runId}
{
  // full engine output payload
  ...reportFields,
  
  // metadata
  runId: "m8x3k2-a7f9c1",
  generatedAt: Timestamp,
  engineType: "websiteEngine",
  generatedBy: "user",
  modelUsed: "gpt-4o-mini",
  
  // context for querying
  clientId: "abc123",
  orgId: "org456",
  _savedAt: Timestamp,  // when the history record itself was written
}
```

This path is:
- Org/client-scoped (multi-tenant safe)
- Queryable by `engineType` for single-engine history
- Queryable across all engines for a client's full output timeline

---

## Freshness / staleness

`isOutputStale(generatedAt, engineType)` returns `true` if the output exceeds the policy threshold:

| Engine | Stale after |
|---|---|
| websiteEngine | 30 days |
| seoEngine | 30 days |
| gbpEngine | 30 days |
| adsEngine | 30 days |
| learningInsight | 14 days |
| growthPrescription | 90 days |

The UI currently shows `generatedAt` as a timestamp on each engine panel. Staleness indicators (e.g. amber badge, "Run again" prompt) can be added by calling `isOutputStale(report.generatedAt, 'websiteEngine')` — no data model changes needed.

---

## Backward compatibility

Old client docs (pre-hardening) contain engine fields without `runId`, `engineType`, or `modelUsed`. These docs still load safely because:
- All UI reads use optional chaining on metadata fields
- `generatedAt` was already written on most pre-existing outputs
- New runs will automatically write the enriched format forward

**No migration required.** Lazy migration on next write is the chosen strategy.

---

## Firestore rules

```
// Client engine history — immutable
match /clients/{clientId}/engineHistory/{runId} {
  allow read: if isOrgMember(orgId);
  allow create: if isOrgMember(orgId);
  allow update, delete: if false;  // immutable
}

// Lead engine history — immutable
match /leads/{leadId}/engineHistory/{runId} {
  allow read: if isOrgMember(orgId);
  allow create: if isOrgMember(orgId);
  allow update, delete: if false;  // immutable
}
```

---

## Service file

**`client/src/lib/engineOutputService.ts`** — all shared helpers:
- `generateRunId()` — creates a unique run identifier
- `enrichWithMeta(output, engineType, runId)` — adds metadata to any engine output
- `isOutputStale(generatedAt, engineType)` — checks freshness against policy thresholds
- `persistEngineHistory(orgId, entityCollection, entityId, runId, payload)` — non-blocking history write
- `ENGINE_STALE_DAYS` — stale thresholds table (editable per engine)

---

## Payload size

Current engine payloads are typically 2–8 KB per run (JSON objects with 10–30 fields). Firestore's 1 MB document limit is not a concern. For very active clients with many reruns, the `engineHistory` subcollection accumulates one document per run — standard Firestore subcollection pattern, no size concerns.

---

## Follow-up recommendations

1. **Freshness indicators in UI** — add an amber "Stale" badge and "Re-run" prompt when `isOutputStale()` returns true. All data is already in place.
2. **Run history viewer** — a collapsible "Previous runs" section in each engine panel, querying `engineHistory` ordered by `generatedAt desc`. The data is already stored.
3. **Score comparison** — since each history record has the engine's score field (`conversionScore`, `visibilityScore`, etc.), a simple trend chart can be built without schema changes.
4. **Autopilot-triggered runs** — when autopilot generates engine outputs, set `generatedBy: 'autopilot'` to distinguish from user-triggered runs. The metadata field is already present.
