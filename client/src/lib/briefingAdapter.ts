// ── Manager Daily Briefing — Derivation Adapter ───────────────────────────────
// Pure function. Zero async. Zero side-effects.
// Derives a DailyBriefing from existing Redux state + Firestore slices passed in.
// All dates in DD/MM/YYYY format — NON-NEGOTIABLE.

import { format } from 'date-fns';
import { deriveCadenceState } from '@/lib/cadenceAdapter';
import { deriveExpansionState } from '@/lib/expansionAdapter';
import { deriveReferralCandidates } from '@/lib/referralAdapter';
import type { Lead, Client } from '@/lib/types';
import type { SweepAction } from '@/lib/sweepTypes';
import type { CommunicationHistoryItem } from '@/lib/execAutomationTypes';
import type {
  DailyBriefing,
  BriefingItem,
  BriefingSection,
  BriefingSectionType,
  BriefingChange,
  BriefingDebugEntry,
  BriefingPriority,
  BriefingSourceSnapshot,
  BriefingSummary,
  BriefingSnapshot,
} from '@/lib/briefingTypes';
import { BRIEFING_PRIORITY_ORDER } from '@/lib/briefingTypes';

// ── Input ─────────────────────────────────────────────────────────────────────

export interface BriefingAdapterInput {
  leads: Lead[];
  clients: Client[];
  sweepActions: SweepAction[];
  commHistory: CommunicationHistoryItem[];
  previousSnapshot?: BriefingSnapshot;
  reviewedItemIds?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return format(new Date(), 'dd/MM/yyyy');
}

function now(): string {
  return format(new Date(), 'dd/MM/yyyy HH:mm');
}

function uid(prefix: string, id: string): string {
  return `${prefix}::${id}`;
}

function sortByPriority(items: BriefingItem[]): BriefingItem[] {
  return [...items].sort((a, b) => BRIEFING_PRIORITY_ORDER[a.priority] - BRIEFING_PRIORITY_ORDER[b.priority]);
}

function topPriorityOf(items: BriefingItem[]): BriefingPriority {
  if (items.some(i => i.priority === 'critical')) return 'critical';
  if (items.some(i => i.priority === 'urgent')) return 'urgent';
  if (items.some(i => i.priority === 'important')) return 'important';
  return 'watchlist';
}

// ── Section builders ─────────────────────────────────────────────────────────

// 1. APPROVALS — sweep actions waiting for human review
function buildApprovalsSection(
  sweepActions: SweepAction[],
  reviewedIds: Set<string>,
  debug: BriefingDebugEntry[],
): BriefingSection {
  const pending = sweepActions.filter(a => {
    if (a.outcome !== 'approval_queued') return false;
    const id = uid('sweep', a.id ?? a.entityId);
    if (reviewedIds.has(id)) return false;
    return true;
  });

  const items: BriefingItem[] = pending.map(action => {
    const id = uid('sweep', action.id ?? action.entityId);
    const priority: BriefingPriority = action.priority === 'urgent' ? 'critical'
      : action.priority === 'high' ? 'urgent'
      : 'important';

    debug.push({
      entityId: action.entityId,
      entityName: action.entityName,
      sourceLayer: 'sweep',
      included: true,
      includeReason: `Sweep action queued for approval — priority: ${action.priority}`,
      priority,
      evaluatedAt: now(),
    });

    return {
      id,
      entityId: action.entityId,
      entityName: action.entityName,
      entityType: action.entityType,
      title: action.suggestedAction,
      why: action.reason,
      context: action.scope ? `Sweep scope: ${action.scope}` : undefined,
      priority,
      action: 'approve',
      actionLabel: 'Approve Now',
      drilldown: { label: 'Open Execution Queue', path: '/execution' },
      sourceLayer: 'sweep',
      facts: action.contextFacts?.slice(0, 3) ?? [],
    };
  });

  const summary = pending.length === 0
    ? 'No approvals waiting'
    : `${pending.length} action${pending.length > 1 ? 's' : ''} waiting for approval`;

  return {
    type: 'approvals',
    label: 'Approvals Waiting',
    items: sortByPriority(items),
    summary,
    topPriority: topPriorityOf(items),
  };
}

