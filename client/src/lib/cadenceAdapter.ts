/**
 * Cadence + Automation Layer — Rule Engine & Reminder Generator
 *
 * Pure derivation from Lead[] + Client[] Redux state.
 * No AI calls. No API calls. All items are evidence-based.
 *
 * Rule categories:
 *   Lead rules   — proposal stalls, verbal commit, discovery, inactivity, overdue
 *   Client rules — approval blocks, churn risk, contact cadence, upsell, referral
 *
 * Each rule produces a CadenceQueueItem with full content:
 *   why it exists · what triggered it · what to do · what to say · what to reference
 */

import { format, addDays as dateFnsAddDays, differenceInDays, isPast, isToday } from 'date-fns';
import { Lead, Client } from './types';
import {
  CadenceState,
  CadenceQueueItem,
  CadenceTrigger,
  CadenceTriggerType,
  CadenceGroupCategory,
  CadenceUrgency,
  CadenceItemStatus,
  AutomatedNudge,
  NudgeType,
  CadenceItemOverride,
  CadenceOverrideMap,
  CadenceInspectionRecord,
} from './cadenceTypes';

// ── Utilities ─────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `cad-${Date.now()}-${++_seq}`;
}

function todayStr(): string {
  return format(new Date(), 'dd/MM/yyyy');
}

function dueDateStr(daysOut: number): string {
  return format(dateFnsAddDays(new Date(), daysOut), 'dd/MM/yyyy');
}

function daysAgo(d?: Date | string | null): number {
  if (!d) return 0;
  try {
    const date = d instanceof Date ? d : new Date(d);
    return Math.max(0, differenceInDays(new Date(), date));
  } catch {
    return 0;
  }
}

function daysSince(d?: Date | string | null): number {
  return daysAgo(d);
}

function isDatePast(d?: Date | string | null): boolean {
  if (!d) return false;
  try {
    const date = d instanceof Date ? d : new Date(d);
    return isPast(date) && !isToday(date);
  } catch {
    return false;
  }
}

function urgencyFor(overdueDays: number, daysOut: number): CadenceUrgency {
  if (overdueDays > 0) return 'overdue';
  if (daysOut === 0) return 'today';
  if (daysOut <= 7) return 'this_week';
  return 'upcoming';
}

function trigger(
  type: CadenceTriggerType,
  evidence: string[],
  daysElapsed?: number,
): CadenceTrigger {
  return { type, detectedAt: todayStr(), evidence, daysElapsed };
}

// ── Lead Cadence Rules ────────────────────────────────────────────────────────

const LEAD_STAGE_LABELS: Record<string, string> = {
  suspect: 'Suspect',
  contacted: 'Contacted',
  engaged: 'Engaged',
  qualified: 'Qualified',
  discovery: 'Discovery',
  proposal: 'Proposal',
  verbal_commit: 'Verbal Commit',
  won: 'Won',
  lost: 'Lost',
  nurture: 'Nurture',
};

