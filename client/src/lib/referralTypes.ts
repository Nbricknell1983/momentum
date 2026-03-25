// ── Ask styles ────────────────────────────────────────────────────────────────

export type ReferralAskStyleId =
  | 'milestone_based'
  | 'direct_intro'
  | 'who_else'
  | 'soft_mention'
  | 'testimonial_bridge'
  | 'follow_up';

export interface ReferralAskStyleConfig {
  id: ReferralAskStyleId;
  label: string;
  when: string;
  why: string;
  preferredChannel: 'call' | 'email' | 'sms';
  wordingAngle: string;
  exampleOpener: string;
}

export const REFERRAL_ASK_STYLES: ReferralAskStyleConfig[] = [
  {
    id: 'milestone_based',
    label: 'Milestone-Based Ask',
    when: 'Immediately after a significant delivery win, approval, or go-live moment',
    why: 'Momentum is at its peak. The client just experienced a win and will naturally want to share it.',
    preferredChannel: 'call',
    wordingAngle: 'Reference the specific milestone, then bridge to asking who else could benefit',
    exampleOpener: '"Now that your website is live and ranking, I\'d love to ask — do you know any other business owners we could get results like this for?"',
  },
  {
    id: 'direct_intro',
    label: 'Direct Introduction Ask',
    when: 'High readiness score, green health, clear visible results to reference',
    why: 'Strong relationship and clear proof points make a direct ask natural and credible.',
    preferredChannel: 'call',
    wordingAngle: 'Be direct and specific about who you\'re looking for — makes it easy to think of someone',
    exampleOpener: '"Do you know any other [industry] business owners who are serious about growing their online presence? We\'d love to help them the way we\'ve helped you."',
  },
  {
    id: 'who_else',
    label: '"Who Else" Ask',
    when: 'Client is happy but hasn\'t been asked before. Good for most healthy accounts.',
    why: 'Open-ended question lets the client self-select — lower pressure, often very effective.',
    preferredChannel: 'call',
    wordingAngle: 'Keep it conversational and open — don\'t make it feel transactional',
    exampleOpener: '"Who else in your network do you think could benefit from what we\'ve been doing together?"',
  },
  {
    id: 'soft_mention',
    label: 'Soft Mention',
    when: 'Account is amber health or early in the relationship — don\'t push for a direct ask',
    why: 'Plants the seed without creating pressure. Converts over time as trust builds.',
    preferredChannel: 'email',
    wordingAngle: 'Mention referrals as a natural part of how you grow — not a specific request',
    exampleOpener: '"A lot of our best clients have come through introductions from people like you. If it ever comes up, please feel free to mention us."',
  },
  {
    id: 'testimonial_bridge',
    label: 'Testimonial Bridge',
    when: 'Client is enthusiastic and vocal about results. Testimonial leads naturally to referral.',
    why: 'Asking for a testimonial first is lower friction — the referral ask becomes a natural follow-on.',
    preferredChannel: 'email',
    wordingAngle: 'Lead with the testimonial request, then add the referral ask as a natural extension',
    exampleOpener: '"Would you be open to sharing a quick review of our work together? And if you know anyone else who\'d benefit, we\'d love an introduction."',
  },
  {
    id: 'follow_up',
    label: 'Follow-Up Ask',
    when: 'A previous ask was made but no referral came through — timing may have been off',
    why: 'Circumstances change. A client who couldn\'t refer before may now know someone ready.',
    preferredChannel: 'call',
    wordingAngle: 'Acknowledge the previous conversation naturally, then resurface — no pressure',
    exampleOpener: '"I mentioned a while back that we\'re always looking for good introductions. Is there anyone in your world right now who might be ready for a conversation?"',
  },
];

// ── Signals ───────────────────────────────────────────────────────────────────

export interface ReferralReadinessSignal {
  id: string;
  label: string;
  met: boolean;
  score: number;          // contribution to total score (0–30)
  explanation: string;
}

// ── Candidate ─────────────────────────────────────────────────────────────────

export type ReferralReadinessTier = 'hot' | 'ready' | 'warming' | 'not_ready';

export interface ReferralCandidate {
  clientId: string;
  clientName: string;
  company?: string;
  readinessScore: number; // 0–100
  readinessTier: ReferralReadinessTier;
  signals: ReferralReadinessSignal[];
  recommendedStyle: ReferralAskStyleId;
  styleReason: string;
  evidencePoints: string[];
  conversationAngle: string;
  exampleOpener: string;
  suggestedTiming: string;
  preferredChannel: 'call' | 'email' | 'sms';
  suppressReasons: string[];
  deliveryStatus?: string;
  healthStatus?: string;
  liveChannels: number;
  daysSinceContact: number;
}

// ── Ask tracking ──────────────────────────────────────────────────────────────

export type ReferralAskStatus =
  | 'created'
  | 'sent'
  | 'responded'
  | 'lead_created'
  | 'won'
  | 'lost'
  | 'no_response';

export interface ReferralAsk {
  id?: string;
  orgId: string;
  clientId: string;
  clientName: string;
  style: ReferralAskStyleId;
  channel: 'call' | 'email' | 'sms';
  status: ReferralAskStatus;
  askBody?: string;
  createdAt: string;
  createdBy: string;
  sentAt?: string;
  respondedAt?: string;
  responseNote?: string;
  referralLeadName?: string;
  referralLeadCreatedAt?: string;
  outcome?: 'referred_converted' | 'referred_not_converted' | 'no_referral' | 'pending';
}

// ── Lead linkage ──────────────────────────────────────────────────────────────

export interface ReferralLeadLink {
  referralAskId: string;
  sourceClientId: string;
  sourceClientName: string;
  referralLeadName: string;
  linkedAt: string;
  outcome?: 'won' | 'lost' | 'in_progress';
}

// ── Program state ─────────────────────────────────────────────────────────────

export interface ReferralMomentumState {
  candidates: ReferralCandidate[];
  totalCandidates: number;
  hotCandidates: number;
  readyCandidates: number;
  warmingCandidates: number;
  suppressedCount: number;
  generatedAt: string;
}

// ── Evidence ──────────────────────────────────────────────────────────────────

export interface ReferralEvidence {
  type: 'delivery' | 'health' | 'contact' | 'channel' | 'trust' | 'expansion';
  label: string;
  detail: string;
  strength: 'strong' | 'moderate' | 'weak';
}