// 2. RISKS — churn risks + failed/bounced sends
function buildRisksSection(
  clients: Client[],
  commHistory: CommunicationHistoryItem[],
  reviewedIds: Set<string>,
  debug: BriefingDebugEntry[],
): BriefingSection {
  const items: BriefingItem[] = [];

  // Churn risks from expansion engine
  const expansionState = deriveExpansionState(clients);
  for (const risk of expansionState.activeChurnRisks) {
      const id = uid('churn', risk.id);
      if (reviewedIds.has(id)) continue;

      const priority: BriefingPriority =
        risk.severity === 'critical' ? 'critical'
        : risk.severity === 'high' ? 'urgent'
        : risk.severity === 'medium' ? 'important'
        : 'watchlist';

      // Only include critical, high, medium in risks section
      if (risk.severity === 'low') {
        debug.push({ entityId: risk.clientId, entityName: risk.clientName, sourceLayer: 'expansion', included: false, excludeReason: 'Low severity churn risk — added to watchlist instead', evaluatedAt: now() });
        continue;
      }

      debug.push({
        entityId: risk.clientId,
        entityName: risk.clientName,
        sourceLayer: 'expansion',
        included: true,
        includeReason: `Churn risk severity: ${risk.severity}, urgency: ${risk.urgency}`,
        priority,
        evaluatedAt: now(),
      });

      items.push({
        id,
        entityId: risk.clientId,
        entityName: risk.clientName,
        entityType: 'client',
        title: risk.title,
        why: risk.likelyCause,
        context: `Suggested intervention: ${risk.suggestedIntervention}`,
        priority,
        action: 'intervene',
        actionLabel: 'Intervene',
        drilldown: { label: 'Open Expansion Workspace', path: '/clients', entityId: risk.clientId },
        sourceLayer: 'expansion',
        facts: risk.indicators.slice(0, 3),
      });
  }

  // Failed / bounced sends from recent comm history
  const failedSends = commHistory.filter(h => {
    const ds = (h as any).deliveryStatus;
    return ds === 'failed' || ds === 'bounced' || ds === 'rejected' || h.status === 'failed';
  });

  for (const fail of failedSends) {
    const id = uid('send_fail', fail.id ?? fail.sentAt);
    if (reviewedIds.has(id)) continue;

    debug.push({
      entityId: fail.entityId,
      entityName: fail.entityName,
      sourceLayer: 'comms',
      included: true,
      includeReason: `Send failed — deliveryStatus: ${(fail as any).deliveryStatus ?? 'failed'}`,
      priority: 'urgent',
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: fail.entityId,
      entityName: fail.entityName,
      entityType: fail.entityType as any ?? 'lead',
      title: `Failed ${fail.channel} send — ${fail.summary}`,
      why: `A ${fail.channel} to ${fail.entityName} failed delivery and needs attention.`,
      context: (fail as any).errorReason ?? undefined,
      priority: 'urgent',
      action: 'retry_send',
      actionLabel: 'Retry Send',
      drilldown: { label: 'Open Execution Queue', path: '/execution' },
      sourceLayer: 'comms',
      facts: [
        `Channel: ${fail.channel}`,
        `Sent at: ${fail.sentAt}`,
        (fail as any).providerName ? `Provider: ${(fail as any).providerName}` : 'Provider: fallback',
      ].filter(Boolean),
    });
  }

  const summary = items.length === 0
    ? 'No risks detected'
    : `${items.length} risk${items.length > 1 ? 's' : ''} requiring attention`;

  return {
    type: 'risks',
    label: 'Risks Detected',
    items: sortByPriority(items),
    summary,
    topPriority: topPriorityOf(items),
  };
}

