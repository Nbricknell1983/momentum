import type { Client, Lead } from '@/lib/types';
import type {
  AutopilotDecision,
  AutopilotRule,
  AutopilotOrgPolicy,
  AutopilotActionType,
  AutopilotOutcome,
  AutopilotCondition,
  AutopilotState,
} from '@/lib/autopilotTypes';
import { DEFAULT_AUTOPILOT_RULES } from '@/lib/autopilotTypes';
import type { ReferralCandidate } from '@/lib/referralTypes';
import type { CadenceQueueItem } from '@/lib/cadenceTypes';

let _idCounter = 0;
function uid(): string { return `dec_${Date.now()}_${++_idCounter}`; }

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function evaluateCondition(
  condition: AutopilotCondition,
  context: Record<string, string | number | undefined>,
): boolean {
  const val = context[condition.field];
  if (val === undefined) return false;

  switch (condition.operator) {
    case 'eq': return val === condition.value;
    case 'ne': return val !== condition.value;
    case 'lt': return Number(val) < Number(condition.value);
    case 'gt': return Number(val) > Number(condition.value);
    case 'lte': return Number(val) <= Number(condition.value);
    case 'gte': return Number(val) >= Number(condition.value);
    case 'in': return Array.isArray(condition.value) && condition.value.includes(val as string);
    default: return false;
  }
}

function anyConditionMet(conditions: AutopilotCondition[], context: Record<string, string | number | undefined>): boolean {
  return conditions.some(c => evaluateCondition(c, context));
}

// ── Effective outcome ─────────────────────────────────────────────────────────