function leadCadenceItems(lead: Lead): CadenceQueueItem[] {
  const items: CadenceQueueItem[] = [];
  const stageLabel = LEAD_STAGE_LABELS[lead.stage] ?? lead.stage;

  // ── Rule 1: Proposal stage — no activity in 3+ days ──────────────────────
  if (lead.stage === 'proposal') {
    const sinceActivity = daysSince(lead.lastActivityAt ?? lead.lastContactDate);
    if (sinceActivity >= 3) {
      const overdue = sinceActivity > 7 ? sinceActivity - 7 : 0;
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_proposal_no_movement',
        trigger: trigger('proposal_no_movement', [
          `Stage: Proposal`,
          `${sinceActivity} days since last activity`,
        ], sinceActivity),
        groupCategory: 'sales',
        dueDate: overdue > 0 ? todayStr() : dueDateStr(0),
        urgency: overdue > 0 ? 'overdue' : 'today',
        overdueDays: overdue > 0 ? overdue : undefined,
        title: 'Follow up on sent proposal',
        reason: `${lead.companyName} has been in the proposal stage for ${sinceActivity} days with no recorded activity.`,
        triggerExplanation: `No activity logged for ${sinceActivity} days since the proposal was sent.`,
        stageContext: `Stage: ${stageLabel} — proposal is out but no movement recorded.`,
        recommendedAction: 'Call or email to confirm receipt, address questions, and move toward acceptance.',
        assetToReference: 'Sent proposal / strategy report',
        suggestedWording: `"I wanted to check in on the proposal I sent across — have you had a chance to review it? Happy to walk you through any questions."`,
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          days_since_activity: String(sinceActivity),
          last_activity: lead.lastActivityAt ? format(new Date(lead.lastActivityAt), 'dd/MM/yyyy') : '—',
        },
      });
    }
  }

  // ── Rule 2: Verbal commit — no follow-through in 5+ days ─────────────────
  if (lead.stage === 'verbal_commit') {
    const sinceActivity = daysSince(lead.lastActivityAt ?? lead.lastContactDate);
    if (sinceActivity >= 5) {
      const overdue = sinceActivity > 10 ? sinceActivity - 10 : 0;
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_verbal_stall',
        trigger: trigger('verbal_commit_stall', [
          `Stage: Verbal Commit`,
          `${sinceActivity} days since last activity`,
        ], sinceActivity),
        groupCategory: 'sales',
        dueDate: overdue > 0 ? todayStr() : dueDateStr(1),
        urgency: overdue > 0 ? 'overdue' : 'today',
        overdueDays: overdue > 0 ? overdue : undefined,
        title: 'Convert verbal commitment to signed agreement',
        reason: `${lead.companyName} gave a verbal commitment ${sinceActivity} days ago but no formal agreement has been recorded.`,
        triggerExplanation: `Verbal commit stage for ${sinceActivity} days — no progression to won.`,
        stageContext: `Stage: ${stageLabel} — deal is orally agreed but not closed.`,
        recommendedAction: 'Send contract or agreement for signature. Make it easy to say yes — one link, one click.',
        assetToReference: 'Service agreement / contract template',
        suggestedWording: `"Great — I'll get the paperwork across to you now so we can get the ball rolling. It should only take a few minutes to sign off."`,
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          days_since_activity: String(sinceActivity),
        },
      });
    }
  }

  // ── Rule 3: Discovery stage — no movement in 7+ days ─────────────────────
  if (lead.stage === 'discovery') {
    const sinceActivity = daysSince(lead.lastActivityAt ?? lead.lastContactDate);
    if (sinceActivity >= 7) {
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_discovery_stall',
        trigger: trigger('discovery_stall', [
          `Stage: Discovery`,
          `${sinceActivity} days since last activity`,
        ], sinceActivity),
        groupCategory: 'sales',
        dueDate: dueDateStr(0),
        urgency: sinceActivity > 14 ? 'overdue' : 'today',
        overdueDays: sinceActivity > 14 ? sinceActivity - 14 : undefined,
        title: 'Book next discovery meeting',
        reason: `${lead.companyName} is in discovery but no next step has been scheduled for ${sinceActivity} days.`,
        triggerExplanation: `${sinceActivity} days of silence in the discovery stage.`,
        stageContext: `Stage: ${stageLabel} — discovery is in progress but momentum has stalled.`,
        recommendedAction: 'Call to confirm interest and book a discovery or strategy session within 7 days.',
        assetToReference: 'Discovery questionnaire / strategy briefing deck',
        suggestedWording: `"I wanted to book in a session to go through what we've been thinking — I think you'll find it valuable. Are you free this week?"`,
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          days_since_activity: String(sinceActivity),
        },
      });
    }
  }

  // ── Rule 4: Engaged/Qualified — going cold (14+ days) ────────────────────
  if (lead.stage === 'engaged' || lead.stage === 'qualified') {
    const sinceActivity = daysSince(lead.lastActivityAt ?? lead.lastContactDate);
    if (sinceActivity >= 14) {
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_going_cold',
        trigger: trigger('engaged_going_cold', [
          `Stage: ${stageLabel}`,
          `${sinceActivity} days without contact`,
        ], sinceActivity),
        groupCategory: 'sales',
        dueDate: dueDateStr(0),
        urgency: sinceActivity > 21 ? 'overdue' : 'this_week',
        overdueDays: sinceActivity > 21 ? sinceActivity - 21 : undefined,
        title: `Re-engage ${lead.companyName} before going cold`,
        reason: `${sinceActivity} days without activity in the ${stageLabel} stage. Engagement risk is building.`,
        triggerExplanation: `${sinceActivity} days of silence — engaged lead going cold.`,
        stageContext: `Stage: ${stageLabel} — interested but momentum has dropped off.`,
        recommendedAction: 'Send a relevant insight or data point before calling. Warm the contact before the ask.',
        assetToReference: 'Growth plan or visibility gap report',
        suggestedWording: `"I've been looking at your online presence and noticed something interesting I think you'd want to see. Can I share it with you quickly?"`,
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          days_since_activity: String(sinceActivity),
        },
      });
    }
  }

  // ── Rule 5: Next contact date has passed ──────────────────────────────────
  if (lead.nextContactDate && isDatePast(lead.nextContactDate)) {
    const overdueDays = daysSince(lead.nextContactDate);
    // Only fire if not already handled by another rule above
    if (lead.stage !== 'proposal' && lead.stage !== 'verbal_commit') {
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_contact_overdue',
        trigger: trigger('contact_overdue', [
          `Scheduled contact: ${format(new Date(lead.nextContactDate), 'dd/MM/yyyy')}`,
          `${overdueDays} days overdue`,
          lead.nextContactReason ? `Reason: ${lead.nextContactReason}` : 'No reason recorded',
        ], overdueDays),
        groupCategory: 'sales',
        dueDate: todayStr(),
        urgency: 'overdue',
        overdueDays,
        title: `Overdue contact — ${lead.companyName}`,
        reason: `A follow-up was scheduled for ${format(new Date(lead.nextContactDate), 'dd/MM/yyyy')} and has not been recorded.`,
        triggerExplanation: `Scheduled contact date passed ${overdueDays} day${overdueDays > 1 ? 's' : ''} ago.`,
        stageContext: `Stage: ${stageLabel}${lead.nextContactReason ? ` — ${lead.nextContactReason}` : ''}.`,
        recommendedAction: 'Complete this contact now and log the outcome.',
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          scheduled_contact: format(new Date(lead.nextContactDate), 'dd/MM/yyyy'),
          overdue_days: String(overdueDays),
          reason: lead.nextContactReason ?? '—',
        },
      });
    }
  }

  // ── Rule 6: Multiple touches, no response ─────────────────────────────────
  if ((lead.touchesNoResponse ?? 0) >= 3 && lead.stage !== 'proposal' && lead.stage !== 'verbal_commit') {
    const touches = lead.touchesNoResponse ?? 0;
    items.push({
      id: uid(),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      ruleId: 'lead_no_response_streak',
      trigger: trigger('no_response_streak', [
        `${touches} touches with no response`,
        `Stage: ${stageLabel}`,
      ], touches),
      groupCategory: 'sales',
      dueDate: dueDateStr(2),
      urgency: touches >= 5 ? 'today' : 'this_week',
      title: `${touches} touches without response — change approach`,
      reason: `${lead.companyName} has not responded to ${touches} contact attempts. Current approach is not working.`,
      triggerExplanation: `${touches} consecutive unanswered touches detected.`,
      stageContext: `Stage: ${stageLabel} — repeated outreach with no engagement.`,
      recommendedAction: touches >= 5
        ? 'Consider pausing direct outreach. Move to nurture mode or a different channel.'
        : 'Switch the channel (call vs email). Try a different time of day or a shorter, more direct message.',
      suggestedWording: `"Hi [Name], I know you're busy — I'll keep this brief. I have one specific idea for [Company] that could be worth a quick look. Can I share it?"`,
      owner: lead.userId,
      status: 'pending',
      sourceData: {
        stage: lead.stage,
        touches_no_response: String(touches),
      },
    });
  }

  // ── Rule 7: Lead dark for 30+ days ───────────────────────────────────────
  if (lead.stage !== 'won' && lead.stage !== 'lost' && lead.stage !== 'nurture') {
    const sinceActivity = daysSince(lead.lastActivityAt ?? lead.lastContactDate);
    if (sinceActivity >= 30 && lead.stage === 'suspect') {
      items.push({
        id: uid(),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        ruleId: 'lead_inactivity',
        trigger: trigger('lead_inactivity', [
          `${sinceActivity} days since last activity`,
          `Stage: ${stageLabel}`,
        ], sinceActivity),
        groupCategory: 'sales',
        dueDate: dueDateStr(1),
        urgency: 'this_week',
        title: `${lead.companyName} has been dark for ${sinceActivity} days`,
        reason: 'This lead has not been touched in over a month and risks being lost entirely.',
        triggerExplanation: `${sinceActivity} days of inactivity in the ${stageLabel} stage.`,
        stageContext: `Stage: ${stageLabel} — no engagement recorded for an extended period.`,
        recommendedAction: 'One final, well-crafted reach-out before considering moving to nurture or archived.',
        suggestedWording: `"Hi [Name] — I realise I haven't been in touch for a while. I wanted to share something new that might be relevant to [Company] before the window closes."`,
        owner: lead.userId,
        status: 'pending',
        sourceData: {
          stage: lead.stage,
          days_since_activity: String(sinceActivity),
        },
      });
    }
  }

  return items;
}