// 3. OPPORTUNITIES — expansion + referral
function buildOpportunitiesSection(
  clients: Client[],
  reviewedIds: Set<string>,
  debug: BriefingDebugEntry[],
): BriefingSection {
  const items: BriefingItem[] = [];

  const expansionState = deriveExpansionState(clients);

  // Hot expansion opportunities (urgent + high confidence)
  for (const opp of expansionState.topOpportunities) {
    if (opp.priority !== 'urgent' && opp.priority !== 'high') continue;
    if (opp.confidence === 'low') continue;

    const id = uid('expansion', opp.id);
    if (reviewedIds.has(id)) continue;

    const priority: BriefingPriority = opp.priority === 'urgent' ? 'urgent' : 'important';

    debug.push({
      entityId: opp.clientId,
      entityName: opp.clientName,
      sourceLayer: 'expansion',
      included: true,
      includeReason: `Expansion opportunity — priority: ${opp.priority}, confidence: ${opp.confidence}`,
      priority,
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: opp.clientId,
      entityName: opp.clientName,
      entityType: 'client',
      title: opp.title,
      why: opp.why,
      context: opp.conversationAngle,
      priority,
      action: 'contact',
      actionLabel: 'Plan Conversation',
      drilldown: { label: 'Open Expansion Workspace', path: '/clients', entityId: opp.clientId },
      sourceLayer: 'expansion',
      facts: [
        `Type: ${opp.type.replace(/_/g, ' ')}`,
        `Confidence: ${opp.confidence}`,
        opp.estimatedImpact ? `Impact: ${opp.estimatedImpact}` : '',
      ].filter(Boolean),
    });
  }

  // Referral-ready accounts (readinessScore >= 70)
  const referralCandidates = deriveReferralCandidates(clients);
  for (const candidate of referralCandidates) {
    if (candidate.readinessScore < 70) {
      debug.push({ entityId: candidate.clientId, entityName: candidate.clientName, sourceLayer: 'referral', included: false, excludeReason: `Readiness score ${candidate.readinessScore} < 70`, evaluatedAt: now() });
      continue;
    }

    const id = uid('referral', candidate.clientId);
    if (reviewedIds.has(id)) continue;

    const priority: BriefingPriority = candidate.readinessScore >= 90 ? 'urgent' : 'important';

    debug.push({
      entityId: candidate.clientId,
      entityName: candidate.clientName,
      sourceLayer: 'referral',
      included: true,
      includeReason: `Referral readiness: ${candidate.readinessScore}/100 — tier: ${candidate.readinessTier}`,
      priority,
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: candidate.clientId,
      entityName: candidate.clientName,
      entityType: 'client',
      title: `Referral opportunity — ${candidate.clientName}`,
      why: candidate.styleReason,
      context: candidate.conversationAngle,
      priority,
      action: 'contact',
      actionLabel: 'Start Referral Ask',
      drilldown: { label: 'Open Referral Engine', path: '/clients', entityId: candidate.clientId },
      sourceLayer: 'referral',
      facts: [
        `Readiness: ${candidate.readinessScore}/100`,
        `Style: ${candidate.recommendedStyle.replace(/_/g, ' ')}`,
        `Timing: ${candidate.suggestedTiming}`,
      ],
    });
  }

  const summary = items.length === 0
    ? 'No high-confidence opportunities right now'
    : `${items.length} opportunity${items.length > 1 ? 'ies' : ''} worth pursuing today`;

  return {
    type: 'opportunities',
    label: 'Hot Opportunities',
    items: sortByPriority(items),
    summary,
    topPriority: topPriorityOf(items),
  };
}

