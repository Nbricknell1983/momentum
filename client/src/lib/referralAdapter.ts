import type { Client } from '@/lib/types';
import type {
  ReferralCandidate,
  ReferralReadinessSignal,
  ReferralReadinessTier,
  ReferralAskStyleId,
  ReferralMomentumState,
} from '@/lib/referralTypes';
import { REFERRAL_ASK_STYLES } from '@/lib/referralTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(d: Date | string | undefined | null): number {
  if (!d) return 999;
  const date = d instanceof Date ? d : new Date(d as string);
  if (isNaN(date.getTime())) return 999;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function liveChannelCount(client: Client): number {
  const status = client.channelStatus;
  if (!status) return 0;
  return [status.website, status.seo, status.gbp, status.googleAds, status.content]
    .filter(s => s === 'live').length;
}

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Signal evaluation ─────────────────────────────────────────────────────────

function evaluateSignals(client: Client): ReferralReadinessSignal[] {
  const contact = client.daysSinceContact ?? daysSince(client.lastContactDate);
  const live = liveChannelCount(client);
  const churnScore = client.churnRiskScore ?? 0;

  const signals: ReferralReadinessSignal[] = [
    {
      id: 'health_green',
      label: 'Green account health',
      met: client.healthStatus === 'green',
      score: client.healthStatus === 'green' ? 25 : client.healthStatus === 'amber' ? 8 : 0,
      explanation:
        client.healthStatus === 'green'
          ? 'Account is healthy — relationship is in good standing for an ask.'
          : client.healthStatus === 'amber'
          ? 'Account health is amber — timing is acceptable but proceed with care.'
          : 'Account health is red — suppress referral ask until resolved.',
    },
    {
      id: 'delivery_active',
      label: 'Active or complete delivery',
      met: client.deliveryStatus === 'active' || client.deliveryStatus === 'complete',
      score: client.deliveryStatus === 'complete' ? 20 : client.deliveryStatus === 'active' ? 15 : 0,
      explanation:
        client.deliveryStatus === 'complete'
          ? 'Delivery milestone achieved — strong proof point for referral conversation.'
          : client.deliveryStatus === 'active'
          ? 'Delivery is active and progressing — good context for the ask.'
          : client.deliveryStatus === 'blocked'
          ? 'Delivery is blocked — poor time to ask for a referral.'
          : 'Account is onboarding — too early to ask.',
    },
    {
      id: 'low_churn_risk',
      label: 'Low churn risk',
      met: churnScore < 0.3,
      score: churnScore < 0.2 ? 20 : churnScore < 0.3 ? 12 : churnScore < 0.5 ? 5 : 0,
      explanation:
        churnScore < 0.2
          ? `Very low churn risk score (${Math.round(churnScore * 100)}%) — highly satisfied account.`
          : churnScore < 0.3
          ? `Low churn risk (${Math.round(churnScore * 100)}%) — relationship is stable.`
          : churnScore < 0.5
          ? `Moderate churn risk (${Math.round(churnScore * 100)}%) — referral timing is suboptimal.`
          : `High churn risk (${Math.round(churnScore * 100)}%) — do not ask for a referral now.`,
    },
    {
      id: 'contact_timing',
      label: 'Good contact timing window',
      met: contact >= 14 && contact <= 90,
      score: contact < 7 ? 5 : contact <= 30 ? 18 : contact <= 60 ? 12 : contact <= 90 ? 8 : 0,
      explanation:
        contact < 7
          ? 'Very recent contact — give the conversation some breathing room before asking.'
          : contact <= 30
          ? `Recent contact (${contact}d ago) — relationship is warm and timing is good.`
          : contact <= 60
          ? `Contact ${contact} days ago — still within a workable window.`
          : contact <= 90
          ? `${contact} days since last contact — on the edge of the timing window.`
          : `${contact} days since last contact — reconnect first before asking.`,
    },
    {
      id: 'live_channels',
      label: 'Visible results to reference',
      met: live >= 1,
      score: live >= 3 ? 15 : live >= 2 ? 12 : live >= 1 ? 8 : 0,
      explanation:
        live >= 3
          ? `${live} live channels — multiple visible wins to reference in the conversation.`
          : live >= 2
          ? `${live} live channels — solid proof points available.`
          : live === 1
          ? '1 live channel — basic proof point available.'
          : 'No live channels — limited proof points for the referral conversation.',
    },
    {
      id: 'expansion_signals',
      label: 'Expansion-ready mindset',
      met: client.upsellReadiness === 'hot' || client.upsellReadiness === 'ready',
      score: client.upsellReadiness === 'hot' ? 10 : client.upsellReadiness === 'ready' ? 7 : client.upsellReadiness === 'warming' ? 3 : 0,
      explanation:
        client.upsellReadiness === 'hot' || client.upsellReadiness === 'ready'
          ? 'Account is expansion-ready — client sees value and is likely to want more for others too.'
          : client.upsellReadiness === 'warming'
          ? 'Account is warming to expansion — moderate trust signal.'
          : 'No expansion signals detected — client may not yet be in a position to advocate.',
    },
  ];

  return signals;
}