// ── Client Cadence Rules ──────────────────────────────────────────────────────

function clientCadenceItems(client: Client): CadenceQueueItem[] {
  const items: CadenceQueueItem[] = [];
  const contactDays = client.daysSinceContact ?? daysSince(client.lastContactDate);

  // ── Rule 1: Delivery blocked — approval needed ────────────────────────────
  if (client.deliveryStatus === 'blocked') {
    const blockedText = contactDays > 0 ? ` (${contactDays}d since contact)` : '';
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_approval_blocked',
      trigger: trigger('approval_blocked', [
        'Delivery status: blocked',
        `${contactDays} days since last contact`,
      ], contactDays),
      groupCategory: 'onboarding',
      dueDate: todayStr(),
      urgency: contactDays > 5 ? 'overdue' : 'today',
      overdueDays: contactDays > 5 ? contactDays - 5 : undefined,
      title: `Chase outstanding approval — ${client.businessName}`,
      reason: `Delivery is blocked pending client approval. Prolonged stalls erode trust and create churn risk.`,
      triggerExplanation: `Delivery status set to blocked${blockedText}.`,
      stageContext: `Delivery: Blocked — workstream awaiting client sign-off.`,
      recommendedAction: 'Contact the client directly. Identify the specific approval needed. Offer to make it as easy as possible.',
      assetToReference: 'Workstream approval request / preview link',
      suggestedWording: `"We're ready to move forward — we just need your approval to keep things on track. It should only take 5 minutes. Can I walk you through it now?"`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        delivery_status: 'blocked',
        days_since_contact: String(contactDays),
        health_status: client.healthStatus,
      },
    });
  }

  // ── Rule 2: Critical churn risk ───────────────────────────────────────────
  if (client.healthStatus === 'red' && client.churnRiskScore > 60) {
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_churn_critical',
      trigger: trigger('churn_risk_intervention', [
        `Health status: red`,
        `Churn risk score: ${client.churnRiskScore}%`,
        ...client.healthReasons.slice(0, 2),
      ], contactDays),
      groupCategory: 'churn_intervention',
      dueDate: todayStr(),
      urgency: 'overdue',
      overdueDays: 1,
      title: `URGENT: Churn intervention required — ${client.businessName}`,
      reason: `Account health is critical. Churn risk score: ${client.churnRiskScore}%. Immediate intervention required to prevent loss.`,
      triggerExplanation: `Red health status with churn score of ${client.churnRiskScore}%.`,
      stageContext: `Health: Red — ${client.healthReasons[0] ?? 'Multiple compounding factors.'}`,
      recommendedAction: 'Book an urgent check-in call. Come with a recovery plan or a concrete win. Escalate internally if needed.',
      assetToReference: 'Account health report / delivery summary',
      suggestedWording: `"I wanted to reach out personally — I want to make sure we're on the same page and address anything that's on your mind. Can we connect today?"`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        health_status: 'red',
        churn_risk_score: String(client.churnRiskScore),
        health_reasons: client.healthReasons.slice(0, 2).join('; '),
      },
    });
  }

  // ── Rule 3: Amber health + overdue contact ────────────────────────────────
  if (client.healthStatus === 'amber' && contactDays > 14 && client.deliveryStatus !== 'blocked') {
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_amber_check',
      trigger: trigger('amber_health_check', [
        `Health status: amber`,
        `${contactDays} days since last contact`,
        `Churn risk: ${client.churnRiskScore}%`,
      ], contactDays),
      groupCategory: 'churn_intervention',
      dueDate: dueDateStr(contactDays > 21 ? 0 : 2),
      urgency: contactDays > 21 ? 'overdue' : 'this_week',
      overdueDays: contactDays > 21 ? contactDays - 21 : undefined,
      title: `Proactive check-in needed — ${client.businessName}`,
      reason: `Account health is amber and contact is ${contactDays} days overdue. Early intervention now prevents escalation.`,
      triggerExplanation: `Amber health with ${contactDays} days without contact.`,
      stageContext: `Health: Amber — ${client.healthReasons[0] ?? 'Health declining from baseline.'}`,
      recommendedAction: 'Share a proactive progress update. Confirm deliverables are on track. Ask if there are any concerns before they grow.',
      assetToReference: 'Delivery progress / channel performance summary',
      suggestedWording: `"I wanted to check in and share a quick update on where things are at. We've made some good progress I think you'll be pleased to see."`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        health_status: 'amber',
        days_since_contact: String(contactDays),
        churn_risk: String(client.churnRiskScore),
      },
    });
  }

  // ── Rule 4: Client contact cadence overdue ────────────────────────────────
  const cadenceDays = client.preferredContactCadenceDays ?? 30;
  if (
    contactDays > cadenceDays &&
    client.healthStatus === 'green' &&
    client.deliveryStatus !== 'blocked'
  ) {
    const overdueDays = contactDays - cadenceDays;
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_cadence_overdue',
      trigger: trigger('client_inactivity', [
        `${contactDays} days since last contact`,
        `Cadence target: every ${cadenceDays} days`,
      ], contactDays),
      groupCategory: 'account_growth',
      dueDate: overdueDays > 7 ? todayStr() : dueDateStr(2),
      urgency: overdueDays > 7 ? 'overdue' : 'this_week',
      overdueDays: overdueDays > 7 ? overdueDays : undefined,
      title: `Regular check-in due — ${client.businessName}`,
      reason: `Contact cadence target is every ${cadenceDays} days. Last contact was ${contactDays} days ago.`,
      triggerExplanation: `${overdueDays} days past cadence target.`,
      stageContext: `Health: Green — contact cadence target exceeded.`,
      recommendedAction: 'Schedule a routine check-in. Share a win or progress update to reinforce value.',
      assetToReference: 'Channel performance summary or recent milestones',
      suggestedWording: `"Just reaching out for our regular check-in. Things are progressing well on our end — let me share what's been happening."`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        cadence_target_days: String(cadenceDays),
        days_since_contact: String(contactDays),
        overdue_days: String(overdueDays),
      },
    });
  }

  // ── Rule 5: Delivery complete — post-completion follow-up ─────────────────
  if (client.deliveryStatus === 'complete' && contactDays >= 7) {
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_post_completion',
      trigger: trigger('post_completion_followup', [
        'Delivery status: complete',
        `${contactDays} days since last contact`,
      ], contactDays),
      groupCategory: 'account_growth',
      dueDate: dueDateStr(1),
      urgency: contactDays > 21 ? 'overdue' : 'this_week',
      overdueDays: contactDays > 21 ? contactDays - 21 : undefined,
      title: `Post-completion follow-up — ${client.businessName}`,
      reason: `A delivery milestone has been completed. This is the ideal moment to celebrate the win, reinforce value, and open the next conversation.`,
      triggerExplanation: `Delivery marked complete. ${contactDays} days without follow-up.`,
      stageContext: `Delivery: Complete — prime moment for value reinforcement and growth conversation.`,
      recommendedAction: 'Summarise what was delivered and the business impact. Then open the conversation for what comes next.',
      assetToReference: 'Delivery summary / channel performance report',
      suggestedWording: `"Wanted to take a moment to acknowledge what we've achieved together. [Specific win]. Now that this milestone is done, let's talk about what we should do next."`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        delivery_status: 'complete',
        days_since_contact: String(contactDays),
      },
    });
  }

  // ── Rule 6: Upsell window open ────────────────────────────────────────────
  if (client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') {
    const isHot = client.upsellReadiness === 'hot';
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_upsell_window',
      trigger: trigger('upsell_window_open', [
        `Upsell readiness: ${client.upsellReadiness}`,
        `Health: ${client.healthStatus}`,
      ]),
      groupCategory: 'account_growth',
      dueDate: isHot ? dueDateStr(0) : dueDateStr(4),
      urgency: isHot ? 'today' : 'this_week',
      title: `${isHot ? 'Hot' : 'Ready'} upsell window — ${client.businessName}`,
      reason: `Account is flagged as ${client.upsellReadiness} for expansion. This window closes if not actioned.`,
      triggerExplanation: `Upsell readiness flag: ${client.upsellReadiness}.`,
      stageContext: `Health: ${client.healthStatus} — account flagged for growth.`,
      recommendedAction: isHot
        ? 'Present expansion opportunity at the next contact. Come prepared with one specific proposal.'
        : 'Schedule an expansion conversation within the next 7 days. Identify the best-fit module to lead with.',
      assetToReference: 'Module capability brief / expansion proposal',
      suggestedWording: isHot
        ? `"Things are going well and I've been thinking about what the next step could look like for you. Do you have 20 minutes this week?"`
        : `"I've put together some thoughts on where we could take things from here — would you be open to a quick conversation about it?"`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        upsell_readiness: client.upsellReadiness,
        health_status: client.healthStatus,
        delivery_status: client.deliveryStatus ?? '—',
      },
    });
  }

  // ── Rule 7: Referral window open ──────────────────────────────────────────
  const isReferralReady =
    client.healthStatus === 'green' &&
    (client.deliveryStatus === 'active' || client.deliveryStatus === 'complete') &&
    contactDays < 30 &&
    client.churnRiskScore < 25;

  if (isReferralReady) {
    items.push({
      id: uid(),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      ruleId: 'client_referral_window',
      trigger: trigger('referral_window_open', [
        'Health status: green',
        `Delivery: ${client.deliveryStatus}`,
        `Churn risk: ${client.churnRiskScore}%`,
      ]),
      groupCategory: 'referrals',
      dueDate: dueDateStr(3),
      urgency: 'this_week',
      title: `Referral opportunity — ${client.businessName}`,
      reason: 'Account is healthy, delivery is active, and the relationship is warm. This is the ideal time to ask for a referral.',
      triggerExplanation: 'Green health + active delivery + recent contact + low churn risk = referral window open.',
      stageContext: 'Health: Green — relationship at its strongest in the current cycle.',
      recommendedAction: 'Raise a referral ask at the next check-in or in a brief message. Keep it natural and low pressure.',
      suggestedWording: `"We've been getting great results together and I wanted to ask — do you know of any other business owners who might benefit from what we do? An introduction would mean a lot."`,
      owner: client.ownerId,
      status: 'pending',
      sourceData: {
        health_status: 'green',
        delivery_status: client.deliveryStatus ?? '—',
        churn_risk: String(client.churnRiskScore),
        days_since_contact: String(contactDays),
      },
    });
  }

  return items;
}