// 4. BLOCKED — stalled pipeline leads + onboarding blocks
function buildBlockedSection(
  leads: Lead[],
  clients: Client[],
  reviewedIds: Set<string>,
  debug: BriefingDebugEntry[],
): BriefingSection {
  const items: BriefingItem[] = [];
  const now_date = new Date();
  const STALE_DAYS = 14; // proposal leads with no contact in 14+ days

  // Leads stuck in 'proposal' stage with no recent contact
  for (const lead of leads) {
    if (lead.archived) continue;
    if (lead.stage !== 'proposal') continue;

    const lastContact = lead.lastContactDate ? new Date(lead.lastContactDate) : null;
    const daysSince = lastContact
      ? Math.floor((now_date.getTime() - lastContact.getTime()) / 86_400_000)
      : null;

    if (daysSince !== null && daysSince < STALE_DAYS) {
      debug.push({ entityId: lead.id, entityName: lead.companyName, sourceLayer: 'proposal', included: false, excludeReason: `Proposal lead but only ${daysSince} days since last contact (< ${STALE_DAYS})`, evaluatedAt: now() });
      continue;
    }

    const id = uid('blocked_lead', lead.id);
    if (reviewedIds.has(id)) continue;

    const priority: BriefingPriority = daysSince === null ? 'important'
      : daysSince >= 30 ? 'urgent'
      : 'important';

    debug.push({
      entityId: lead.id,
      entityName: lead.companyName,
      sourceLayer: 'proposal',
      included: true,
      includeReason: `Proposal stage lead — ${daysSince !== null ? `${daysSince} days` : 'no record'} since last contact`,
      priority,
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      title: 'Proposal stalled — needs follow-up',
      why: daysSince !== null
        ? `No contact recorded for ${daysSince} days. Proposal may be going cold.`
        : 'No contact date recorded for a lead in the proposal stage.',
      priority,
      action: 'contact',
      actionLabel: 'Follow Up',
      drilldown: { label: 'Open Pipeline', path: '/pipeline', entityId: lead.id },
      sourceLayer: 'proposal',
      facts: [
        `Stage: Proposal`,
        daysSince !== null ? `Last contact: ${daysSince}d ago` : 'No contact on record',
        lead.contactName ? `Contact: ${lead.contactName}` : '',
      ].filter(Boolean),
    });
  }

  // Clients with deliveryStatus === 'blocked' or 'onboarding' + health red
  for (const client of clients) {
    if (client.archived) continue;
    if (client.deliveryStatus !== 'blocked' && !(client.deliveryStatus === 'onboarding' && client.healthStatus === 'red')) continue;

    const id = uid('blocked_client', client.id);
    if (reviewedIds.has(id)) continue;

    const isBlocked = client.deliveryStatus === 'blocked';
    const priority: BriefingPriority = isBlocked ? 'urgent' : 'important';

    debug.push({
      entityId: client.id,
      entityName: client.businessName,
      sourceLayer: 'onboarding',
      included: true,
      includeReason: `Client deliveryStatus=${client.deliveryStatus}, healthStatus=${client.healthStatus}`,
      priority,
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      title: isBlocked ? 'Delivery blocked — needs escalation' : 'Onboarding stalled — red health',
      why: isBlocked
        ? 'This client is in a blocked delivery state and cannot progress without intervention.'
        : 'Client is in onboarding with red health status — risk of early churn.',
      priority,
      action: isBlocked ? 'escalate' : 'intervene',
      actionLabel: isBlocked ? 'Escalate' : 'Intervene',
      drilldown: { label: 'Open Client Profile', path: '/clients', entityId: client.id },
      sourceLayer: 'onboarding',
      facts: [
        `Delivery: ${client.deliveryStatus}`,
        `Health: ${client.healthStatus}`,
        client.primaryContactName ? `Contact: ${client.primaryContactName}` : '',
      ].filter(Boolean),
    });
  }

  const summary = items.length === 0
    ? 'No blocked items'
    : `${items.length} item${items.length > 1 ? 's' : ''} blocked or stalled`;

  return {
    type: 'blocked',
    label: 'Blocked Items',
    items: sortByPriority(items),
    summary,
    topPriority: topPriorityOf(items),
  };
}