function resolveOutcome(
  rule: AutopilotRule,
  globalMode: AutopilotOrgPolicy['globalMode'],
  context: Record<string, string | number | undefined>,
): { outcome: AutopilotOutcome; escalated: boolean; overriddenBy?: string } {
  // 1. Global off — block everything
  if (globalMode === 'off') return { outcome: 'blocked', escalated: false, overriddenBy: 'Global mode is off' };

  // 2. Rule disabled
  if (!rule.enabled) return { outcome: 'blocked', escalated: false, overriddenBy: 'Rule is disabled' };

  // 3. Check escalation conditions
  let escalated = false;
  if (rule.escalatedOutcome && rule.escalationConditions?.length) {
    escalated = anyConditionMet(rule.escalationConditions, context);
  }

  const baseOutcome = rule.orgOverride ?? (escalated ? rule.escalatedOutcome ?? rule.defaultOutcome : rule.defaultOutcome);

  // 4. Global mode overrides
  if (globalMode === 'recommendations_only' && baseOutcome !== 'blocked') {
    return { outcome: 'recommendation_only', escalated, overriddenBy: 'Global mode: Recommendations only' };
  }
  if (globalMode === 'approval_only' && baseOutcome === 'auto_allowed') {
    return { outcome: 'approval_required', escalated, overriddenBy: 'Global mode: Approval-only mode' };
  }

  return { outcome: baseOutcome, escalated };
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(
  rule: AutopilotRule,
  outcome: AutopilotOutcome,
  escalated: boolean,
  overriddenBy?: string,
  contextFacts?: string[],
): string {
  const parts: string[] = [];

  if (overriddenBy) {
    parts.push(`Override: ${overriddenBy}.`);
  } else if (escalated && rule.escalatedOutcome) {
    const condLabels = (rule.escalationConditions ?? []).map(c => c.label).join('; ');
    parts.push(`Escalated due to: ${condLabels}.`);
    parts.push(`Elevated outcome applied: ${outcome === 'blocked' ? 'Blocked' : 'Recommendation only'}.`);
  } else if (rule.orgOverride) {
    parts.push(`Org policy overrides default. Rule default was: ${rule.defaultOutcome}. Applied: ${rule.orgOverride}.`);
  } else {
    parts.push(`Default rule applied: ${rule.defaultOutcome}.`);
  }

  parts.push(rule.rationale);

  return parts.join(' ');
}

function buildWhatWouldChange(
  rule: AutopilotRule,
  outcome: AutopilotOutcome,
  globalMode: AutopilotOrgPolicy['globalMode'],
): string | undefined {
  if (outcome === 'auto_allowed') return undefined;

  if (globalMode === 'off') return 'Enable autopilot (currently Off) to allow any actions.';
  if (globalMode === 'recommendations_only') return 'Switch global mode to Active or Approval-Only to allow queueing.';
  if (globalMode === 'approval_only' && rule.defaultOutcome === 'auto_allowed') {
    return 'Switch global mode to Active to allow this action to auto-run.';
  }

  if (!rule.enabled) return 'Enable this rule in Policy Settings.';

  if (outcome === 'approval_required') return 'Grant approval in the execution queue, or set the org override to auto_allowed for this rule.';
  if (outcome === 'recommendation_only') return 'Change the rule outcome to approval_required or auto_allowed in Policy Settings.';
  if (outcome === 'blocked') {
    if (rule.escalationConditions?.length) {
      return `Resolve escalation conditions: ${rule.escalationConditions.map(c => c.label).join('; ')}.`;
    }
    return 'Enable this rule in Policy Settings.';
  }
  return undefined;
}

// ── Main decision engine ──────────────────────────────────────────────────────

function makeDecision(
  rule: AutopilotRule,
  policy: AutopilotOrgPolicy,
  entityId: string,
  entityName: string,
  entityType: 'lead' | 'client' | 'org',
  actionType: AutopilotActionType,
  context: Record<string, string | number | undefined>,
  contextFacts: string[],
): AutopilotDecision {
  const { outcome, escalated, overriddenBy } = resolveOutcome(rule, policy.globalMode, context);
  const explanation = buildExplanation(rule, outcome, escalated, overriddenBy, contextFacts);
  const whatWouldChange = buildWhatWouldChange(rule, outcome, policy.globalMode);

  return {
    id: uid(),
    actionType,
    actionLabel: rule.label,
    entityId,
    entityName,
    entityType,
    safetyLevel: rule.safetyLevel,
    outcome,
    ruleId: rule.id,
    ruleLabel: rule.label,
    explanation,
    context: contextFacts,
    whatWouldChange,
    overriddenBy,
    decidedAt: nowLabel(),
  };
}

// ── Candidate action derivation ───────────────────────────────────────────────

function getRule(rules: AutopilotRule[], actionType: AutopilotActionType): AutopilotRule | undefined {
  return rules.find(r => r.actionType === actionType);
}

function buildClientContext(client: Client): Record<string, string | number | undefined> {
  return {
    health_status: client.healthStatus ?? 'amber',
    churn_risk: client.churnRiskScore ?? 0,
    delivery_status: client.deliveryStatus ?? 'onboarding',
    days_since_contact: client.daysSinceContact ?? 999,
  };
}

export function deriveAutopilotDecisions(
  policy: AutopilotOrgPolicy,
  clients: Client[],
  leads: Lead[],
  referralCandidates: ReferralCandidate[],
  cadenceItems: CadenceQueueItem[],
): AutopilotDecision[] {
  const decisions: AutopilotDecision[] = [];
  const rules = policy.rules;

  // 1. Cadence reminders — one per overdue/urgent cadence item
  const cadenceRule = getRule(rules, 'create_cadence_reminder');
  if (cadenceRule) {
    const urgentItems = cadenceItems.filter(i => i.urgency === 'overdue' || i.urgency === 'today');
    urgentItems.slice(0, 10).forEach(item => {
      const facts = [
        `Cadence item: "${item.title}"`,
        `Urgency: ${item.urgency}`,
        `Entity: ${item.entityName}`,
      ];
      decisions.push(makeDecision(cadenceRule, policy, item.entityId, item.entityName, item.entityType === 'lead' ? 'lead' : 'client', 'create_cadence_reminder', {}, facts));
    });
  }

  // 2. Churn risk flags — for at-risk clients
  const churnRule = getRule(rules, 'flag_churn_risk');
  if (churnRule) {
    clients
      .filter(c => !c.archived && (c.churnRiskScore ?? 0) >= 0.5)
      .slice(0, 5)
      .forEach(client => {
        const ctx = buildClientContext(client);
        const facts = [
          `Churn risk: ${Math.round((client.churnRiskScore ?? 0) * 100)}%`,
          `Health: ${client.healthStatus ?? 'unknown'}`,
          `Days since contact: ${client.daysSinceContact ?? '—'}`,
        ];
        decisions.push(makeDecision(churnRule, policy, client.id ?? '', client.businessName ?? 'Unknown', 'client', 'flag_churn_risk', ctx, facts));
      });
  }

  // 3. Upsell opportunity flags
  const upsellFlagRule = getRule(rules, 'flag_upsell_opportunity');
  if (upsellFlagRule) {
    clients
      .filter(c => !c.archived && (c.upsellReadiness === 'hot' || c.upsellReadiness === 'ready'))
      .slice(0, 5)
      .forEach(client => {
        const ctx = buildClientContext(client);
        const facts = [
          `Upsell readiness: ${client.upsellReadiness}`,
          `Health: ${client.healthStatus ?? 'unknown'}`,
        ];
        decisions.push(makeDecision(upsellFlagRule, policy, client.id ?? '', client.businessName ?? 'Unknown', 'client', 'flag_upsell_opportunity', ctx, facts));
      });
  }

  // 4. Referral window flags
  const referralFlagRule = getRule(rules, 'flag_referral_window');
  if (referralFlagRule) {
    referralCandidates
      .filter(c => c.readinessTier === 'hot' || c.readinessTier === 'ready')
      .slice(0, 5)
      .forEach(candidate => {
        const facts = [
          `Referral readiness: ${candidate.readinessScore}/100`,
          `Tier: ${candidate.readinessTier}`,
          `Recommended style: ${candidate.recommendedStyle}`,
        ];
        decisions.push(makeDecision(referralFlagRule, policy, candidate.clientId, candidate.clientName, 'client', 'flag_referral_window', {}, facts));
      });
  }

  // 5. Draft generation — for cadence items with active/green clients
  const draftRule = getRule(rules, 'generate_draft');
  if (draftRule) {
    const draftItems = cadenceItems.filter(i => i.urgency === 'overdue' || i.urgency === 'today');
    draftItems.slice(0, 5).forEach(item => {
      const client = clients.find(c => c.id === item.entityId);
      const ctx = client ? buildClientContext(client) : {};
      const facts = [
        `Cadence item: "${item.title}"`,
        ...(client ? [`Health: ${client.healthStatus}`, `Churn risk: ${Math.round((client.churnRiskScore ?? 0) * 100)}%`] : []),
      ];
      decisions.push(makeDecision(draftRule, policy, item.entityId, item.entityName, item.entityType === 'lead' ? 'lead' : 'client', 'generate_draft', ctx, facts));
    });
  }

  // 6. Send communication — for items that have approved drafts
  const sendRule = getRule(rules, 'send_communication');
  if (sendRule) {
    clients
      .filter(c => !c.archived && c.healthStatus === 'green')
      .slice(0, 5)
      .forEach(client => {
        const ctx = buildClientContext(client);
        const facts = [
          `Client: ${client.businessName}`,
          `Health: ${client.healthStatus}`,
          `Churn risk: ${Math.round((client.churnRiskScore ?? 0) * 100)}%`,
          'Client-facing — requires human review before sending.',
        ];
        decisions.push(makeDecision(sendRule, policy, client.id ?? '', client.businessName ?? 'Unknown', 'client', 'send_communication', ctx, facts));
      });
  }

  // 7. Referral asks for hot candidates
  const referralAskRule = getRule(rules, 'create_referral_ask');
  if (referralAskRule) {
    referralCandidates
      .filter(c => c.readinessTier === 'hot')
      .slice(0, 3)
      .forEach(candidate => {
        const client = clients.find(c => c.id === candidate.clientId);
        const ctx = client ? buildClientContext(client) : {};
        const facts = [
          `Referral score: ${candidate.readinessScore}/100`,
          `Recommended: ${candidate.recommendedStyle}`,
          ...(client ? [`Health: ${client.healthStatus}`, `Churn risk: ${Math.round((client.churnRiskScore ?? 0) * 100)}%`] : []),
        ];
        decisions.push(makeDecision(referralAskRule, policy, candidate.clientId, candidate.clientName, 'client', 'create_referral_ask', ctx, facts));
      });
  }

  // 8. Expansion asks for hot upsell accounts
  const expansionRule = getRule(rules, 'request_expansion');
  if (expansionRule) {
    clients
      .filter(c => !c.archived && c.upsellReadiness === 'hot' && c.healthStatus === 'green')
      .slice(0, 3)
      .forEach(client => {
        const ctx = buildClientContext(client);
        const facts = [
          `Upsell readiness: hot`,
          `Health: ${client.healthStatus}`,
          'Expansion ask is always recommendation-only — requires manager judgment.',
        ];
        decisions.push(makeDecision(expansionRule, policy, client.id ?? '', client.businessName ?? 'Unknown', 'client', 'request_expansion', ctx, facts));
      });
  }

  return decisions;
}

export function deriveAutopilotState(
  policy: AutopilotOrgPolicy,
  decisions: AutopilotDecision[],
): AutopilotState {
  return {
    globalMode: policy.globalMode,
    rules: policy.rules,
    decisions,
    autoRunCount: decisions.filter(d => d.outcome === 'auto_allowed').length,
    approvalPendingCount: decisions.filter(d => d.outcome === 'approval_required').length,
    blockedCount: decisions.filter(d => d.outcome === 'blocked').length,
    recommendationCount: decisions.filter(d => d.outcome === 'recommendation_only').length,
    generatedAt: nowLabel(),
  };
}

export function buildDefaultPolicy(orgId: string): AutopilotOrgPolicy {
  return {
    orgId,
    globalMode: 'approval_only', // safe default — nothing auto-runs until explicitly enabled
    rules: DEFAULT_AUTOPILOT_RULES,
    updatedAt: nowLabel(),
    updatedBy: 'system',
  };
}