// ── Nudge Generation ──────────────────────────────────────────────────────────

function generateNudge(item: CadenceQueueItem): AutomatedNudge | null {
  // Only generate nudges for high-urgency or specific types
  if (item.urgency !== 'overdue' && item.urgency !== 'today') return null;

  const nudgeTypeMap: Record<string, NudgeType> = {
    lead_proposal_no_movement: 'proposal_chase',
    lead_verbal_stall: 'proposal_chase',
    lead_contact_overdue: 'follow_up',
    client_approval_blocked: 'approval_reminder',
    client_churn_critical: 'intervention',
    client_referral_window: 'referral_ask',
    client_upsell_window: 'follow_up',
    client_post_completion: 'check_in',
    client_amber_check: 'check_in',
  };

  const nudgeType: NudgeType = nudgeTypeMap[item.ruleId] ?? 'follow_up';
  const target: 'internal' | 'client_draft' =
    nudgeType === 'intervention' || nudgeType === 'approval_reminder' ? 'internal' : 'client_draft';

  const subjects: Record<string, string> = {
    proposal_chase: `Following up on our proposal — ${item.entityName}`,
    follow_up: `Checking in — ${item.entityName}`,
    approval_reminder: `[ACTION NEEDED] Approval required to continue — ${item.entityName}`,
    intervention: `[INTERNAL] Churn risk action — ${item.entityName}`,
    referral_ask: `Re: connecting you with someone we can help`,
    check_in: `Quick update — ${item.entityName}`,
  };

  return {
    id: uid(),
    entityId: item.entityId,
    entityName: item.entityName,
    entityType: item.entityType,
    nudgeType,
    target,
    subject: subjects[nudgeType] ?? `Follow-up — ${item.entityName}`,
    body: item.suggestedWording ?? item.recommendedAction,
    previewNote: target === 'internal'
      ? 'Internal action note — not sent to client.'
      : 'Draft message — review and personalise before sending.',
    status: 'draft',
    createdAt: todayStr(),
    linkedQueueItemId: item.id,
  };
}