// 5. WATCHLIST — overdue cadence, upcoming this-week
function buildWatchlistSection(
  leads: Lead[],
  clients: Client[],
  reviewedIds: Set<string>,
  debug: BriefingDebugEntry[],
): BriefingSection {
  const items: BriefingItem[] = [];

  const cadenceState = deriveCadenceState(leads, clients, {});

  // Overdue cadence items (all)
  const overdue = cadenceState.overdueItems.slice(0, 10);
  for (const item of overdue) {
    const id = uid('cadence_overdue', item.id);
    if (reviewedIds.has(id)) continue;

    const daysPast = item.overdueDays ?? 0;
    const priority: BriefingPriority = daysPast >= 7 ? 'urgent' : 'important';

    debug.push({
      entityId: item.entityId,
      entityName: item.entityName,
      sourceLayer: 'cadence',
      included: true,
      includeReason: `Overdue cadence — ${daysPast} days past due`,
      priority,
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: item.entityId,
      entityName: item.entityName,
      entityType: item.entityType,
      title: item.title,
      why: `This cadence touch is ${daysPast} day${daysPast !== 1 ? 's' : ''} overdue.`,
      priority,
      action: 'contact',
      actionLabel: 'Act Now',
      drilldown: { label: 'Open Execution Queue', path: '/execution' },
      sourceLayer: 'cadence',
      facts: [
        `Category: ${item.category?.replace(/_/g, ' ') ?? 'unknown'}`,
        `Overdue by: ${daysPast} day${daysPast !== 1 ? 's' : ''}`,
        `Channel: ${item.recommendedChannel ?? 'email'}`,
      ],
    });
  }

  // Due today
  for (const item of cadenceState.dueTodayItems.slice(0, 5)) {
    const id = uid('cadence_today', item.id);
    if (reviewedIds.has(id)) continue;

    debug.push({
      entityId: item.entityId,
      entityName: item.entityName,
      sourceLayer: 'cadence',
      included: true,
      includeReason: 'Cadence item due today',
      priority: 'important',
      evaluatedAt: now(),
    });

    items.push({
      id,
      entityId: item.entityId,
      entityName: item.entityName,
      entityType: item.entityType,
      title: item.title,
      why: 'Due today — keep momentum going.',
      priority: 'important',
      action: 'contact',
      actionLabel: 'Start Draft',
      drilldown: { label: 'Open Execution Queue', path: '/execution' },
      sourceLayer: 'cadence',
      facts: [
        `Category: ${item.category?.replace(/_/g, ' ') ?? 'unknown'}`,
        `Channel: ${item.recommendedChannel ?? 'email'}`,
      ],
    });
  }

  const summary = items.length === 0
    ? 'Watchlist clear'
    : `${items.length} item${items.length > 1 ? 's' : ''} to stay on top of`;

  return {
    type: 'watchlist',
    label: 'Watchlist',
    items: sortByPriority(items),
    summary,
    topPriority: topPriorityOf(items),
  };
}

// 6. CHANGES — what shifted since previous snapshot
function buildChangesSection(
  current: BriefingSourceSnapshot,
  previous?: BriefingSnapshot,
): BriefingChange[] {
  if (!previous) return [];
  const prev = previous.sourceSnapshot;
  const changes: BriefingChange[] = [];

  const deltas: Array<{
    key: keyof BriefingSourceSnapshot;
    label: string;
    criticalThreshold: number;
  }> = [
    { key: 'churnCriticalCount', label: 'Critical churn risks', criticalThreshold: 1 },
    { key: 'failedSendsCount', label: 'Failed sends', criticalThreshold: 1 },
    { key: 'pendingApprovalsCount', label: 'Pending approvals', criticalThreshold: 3 },
    { key: 'churnRisksCount', label: 'Churn risk accounts', criticalThreshold: 2 },
    { key: 'overdueLeadsCount', label: 'Overdue leads', criticalThreshold: 3 },
    { key: 'overdueClientsCount', label: 'Overdue clients', criticalThreshold: 2 },
    { key: 'expansionOpportunitiesCount', label: 'Expansion opportunities', criticalThreshold: 99 },
    { key: 'referralCandidatesCount', label: 'Referral-ready accounts', criticalThreshold: 99 },
  ];

  for (const d of deltas) {
    const curr = current[d.key] ?? 0;
    const prevVal = prev[d.key] ?? 0;
    if (curr === prevVal) continue;

    const diff = curr - prevVal;
    const delta = diff > 0 ? 'increased' : 'decreased';
    const magnitude = Math.abs(diff) >= d.criticalThreshold ? 'critical' : Math.abs(diff) >= 1 ? 'significant' : 'minor';

    changes.push({
      id: `change::${d.key}`,
      label: d.label,
      delta,
      magnitude,
      context: `${prevVal} → ${curr} (${diff > 0 ? '+' : ''}${diff})`,
    });
  }

  return changes;
}

// ── Source snapshot ───────────────────────────────────────────────────────────