// ── Style selection ───────────────────────────────────────────────────────────

function selectAskStyle(
  client: Client,
  score: number,
  contact: number,
  live: number,
): { style: ReferralAskStyleId; reason: string } {
  // Delivery just completed → milestone-based
  if (client.deliveryStatus === 'complete' && client.healthStatus === 'green') {
    return {
      style: 'milestone_based',
      reason: 'Delivery is complete and the account is healthy — the milestone is the natural entry point for the ask.',
    };
  }

  // High score, green health, enthusiastic → direct intro
  if (score >= 75 && client.healthStatus === 'green' && live >= 2) {
    return {
      style: 'direct_intro',
      reason: 'Strong readiness score with multiple live channels — a direct ask is well-supported by visible proof.',
    };
  }

  // Contact very recent with good health → testimonial bridge
  if (contact <= 14 && client.healthStatus === 'green' && live >= 1) {
    return {
      style: 'testimonial_bridge',
      reason: 'Recent contact with a healthy account — lead with a testimonial request to reduce friction before the referral ask.',
    };
  }

  // Amber health or mid-score → soft mention
  if (client.healthStatus === 'amber' || (score >= 35 && score < 55)) {
    return {
      style: 'soft_mention',
      reason: 'Account health or readiness score suggests a soft approach — plant the seed without direct pressure.',
    };
  }

  // Long gap since last contact → follow-up style
  if (contact > 60) {
    return {
      style: 'follow_up',
      reason: 'It has been a while since last contact — a follow-up style resurfaces the referral opportunity naturally.',
    };
  }

  // Default for most healthy active accounts
  return {
    style: 'who_else',
    reason: 'Healthy account with good momentum — an open-ended "who else" question keeps it conversational and low-pressure.',
  };
}

// ── Conversation angle ────────────────────────────────────────────────────────

function buildConversationAngle(client: Client, style: ReferralAskStyleId, live: number): string {
  const name = client.businessName ?? client.contactName ?? 'your business';
  const channelRef = live >= 2 ? 'the results across your channels' : live === 1 ? 'the results we\'ve been getting' : 'the work we\'ve been doing together';

  switch (style) {
    case 'milestone_based':
      return `"Now that ${channelRef} are live and building momentum for ${name}, I wanted to ask — do you know any other business owners we could get similar results for?"`;
    case 'direct_intro':
      return `"We\'re really proud of what we\'ve built for ${name}. Do you know any other business owners in your network who are serious about growing their online presence? We\'d love an introduction."`;
    case 'who_else':
      return `"Who else in your network do you think could benefit from what we\'ve been doing together for ${name}?"`;
    case 'soft_mention':
      return `"A lot of our best clients come through introductions from people like you. If it ever comes up in conversation, please feel free to mention what we do."`;
    case 'testimonial_bridge':
      return `"Would you be open to sharing a quick review of ${channelRef}? And if you know anyone else who could use this kind of help, we\'d love an introduction too."`;
    case 'follow_up':
      return `"I know I\'ve mentioned before that we grow a lot through referrals — is there anyone in your world right now who might be looking to grow their online presence?"`;
    default:
      return `"Do you know anyone who could benefit from what we\'ve built for ${name}?"`;
  }
}

// ── Evidence points ───────────────────────────────────────────────────────────

function buildEvidencePoints(client: Client, live: number, contact: number): string[] {
  const points: string[] = [];

  if (client.healthStatus === 'green') points.push('Account health is green — client is satisfied and well-serviced');
  if (client.deliveryStatus === 'complete') points.push('Delivery complete — client has experienced a full cycle of value');
  if (client.deliveryStatus === 'active') points.push('Delivery active — visible momentum building');
  if (live >= 3) points.push(`${live} channels live — strong proof base for the referral conversation`);
  else if (live >= 1) points.push(`${live} channel${live !== 1 ? 's' : ''} live — proof points available`);
  if (contact <= 30) points.push(`Contact ${contact} days ago — relationship is warm`);
  if ((client.churnRiskScore ?? 0) < 0.2) points.push('Very low churn risk — highly satisfied account');
  if (client.upsellReadiness === 'hot') points.push('Flagged as hot for expansion — client sees strong value in the partnership');
  if (client.upsellReadiness === 'ready') points.push('Ready for expansion — client is engaged and forward-looking');

  return points.slice(0, 5); // cap at 5 for display
}

// ── Suppress check ────────────────────────────────────────────────────────────

function getSuppressionReasons(client: Client, contact: number, score: number): string[] {
  const reasons: string[] = [];
  if (client.healthStatus === 'red') reasons.push('Account health is red — resolve issues before asking');
  if (client.deliveryStatus === 'blocked') reasons.push('Delivery is blocked — clear the blocker first');
  if (client.deliveryStatus === 'onboarding') reasons.push('Account is still onboarding — too early to ask');
  if ((client.churnRiskScore ?? 0) >= 0.6) reasons.push('High churn risk — not the right time to ask');
  if (contact > 90) reasons.push('No contact in 90+ days — reconnect before asking');
  if (score < 30) reasons.push('Readiness score too low — more relationship-building needed first');
  return reasons;
}