// ── Override Merge ────────────────────────────────────────────────────────────

export function applyOverrides(
  items: CadenceQueueItem[],
  overrides: CadenceOverrideMap,
): CadenceQueueItem[] {
  return items.map(item => {
    const override = overrides[item.id];
    if (!override) return item;

    // Snoozed items: if snoozedUntil is in the past, reactivate
    if (override.status === 'snoozed' && override.snoozedUntil) {
      try {
        const snoozedUntilDate = new Date(override.snoozedUntil.split('/').reverse().join('-'));
        if (isPast(snoozedUntilDate) && !isToday(snoozedUntilDate)) {
          return { ...item, status: 'pending' };
        }
      } catch {
        // fallthrough
      }
    }

    return { ...item, ...override };
  });
}

// ── Main Portfolio Derivation ─────────────────────────────────────────────────

export function deriveCadenceState(
  leads: Lead[],
  clients: Client[],
  overrides: CadenceOverrideMap = {},
): CadenceState {
  _seq = 0;

  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost');
  const activeClients = clients.filter(c => !c.archived);

  const rawLeadItems = activeLeads.flatMap(leadCadenceItems);
  const rawClientItems = activeClients.flatMap(clientCadenceItems);
  const allRaw = [...rawLeadItems, ...rawClientItems];

  const allItems = applyOverrides(allRaw, overrides);
  const pendingItems = allItems.filter(i => i.status === 'pending');

  // Sort by urgency within pending
  const urgencyOrder: Record<CadenceUrgency, number> = {
    overdue: 0, today: 1, this_week: 2, upcoming: 3,
  };
  const sorted = [...pendingItems].sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3),
  );

  const overdueItems = sorted.filter(i => i.urgency === 'overdue');
  const dueTodayItems = sorted.filter(i => i.urgency === 'today');
  const dueThisWeekItems = sorted.filter(i => i.urgency === 'this_week');
  const upcomingItems = sorted.filter(i => i.urgency === 'upcoming');

  const byCategory: Record<CadenceGroupCategory, CadenceQueueItem[]> = {
    sales: sorted.filter(i => i.groupCategory === 'sales'),
    onboarding: sorted.filter(i => i.groupCategory === 'onboarding'),
    account_growth: sorted.filter(i => i.groupCategory === 'account_growth'),
    churn_intervention: sorted.filter(i => i.groupCategory === 'churn_intervention'),
    referrals: sorted.filter(i => i.groupCategory === 'referrals'),
  };

  // Generate nudges for critical/today items only
  const nudges = sorted
    .filter(i => i.urgency === 'overdue' || i.urgency === 'today')
    .map(generateNudge)
    .filter((n): n is AutomatedNudge => n !== null)
    .slice(0, 15);

  return {
    allItems,
    overdueItems,
    dueTodayItems,
    dueThisWeekItems,
    upcomingItems,
    byCategory,
    nudges,
    totalPending: pendingItems.length,
    criticalCount: overdueItems.length,
    generatedAt: format(new Date(), 'dd/MM/yyyy HH:mm'),
  };
}

// ── Inspection Support ────────────────────────────────────────────────────────

export function deriveCadenceInspections(state: CadenceState): CadenceInspectionRecord[] {
  return state.allItems.map(item => ({
    itemId: item.id,
    entityId: item.entityId,
    entityName: item.entityName,
    entityType: item.entityType,
    ruleId: item.ruleId,
    triggerType: item.trigger.type,
    whyFired: item.reason,
    supportingData: item.sourceData,
    recommendationGenerated: item.recommendedAction,
    status: item.status,
    detectedAt: item.trigger.detectedAt,
  }));
}
