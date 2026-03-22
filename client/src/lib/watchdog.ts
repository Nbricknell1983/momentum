/**
 * Momentum Watchdog — proactive runtime self-audit
 *
 * A pure function that takes observable client-side state and returns a list of
 * likely bugs, UI-state mismatches, and orchestration problems. No network calls.
 * Designed to run after every key workflow transition and on a background tick.
 */

export type WatchdogSeverity = 'low' | 'medium' | 'high';
export type WatchdogConfidence = 'low' | 'medium' | 'high';
export type WatchdogCategory =
  | 'ui-state-mismatch'
  | 'fallback-copy'
  | 'orchestration'
  | 'auth'
  | 'prompt-output'
  | 'data-pipeline'
  | 'workflow-friction';

export interface WatchdogFinding {
  id: string;
  severity: WatchdogSeverity;
  confidence: WatchdogConfidence;
  category: WatchdogCategory;
  summary: string;
  likelyCause?: string;
  recommendedFix?: string;
  evidence?: string[];
}

export interface WatchdogInput {
  lead: any;
  mountedAtMs: number;
  nowMs: number;
  prepRunning: boolean;
  evidenceRunning: boolean;
  xrayRunning: boolean;
  serpRunning: boolean;
  diagRunning: boolean;
  xrayStartedAtMs: number | null;
  serpStartedAtMs: number | null;
  diagStartedAtMs: number | null;
  prepStartedAtMs: number | null;
  autoXrayFired: boolean;
  autoSerpFired: boolean;
  autoDiagFired: boolean;
  autoPrepFired: boolean;
  autoEvidenceFired: boolean;
}

const XRAY_STUCK_MS   = 90_000;   // 90s running = likely stuck
const SERP_STUCK_MS   = 90_000;
const PREP_STUCK_MS   = 120_000;  // 2min = definitely stuck
const DIAG_STUCK_MS   = 90_000;
const PREP_MISSING_MS = 25_000;   // 25s after fire with no data = silent failure
const DIAG_MISSING_MS = 8_000;    // should trigger very quickly once deps done