// ── Main derivation ───────────────────────────────────────────────────────────

export function deriveReferralCandidates(clients: Client[]): ReferralCandidate[] {
  const activeClients = clients.filter(c => !c.archived);

  return activeClients.map(client => {
    const signals = evaluateSignals(client);
    const rawScore = signals.reduce((sum, s) => sum + (s.met ? s.score : 0), 0);
    const score = Math.min(100, rawScore);
    const contact = client.daysSinceContact ?? daysSince(client.lastContactDate);
    const live = liveChannelCount(client);

    const tier: ReferralReadinessTier =
      score >= 70 ? 'hot' : score >= 50 ? 'ready' : score >= 30 ? 'warming' : 'not_ready';

    const { style, reason } = selectAskStyle(client, score, contact, live);
    const styleConfig = REFERRAL_ASK_STYLES.find(s => s.id === style)!;
    const conversationAngle = buildConversationAngle(client, style, live);
    const evidencePoints = buildEvidencePoints(client, live, contact);
    const suppressReasons = getSuppressionReasons(client, contact, score);

    return {
      clientId: client.id ?? '',
      clientName: client.businessName ?? client.contactName ?? 'Unknown',
      company: client.businessName,
      readinessScore: score,
      readinessTier: tier,
      signals,
      recommendedStyle: style,
      styleReason: reason,
      evidencePoints,
      conversationAngle,
      exampleOpener: styleConfig.exampleOpener,
      suggestedTiming:
        tier === 'hot'
          ? 'Now — raise at next contact'
          : tier === 'ready'
          ? 'This week — schedule a check-in call'
          : tier === 'warming'
          ? 'After next delivery milestone'
          : 'Hold — conditions not yet right',
      preferredChannel: styleConfig.preferredChannel,
      suppressReasons,
      deliveryStatus: client.deliveryStatus,
      healthStatus: client.healthStatus,
      liveChannels: live,
      daysSinceContact: contact,
    };
  });
}

export function deriveReferralMomentumState(clients: Client[]): ReferralMomentumState {
  const candidates = deriveReferralCandidates(clients)
    .filter(c => c.readinessTier !== 'not_ready' || c.suppressReasons.length === 0)
    .sort((a, b) => b.readinessScore - a.readinessScore);

  return {
    candidates,
    totalCandidates: candidates.length,
    hotCandidates: candidates.filter(c => c.readinessTier === 'hot').length,
    readyCandidates: candidates.filter(c => c.readinessTier === 'ready').length,
    warmingCandidates: candidates.filter(c => c.readinessTier === 'warming').length,
    suppressedCount: deriveReferralCandidates(clients).filter(c => c.suppressReasons.length > 0).length,
    generatedAt: nowLabel(),
  };
}

// ── Draft content generator ───────────────────────────────────────────────────

export function generateReferralAskContent(
  candidate: ReferralCandidate,
  channel: 'call' | 'email' | 'sms',
): { subject?: string; body: string } {
  const styleConfig = REFERRAL_ASK_STYLES.find(s => s.id === candidate.recommendedStyle)!;

  if (channel === 'email') {
    return {
      subject: `Quick question for you`,
      body: `Hi ${candidate.clientName},\n\nHope things are going well — we've been thrilled with the progress we've made together${candidate.liveChannels > 0 ? ` and love seeing your results come in` : ''}.\n\nI wanted to ask a quick question: ${styleConfig.exampleOpener.replace(/^"/, '').replace(/"$/, '')}\n\nNo pressure at all — I just thought of you because the clients who know their industry best tend to also know who else could benefit from this kind of work.\n\nThanks so much — I really appreciate it.\n\nBest,\n[Your Name]`,
    };
  }

  if (channel === 'sms') {
    return {
      body: `Hi ${candidate.clientName} — quick favour to ask! We're looking for introductions to other business owners who'd benefit from what we've built for you. Do you know anyone I could reach out to? No pressure at all 🙂`,
    };
  }

  // Call prep
  return {
    body: `CALL PREP — REFERRAL ASK\n\nClient: ${candidate.clientName}\nStyle: ${styleConfig.label}\nChannel: Call\n\nWHY NOW:\n${candidate.styleReason}\n\nEVIDENCE TO REFERENCE:\n${candidate.evidencePoints.map(e => `• ${e}`).join('\n')}\n\nOPENER:\n${styleConfig.exampleOpener}\n\nCONVERSATION ANGLE:\n${candidate.conversationAngle}\n\nNOTES:\n- Keep it brief and conversational\n- If they say yes: ask for a name and intro email\n- If they say no: thank them and move on — no pressure\n- Log outcome after the call`,
  };
}