function buildSourceSnapshot(
  leads: Lead[],
  clients: Client[],
  sweepActions: SweepAction[],
  commHistory: CommunicationHistoryItem[],
): BriefingSourceSnapshot {
  const cadence = deriveCadenceState(leads, clients, {});
  const expansion = deriveExpansionState(clients);
  const referrals = deriveReferralCandidates(clients);

  return {
    overdueLeadsCount: cadence.overdueItems.filter(i => i.entityType === 'lead').length,
    overdueClientsCount: cadence.overdueItems.filter(i => i.entityType === 'client').length,
    totalPendingCadenceItems: cadence.totalPending,
    churnRisksCount: expansion.activeChurnRisks.filter(r => r.severity !== 'low').length,
    churnCriticalCount: expansion.activeChurnRisks.filter(r => r.severity === 'critical').length,
    expansionOpportunitiesCount: expansion.topOpportunities.filter(o => o.priority === 'urgent' || o.priority === 'high').length,
    referralCandidatesCount: referrals.filter(r => r.readinessScore >= 70).length,
    pendingApprovalsCount: sweepActions.filter(a => a.outcome === 'approval_queued').length,
    failedSendsCount: commHistory.filter(h => (h as any).deliveryStatus === 'failed' || (h as any).deliveryStatus === 'bounced' || h.status === 'failed').length,
    blockedLeadsCount: leads.filter(l => !l.archived && l.stage === 'proposal').length,
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function buildSummary(sections: BriefingSection[]): BriefingSummary {
  const all = sections.flatMap(s => s.items);
  return {
    totalItems: all.length,
    criticalCount: all.filter(i => i.priority === 'critical').length,
    urgentCount: all.filter(i => i.priority === 'urgent').length,
    importantCount: all.filter(i => i.priority === 'important').length,
    approvalsWaiting: sections.find(s => s.type === 'approvals')?.items.length ?? 0,
    risksDetected: sections.find(s => s.type === 'risks')?.items.length ?? 0,
    opportunitiesAvailable: sections.find(s => s.type === 'opportunities')?.items.length ?? 0,
    blockedCount: sections.find(s => s.type === 'blocked')?.items.length ?? 0,
    watchlistCount: sections.find(s => s.type === 'watchlist')?.items.length ?? 0,
  };
}

// ── Main derivation ───────────────────────────────────────────────────────────

export function deriveDailyBriefing(input: BriefingAdapterInput): DailyBriefing {
  const { leads, clients, sweepActions, commHistory, previousSnapshot, reviewedItemIds = [] } = input;
  const reviewedIds = new Set<string>(reviewedItemIds);
  const debugLog: BriefingDebugEntry[] = [];
  const ts = now();

  const sourceSnapshot = buildSourceSnapshot(leads, clients, sweepActions, commHistory);

  const approvalsSection = buildApprovalsSection(sweepActions, reviewedIds, debugLog);
  const risksSection     = buildRisksSection(clients, commHistory, reviewedIds, debugLog);
  const oppsSection      = buildOpportunitiesSection(clients, reviewedIds, debugLog);
  const blockedSection   = buildBlockedSection(leads, clients, reviewedIds, debugLog);
  const watchlistSection = buildWatchlistSection(leads, clients, reviewedIds, debugLog);

  const sections: BriefingSection[] = [
    approvalsSection,
    risksSection,
    oppsSection,
    blockedSection,
    watchlistSection,
  ].filter(s => s.items.length > 0 || s.type === 'approvals'); // Always show approvals even if clear

  const allItems = sections.flatMap(s => s.items);
  const summary = buildSummary(sections);

  // Top action = highest priority item overall
  const topAction = allItems.length > 0
    ? sortByPriority(allItems)[0]
    : null;

  // Changes vs previous
  const changes = buildChangesSection(sourceSnapshot, previousSnapshot);

  return {
    generatedAt: ts,
    briefingDate: today(),
    summary,
    topAction,
    sections,
    changes,
    delivery: { mode: 'in_app' },
    sourceSnapshot,
    debugInfo: {
      evaluatedAt: ts,
      totalEvaluated: debugLog.length,
      totalIncluded: debugLog.filter(e => e.included).length,
      totalExcluded: debugLog.filter(e => !e.included).length,
      inclusionLog: debugLog,
    },
  };
}

// ── Snapshot builder (for persistence) ───────────────────────────────────────

export function briefingToSnapshot(briefing: DailyBriefing, orgId: string): Omit<BriefingSnapshot, 'id'> {
  return {
    orgId,
    generatedAt: briefing.generatedAt,
    briefingDate: briefing.briefingDate,
    summary: briefing.summary,
    itemIds: briefing.sections.flatMap(s => s.items.map(i => i.id)),
    sourceSnapshot: briefing.sourceSnapshot,
    reviewedItemIds: [],
  };
}