export function runWatchdog(input: WatchdogInput): WatchdogFinding[] {
  const findings: WatchdogFinding[] = [];
  const { lead, mountedAtMs, nowMs } = input;
  const ageMs = nowMs - mountedAtMs;

  const eb            = lead?.evidenceBundle || {};
  const gbp           = eb?.gbp;
  const website       = eb?.website;
  const prepPack      = lead?.prepCallPack;
  const aiGrowthPlan  = lead?.aiGrowthPlan;
  const nbs           = lead?.nextBestSteps;
  const sourceData    = lead?.sourceData || {};

  // ── 1. Evidence exists in bundle but is not reflected in sourceData ─────────
  if (gbp?.placeId && !sourceData?.googlePlaceId && !input.evidenceRunning) {
    findings.push({
      id: 'data-gbp-bundle-sourcefield-mismatch',
      severity: 'medium',
      confidence: 'high',
      category: 'data-pipeline',
      summary: 'Evidence bundle has a GBP Place ID but sourceData.googlePlaceId is missing',
      likelyCause: 'Evidence bundle was written by gather-evidence but the lead.sourceData sync did not run or was skipped',
      recommendedFix: 'Ensure gather-evidence writes GBP placeId into both evidenceBundle.gbp AND sourceData.googlePlaceId, or add a sync step post-gather',
      evidence: [
        `evidenceBundle.gbp.placeId: ${gbp.placeId}`,
        `sourceData.googlePlaceId: ${sourceData?.googlePlaceId ?? 'undefined'}`,
      ],
    });
  }

  // ── 2. Prep pack has empty/truncated sections ────────────────────────────────
  if (prepPack && !input.prepRunning) {
    const REQUIRED = ['businessSnapshot', 'customerProfile', 'opportunities', 'callPriorities', 'discoveryQuestions'];
    const empty = REQUIRED.filter(f => {
      const v = prepPack[f];
      if (!v) return true;
      if (typeof v === 'string' && v.trim().length < 15) return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    });
    if (empty.length >= 2) {
      findings.push({
        id: 'prompt-prep-pack-truncated',
        severity: 'medium',
        confidence: 'medium',
        category: 'prompt-output',
        summary: `Prep pack appears truncated — ${empty.length}/${REQUIRED.length} required sections are empty or very short`,
        likelyCause: 'max_tokens may be too low, causing GPT to truncate later sections. Dense prompt competing with long output.',
        recommendedFix: 'Increase max_tokens (currently 3000), or split into two prompt passes (snapshot + discovery). Check prompt token count.',
        evidence: [`Empty/minimal fields: ${empty.join(', ')}`],
      });
    }
  }

  // ── 3. X-Ray running too long ────────────────────────────────────────────────
  if (input.xrayRunning && input.xrayStartedAtMs) {
    const elapsed = nowMs - input.xrayStartedAtMs;
    if (elapsed > XRAY_STUCK_MS) {
      findings.push({
        id: 'orchestration-xray-stuck',
        severity: 'high',
        confidence: 'medium',
        category: 'orchestration',
        summary: `Website X-Ray has been running for ${Math.round(elapsed / 1000)}s — likely stuck`,
        likelyCause: 'Crawl hanging on a slow/unresponsive domain, or server-side timeout not firing',
        recommendedFix: 'Add a 60s hard timeout to the crawl step and return partial results rather than hanging',
        evidence: [`xray running: ${Math.round(elapsed / 1000)}s`, `lead.website: ${lead?.website || 'unknown'}`],
      });
    }
  }

  // ── 4. SERP running too long ─────────────────────────────────────────────────
  if (input.serpRunning && input.serpStartedAtMs) {
    const elapsed = nowMs - input.serpStartedAtMs;
    if (elapsed > SERP_STUCK_MS) {
      findings.push({
        id: 'orchestration-serp-stuck',
        severity: 'high',
        confidence: 'medium',
        category: 'orchestration',
        summary: `SEO analysis has been running for ${Math.round(elapsed / 1000)}s — likely stuck`,
        likelyCause: 'External SERP lookup or model generation hanging without propagating a timeout',
        recommendedFix: 'Add a 75s server-side timeout to /api/ai/growth-plan/serp-analysis and return partial data',
        evidence: [`serp running: ${Math.round(elapsed / 1000)}s`],
      });
    }
  }

  // ── 5. Prep pack running too long ────────────────────────────────────────────
  if (input.prepRunning && input.prepStartedAtMs) {
    const elapsed = nowMs - input.prepStartedAtMs;
    if (elapsed > PREP_STUCK_MS) {
      findings.push({
        id: 'orchestration-prep-stuck',
        severity: 'high',
        confidence: 'high',
        category: 'orchestration',
        summary: `Prep Specialist has been running for ${Math.round(elapsed / 1000)}s — likely stuck or timed out`,
        likelyCause: 'GPT generation or upstream evidence crawl hung server-side without surfacing an error',
        recommendedFix: 'Add a 90s hard timeout to /api/leads/:id/generate-prep-pack and return partial pack on timeout',
        evidence: [`prep running: ${Math.round(elapsed / 1000)}s`],
      });
    }
  }

  // ── 6. Strategy Diagnosis not triggered despite X-Ray + SERP both done ───────
  if (
    !input.diagRunning && !input.autoDiagFired &&
    aiGrowthPlan?.xray && aiGrowthPlan?.serp &&
    !aiGrowthPlan?.strategyDiagnosis &&
    ageMs > DIAG_MISSING_MS
  ) {
    findings.push({
      id: 'orchestration-diag-not-triggered',
      severity: 'medium',
      confidence: 'high',
      category: 'orchestration',
      summary: 'X-Ray and SERP are both present but Strategy Diagnosis never triggered',
      likelyCause: 'autoDiagFired guard already set from a previous mount, or xrayDone/serpDone derived flags did not update correctly after Firestore onSnapshot',
      recommendedFix: 'Verify xrayDone/serpDone derivation in DealLiveActivityFeed — check that Redux lead state reflects the latest Firestore data after onSnapshot fires',
      evidence: [
        'aiGrowthPlan.xray: present',
        'aiGrowthPlan.serp: present',
        'aiGrowthPlan.strategyDiagnosis: absent',
        `autoDiagFired: ${input.autoDiagFired}`,
      ],
    });
  }

  // ── 7. Prep fired but no data arrived after timeout ──────────────────────────
  if (input.autoPrepFired && !input.prepRunning && !prepPack?.businessSnapshot && ageMs > PREP_MISSING_MS) {
    findings.push({
      id: 'data-prep-silent-failure',
      severity: 'high',
      confidence: 'medium',
      category: 'data-pipeline',
      summary: 'Prep pack was triggered but no data appeared — likely a silent server failure',
      likelyCause: 'Server error swallowed by silent catch in auto-fire effect, or Firestore write failed after generation',
      recommendedFix: 'Log errors explicitly in /api/leads/:id/generate-prep-pack. Surface failure state to client so UI can show retry instead of empty panel.',
      evidence: [
        'autoPrepFired: true',
        'prepRunning: false',
        `${Math.round(ageMs / 1000)}s since mount`,
        'prepCallPack.businessSnapshot: absent',
      ],
    });
  }

  // ── 8. Lead has website but X-Ray never triggered ────────────────────────────
  if (lead?.website && !input.autoXrayFired && !aiGrowthPlan?.xray && ageMs > 15_000) {
    findings.push({
      id: 'workflow-friction-xray-skipped',
      severity: 'medium',
      confidence: 'medium',
      category: 'workflow-friction',
      summary: 'Lead has a website URL but Website X-Ray was never auto-triggered',
      likelyCause: 'hasXray guard blocked auto-fire even though no cached result exists, or websiteUrl was falsy/undefined at mount time',
      recommendedFix: 'Check hasXray derivation in DealLiveActivityFeed — if aiGrowthPlan.xray is absent and websiteUrl is present at mount, auto-fire should proceed',
      evidence: [
        `lead.website: ${lead.website}`,
        'autoXrayFired: false',
        'aiGrowthPlan.xray: absent',
        `${Math.round(ageMs / 1000)}s since mount`,
      ],
    });
  }

  // ── 9. Evidence gathered but website card shows no crawl data ────────────────
  if (website?.success === false && website?.error && !input.xrayRunning) {
    findings.push({
      id: 'data-pipeline-crawl-failed',
      severity: 'low',
      confidence: 'high',
      category: 'data-pipeline',
      summary: `Website crawl completed with an error — X-Ray analysis may be missing crawl grounding`,
      likelyCause: `Crawl returned: "${website.error}"`,
      recommendedFix: 'Crawl errors are expected for some sites. Ensure the X-Ray prompt gracefully handles missing crawl data and still generates useful signals from domain/business name.',
      evidence: [`eb.website.error: ${website.error}`, `eb.website.success: false`],
    });
  }

  // ── 10. NBS is empty despite prep + evidence being available ─────────────────
  if (
    prepPack?.businessSnapshot && (gbp?.placeId || website?.url) &&
    !nbs?.steps?.length && !input.prepRunning && ageMs > 45_000
  ) {
    findings.push({
      id: 'data-nbs-absent-despite-evidence',
      severity: 'medium',
      confidence: 'low',
      category: 'data-pipeline',
      summary: 'Prep pack and evidence are present but Next Best Steps is empty',
      likelyCause: 'NBS auto-fire may not have triggered, server may have returned empty steps, or provisional NBS was never promoted to full NBS',
      recommendedFix: 'Check autoNbsFired/autoProvNbsFired refs in DealIntelligencePanel. Verify /api/leads/:id/next-best-steps returns non-empty steps when evidence is available.',
      evidence: [
        'prepCallPack.businessSnapshot: present',
        gbp?.placeId ? 'eb.gbp: present' : 'eb.website: present',
        'nextBestSteps.steps: empty/absent',
        `${Math.round(ageMs / 1000)}s since mount`,
      ],
    });
  }

  // ── 11. Evidence bundle is stale but auto-refresh didn't fire ────────────────
  if (!input.autoEvidenceFired && !input.evidenceRunning && ageMs > 5_000) {
    const gatheredAt = eb?.gatheredAt;
    if (gatheredAt) {
      const bundleAge = nowMs - new Date(gatheredAt).getTime();
      const STALE_48H = 48 * 60 * 60 * 1000;
      if (bundleAge > STALE_48H && (lead?.companyName)) {
        findings.push({
          id: 'workflow-friction-stale-evidence-not-refreshed',
          severity: 'low',
          confidence: 'medium',
          category: 'workflow-friction',
          summary: `Evidence bundle is ${Math.round(bundleAge / 3600000)}h old but auto-refresh was skipped`,
          likelyCause: 'autoEvidenceFired guard was already set from a previous session, or the stale threshold check returned false unexpectedly',
          recommendedFix: 'Confirm evidenceIsStale threshold logic in DealLiveActivityFeed is using the correct OBSERVED_STALE_MS constant (86400000ms)',
          evidence: [
            `evidenceBundle.gatheredAt: ${gatheredAt}`,
            `Bundle age: ~${Math.round(bundleAge / 3600000)}h`,
            'autoEvidenceFired: false',
          ],
        });
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouping layer — collapses related individual findings into root-issue cards
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchdogRootIssue {
  id: string;
  severity: WatchdogSeverity;
  confidence: WatchdogConfidence;
  summary: string;
  likelyCause?: string;
  recommendedFix?: string;
  childFindings: WatchdogFinding[];
  childFindingIds: string[];
  /** true when this root issue was synthesised from >1 finding */
  grouped: boolean;
}

interface RootGroupDef {
  id: string;
  summary: string;
  likelyCause: string;
  recommendedFix: string;
  matchIds: string[];
}

const ROOT_GROUP_DEFS: RootGroupDef[] = [
  {
    id: 'root-orchestration-bottleneck',
    summary: 'Analysis pipeline is stalled or stuck',
    likelyCause:
      'A server-side timeout is not propagating correctly, or a derived dependency flag (xrayDone/serpDone) did not update after Firestore onSnapshot fired.',
    recommendedFix:
      'Add hard timeouts to all async analysis routes. Verify Redux lead state reflects the latest Firestore data before triggering downstream stages.',
    matchIds: [
      'orchestration-prep-stuck',
      'orchestration-xray-stuck',
      'orchestration-serp-stuck',
      'orchestration-diag-not-triggered',
    ],
  },
  {
    id: 'root-data-pipeline-failure',
    summary: 'Pipeline ran but data did not land — outputs missing or mismatched',
    likelyCause:
      'A silent catch in an auto-fire effect likely swallowed a server error, or a Firestore write failed after generation completed.',
    recommendedFix:
      'Add explicit error logging to auto-fire effects. Surface failure state to the client so the UI shows a retry option instead of an empty panel.',
    matchIds: [
      'data-prep-silent-failure',
      'data-nbs-absent-despite-evidence',
      'data-gbp-bundle-sourcefield-mismatch',
      'data-pipeline-crawl-failed',
    ],
  },
  {
    id: 'root-workflow-friction',
    summary: 'Expected auto-start behaviours did not fire',
    likelyCause:
      'Auto-fire guard refs (useRef) may be blocking re-fires after stale state, or mount-time conditions were not met when the lead was opened.',
    recommendedFix:
      'Check auto-fire guard logic in DealLiveActivityFeed. Ensure all conditions are evaluated against the latest lead state, not stale closure values.',
    matchIds: [
      'workflow-friction-xray-skipped',
      'workflow-friction-stale-evidence-not-refreshed',
    ],
  },
];

function severityRank(s: WatchdogSeverity): number {
  return s === 'high' ? 2 : s === 'medium' ? 1 : 0;
}

function maxSeverity(findings: WatchdogFinding[]): WatchdogSeverity {
  return findings.reduce<WatchdogSeverity>((max, f) =>
    severityRank(f.severity) > severityRank(max) ? f.severity : max,
    'low',
  );
}

function maxConfidence(findings: WatchdogFinding[]): WatchdogConfidence {
  const rank = (c: WatchdogConfidence) => c === 'high' ? 2 : c === 'medium' ? 1 : 0;
  return findings.reduce<WatchdogConfidence>((max, f) =>
    rank(f.confidence) > rank(max) ? f.confidence : max,
    'low',
  );
}

/**
 * Collapses individual WatchdogFindings into a smaller list of WatchdogRootIssues.
 * Findings that match a group definition are rolled up under that group.
 * Unmatched findings become standalone root issues (grouped: false).
 * The result is sorted high → medium → low severity.
 */
export function groupWatchdogFindings(findings: WatchdogFinding[]): WatchdogRootIssue[] {
  const claimed = new Set<string>();
  const roots: WatchdogRootIssue[] = [];

  for (const def of ROOT_GROUP_DEFS) {
    const children = findings.filter(f => def.matchIds.includes(f.id));
    if (children.length === 0) continue;

    children.forEach(f => claimed.add(f.id));

    roots.push({
      id: def.id,
      severity: maxSeverity(children),
      confidence: maxConfidence(children),
      summary: def.summary,
      likelyCause: def.likelyCause,
      recommendedFix: def.recommendedFix,
      childFindings: children,
      childFindingIds: children.map(f => f.id),
      grouped: children.length > 1,
    });
  }

  // Wrap unclaimed findings as standalone root issues
  for (const f of findings) {
    if (claimed.has(f.id)) continue;
    roots.push({
      id: `standalone-${f.id}`,
      severity: f.severity,
      confidence: f.confidence,
      summary: f.summary,
      likelyCause: f.likelyCause,
      recommendedFix: f.recommendedFix,
      childFindings: [f],
      childFindingIds: [f.id],
      grouped: false,
    });
  }

  // Sort high → medium → low
  return roots.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
