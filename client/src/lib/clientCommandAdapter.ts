// =============================================================================
// CLIENT COMMAND CENTRE — Adapter
// =============================================================================
// Pure function that transforms the internal Client type into a
// ClientDashboardState safe for client consumption.
// Zero AI calls. Zero API calls. Derived entirely from existing fields.
// =============================================================================

import { format } from 'date-fns';
import type { Client, WorkstreamScope } from './types';
import type {
  ClientDashboardState, DeliverySummary, PerformanceSummary, ClientHealthScore,
  ClientMilestone, ClientNextAction, OptimisationActivity, StrategyAlignment,
  ChannelDelivery, ChannelDeliveryStatus, DeliveryPhase, ClientHealthStatus,
  MilestoneIcon, NextActionUrgency,
} from './clientCommandTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | Date | null): string {
  if (!d) return '';
  try { return format(new Date(d), 'dd MMM yyyy'); } catch { return ''; }
}

function safeIso(d?: string | Date | null): string | undefined {
  if (!d) return undefined;
  try { return new Date(d).toISOString(); } catch { return undefined; }
}

// ─── Channel delivery ─────────────────────────────────────────────────────────

function deriveChannelDelivery(client: Client): ChannelDelivery[] {
  const plan = client.activationPlan;
  const scope: WorkstreamScope[] = plan?.selectedScope || client.products?.map(p => p.type as WorkstreamScope) || [];
  const workstreams = plan?.workstreams || {};

  const allChannels: Array<{ channel: ChannelDelivery['channel']; label: string; scope: WorkstreamScope }> = [
    { channel: 'website', label: 'Website',                      scope: 'website' },
    { channel: 'gbp',     label: 'Google Business Profile',      scope: 'gbp' },
    { channel: 'seo',     label: 'Search Engine Optimisation',   scope: 'seo' },
    { channel: 'ads',     label: 'Google Ads',                   scope: 'ads' },
  ];

  const STATUS_LABELS: Record<ChannelDeliveryStatus, string> = {
    planned:      'Planned',
    in_progress:  'In Progress',
    live:         'Live',
    optimising:   'Active & Optimising',
    not_included: 'Not Included',
  };

  return allChannels.map(({ channel, label, scope: ch }) => {
    const included = scope.includes(ch);
    if (!included) {
      return { channel, label, status: 'not_included', statusLabel: 'Not Included', highlight: 'Not part of the current plan', isIncluded: false };
    }

    const ws = workstreams[channel as keyof typeof workstreams];
    const wsStatus = ws?.status;
    let status: ChannelDeliveryStatus = 'planned';
    let highlight = 'Scheduled for delivery';
    let milestoneDate: string | undefined;

    if (channel === 'website') {
      const ww = plan?.websiteWorkstream;
      if (wsStatus === 'live' || ww?.deploymentStatus === 'deployed') {
        status = 'live';
        const pageCount = ww?.pageStructure?.length || 0;
        highlight = pageCount > 0 ? `${pageCount} pages published` : 'Website is live';
        milestoneDate = ws?.updatedAt ? fmtDate(ws.updatedAt) : undefined;
      } else if (ww?.brief || ww?.pageStructure) {
        status = 'in_progress';
        const pageCount = ww?.pageStructure?.length || 0;
        highlight = pageCount > 0 ? `${pageCount} pages planned and in build` : 'Build is underway';
      } else if (wsStatus === 'active') {
        status = 'in_progress';
        highlight = 'Website build has started';
      }
      // Website engine data
      const we = client.websiteEngine;
      if (we && status === 'live') {
        status = 'optimising';
        highlight = 'Live and being optimised';
      }
    }

    if (channel === 'gbp') {
      const gw = plan?.gbpWorkstream;
      if (wsStatus === 'live') {
        status = 'live';
        const reviewCount = client.businessProfile?.reviewCount;
        const rating = client.businessProfile?.rating;
        highlight = reviewCount != null
          ? `${reviewCount} reviews${rating != null ? ` · ${rating.toFixed(1)}★` : ''}`
          : 'GBP is live and optimised';
        milestoneDate = ws?.updatedAt ? fmtDate(ws.updatedAt) : undefined;
      } else if (gw?.tasks?.length) {
        status = 'in_progress';
        const done = gw.tasks.filter(t => t.done).length;
        highlight = `${done}/${gw.tasks.length} optimisation tasks complete`;
      } else if (wsStatus === 'active') {
        status = 'in_progress';
        highlight = 'GBP optimisation underway';
      }
    }

    if (channel === 'seo') {
      const se = client.seoEngine;
      if (wsStatus === 'live' || se) {
        status = se ? 'optimising' : 'live';
        const kw = (se as any)?.rankedKeywords ?? (client as any).ahrefsData?.organicKeywords;
        highlight = kw != null ? `${kw} keywords ranked` : 'SEO foundations in place';
      } else if (wsStatus === 'active') {
        status = 'in_progress';
        highlight = 'SEO strategy being built';
      }
    }

    if (channel === 'ads') {
      if (wsStatus === 'live') {
        status = 'optimising';
        highlight = 'Campaigns running';
      } else if (wsStatus === 'active') {
        status = 'in_progress';
        highlight = 'Campaign setup underway';
      }
    }

    return {
      channel, label, status,
      statusLabel: STATUS_LABELS[status],
      highlight, milestoneDate,
      isIncluded: true,
    };
  });
}

// ─── Delivery phase ───────────────────────────────────────────────────────────

function deriveDeliveryPhase(client: Client, channels: ChannelDelivery[]): DeliveryPhase {
  const ds = client.deliveryStatus;
  if (ds === 'onboarding') return 'onboarding';
  if (!client.activationPlan) return 'not_started';
  const liveCount = channels.filter(c => ['live', 'optimising'].includes(c.status)).length;
  const inProgressCount = channels.filter(c => c.status === 'in_progress').length;
  if (liveCount > 0 && inProgressCount === 0) return 'optimising';
  if (liveCount > 0) return 'live';
  if (inProgressCount > 0) return 'building';
  return 'onboarding';
}

const PHASE_LABELS: Record<DeliveryPhase, string> = {
  not_started: 'Getting Started',
  onboarding:  'Onboarding',
  building:    'Building Your Digital Presence',
  live:        'Live & Growing',
  optimising:  'Actively Optimising',
};

const PHASE_DESCRIPTIONS: Record<DeliveryPhase, string> = {
  not_started: 'Your digital growth journey is being prepared.',
  onboarding:  'We\'re gathering everything we need to build your digital presence.',
  building:    'Your website and digital profiles are being built right now.',
  live:        'Your digital presence is live — visitors can find you online.',
  optimising:  'Everything is live and we\'re continuously improving your results.',
};

// ─── Delivery summary ─────────────────────────────────────────────────────────

function deriveDeliverySummary(client: Client): DeliverySummary {
  const channels = deriveChannelDelivery(client);
  const phase = deriveDeliveryPhase(client, channels);
  const included = channels.filter(c => c.isIncluded);
  const liveCount = channels.filter(c => ['live', 'optimising'].includes(c.status)).length;
  const totalCount = included.length;

  let progress = 0;
  if (totalCount > 0) {
    const statusWeights: Record<ChannelDeliveryStatus, number> = {
      not_included: 0, planned: 10, in_progress: 45, live: 85, optimising: 100,
    };
    progress = Math.round(
      channels.filter(c => c.isIncluded).reduce((s, c) => s + statusWeights[c.status], 0) / Math.max(totalCount, 1)
    );
  }

  return {
    phase, phaseLabel: PHASE_LABELS[phase],
    phaseDescription: PHASE_DESCRIPTIONS[phase],
    channels, overallProgress: progress,
    liveChannelCount: liveCount, totalChannelCount: totalCount,
    lastUpdated: client.updatedAt ? safeIso(client.updatedAt) : undefined,
  };
}

// ─── Performance summary ──────────────────────────────────────────────────────

function derivePerformanceSummary(client: Client, channels: ChannelDelivery[]): PerformanceSummary {
  const liveChannels = channels.filter(c => ['live', 'optimising'].includes(c.status));
  const hasData = liveChannels.length > 0;

  if (!hasData) {
    return {
      visibilityScore: 0,
      visibilityTrend: 'unknown',
      trendLabel: 'Data available once your site goes live',
      topWin: 'Your visibility journey starts the moment your site is launched.',
      keyMetrics: [],
      dataAvailable: false,
      dataNote: 'Performance data will appear here once your website and Google Business Profile are live.',
    };
  }

  // Derive simplified visibility score from available data
  let score = 20; // base — they have at least one live channel
  const se = client.seoEngine;
  const we = client.websiteEngine;
  const bp = client.businessProfile;
  const ahrefs = (client as any).ahrefsData;

  if (we) score += 20;
  if (se) score += 20;
  if (bp?.reviewCount && bp.reviewCount > 0) score += 15;
  if (ahrefs?.organicKeywords > 10) score += 15;
  if (bp?.rating && bp.rating >= 4.0) score += 10;
  score = Math.min(100, score);

  // Health trend approximation
  const health = client.healthStatus;
  const trend = health === 'green' ? 'improving'
    : health === 'amber' ? 'stable'
    : health === 'red' ? 'declining'
    : 'stable';

  const trendLabels = {
    improving: 'Your visibility is improving',
    stable: 'Results are holding steady',
    declining: 'Flagged for review',
    unknown: 'Data being collected',
  };

  // Key metrics — surface what we have
  const keyMetrics: Array<{ label: string; value: string; detail?: string; trend?: 'up' | 'down' | 'flat' }> = [];

  if (bp?.reviewCount != null) {
    keyMetrics.push({
      label: 'Google Reviews',
      value: String(bp.reviewCount),
      detail: bp.rating != null ? `${bp.rating.toFixed(1)}★ average` : undefined,
      trend: bp.reviewCount > 10 ? 'up' : 'flat',
    });
  }

  if (ahrefs?.organicKeywords != null) {
    keyMetrics.push({
      label: 'Keywords Ranked',
      value: String(ahrefs.organicKeywords),
      detail: 'On Google search',
      trend: 'up',
    });
  }

  if (we && liveChannels.some(c => c.channel === 'website')) {
    const pageCount = client.activationPlan?.websiteWorkstream?.pageStructure?.length;
    if (pageCount) {
      keyMetrics.push({
        label: 'Pages Published',
        value: String(pageCount),
        detail: 'On your website',
        trend: 'flat',
      });
    }
  }

  if (client.totalMRR > 0) {
    keyMetrics.push({
      label: 'Monthly Investment',
      value: `$${client.totalMRR.toLocaleString()}`,
      detail: 'Per month',
    });
  }

  // Top win — the single clearest positive signal
  let topWin = 'Your digital presence is live — you\'re now findable online.';
  if (bp?.reviewCount && bp.reviewCount > 20) {
    topWin = `${bp.reviewCount} Google reviews with ${bp.rating?.toFixed(1) || '4+'}★ — strong local trust signal.`;
  } else if (ahrefs?.organicKeywords > 20) {
    topWin = `Ranked for ${ahrefs.organicKeywords} keywords — growing search visibility.`;
  } else if (bp?.reviewCount && bp.reviewCount > 0) {
    topWin = `${bp.reviewCount} Google reviews — building your online reputation.`;
  }

  return {
    visibilityScore: score,
    visibilityTrend: trend,
    trendLabel: trendLabels[trend],
    topWin,
    keyMetrics,
    dataAvailable: true,
  };
}

// ─── Health score ─────────────────────────────────────────────────────────────

function deriveHealthScore(client: Client): ClientHealthScore {
  const h = client.healthStatus;
  const churn = client.churnRiskScore || 0;

  // Map internal health to client-facing score
  let score = 70; // default
  let status: ClientHealthStatus = 'good';
  let color = 'blue';

  if (h === 'green' && churn < 30) { score = 90; status = 'excellent'; color = 'emerald'; }
  else if (h === 'green') { score = 78; status = 'good'; color = 'blue'; }
  else if (h === 'amber') { score = 60; status = 'attention_needed'; color = 'amber'; }
  else if (h === 'red')   { score = 35; status = 'at_risk'; color = 'red'; }

  const STATUS_LABELS: Record<ClientHealthStatus, string> = {
    excellent: 'Excellent',
    good: 'On Track',
    attention_needed: 'Needs Attention',
    at_risk: 'At Risk',
  };

  // Highlights — positive things from health reasons
  const allReasons = client.healthReasons || [];
  const positiveReasons = allReasons.filter(r =>
    /ranking|review|active|performing|growth|click|traffic|conversion|strong|good|positive/i.test(r)
  ).slice(0, 3);
  const negativeReasons = allReasons.filter(r =>
    /missing|no contact|stale|low|drop|decline|risk|overdue|blocked/i.test(r)
  ).slice(0, 2);

  // Default highlights if none derived
  const highlights = positiveReasons.length > 0
    ? positiveReasons
    : [
      'Onboarded and active',
      client.activationPlan ? 'Delivery plan in place' : 'Strategy complete',
    ].filter(Boolean);

  // Alerts — client-safe versions of negative reasons
  const alerts = negativeReasons.slice(0, 2).map(r =>
    r.replace(/internal|system|admin|sales|CRM/gi, '').trim()
  );

  return { score, status, statusLabel: STATUS_LABELS[status], color, highlights, alerts };
}

// ─── Milestones ───────────────────────────────────────────────────────────────

function deriveMilestones(client: Client, delivery: DeliverySummary): ClientMilestone[] {
  const milestones: ClientMilestone[] = [];
  let nextSet = false;

  const addMilestone = (
    id: string, title: string, description: string,
    achieved: boolean, achievedAt?: string, icon: MilestoneIcon = 'goal',
  ) => {
    const isNext = !achieved && !nextSet;
    if (isNext) nextSet = true;
    milestones.push({ id, title, description, achieved, achievedAt, icon, isNext });
  };

  // 1. Onboarding complete
  const onboarded = !!client.activationPlan || client.deliveryStatus !== 'onboarding';
  addMilestone(
    'onboarding', 'Onboarding Complete',
    'All the information we need has been captured and your plan is confirmed.',
    onboarded, client.activationPlan?.activatedAt ? fmtDate(client.activationPlan.activatedAt) : undefined,
    'handshake',
  );

  // 2. Website live
  const websiteChannel = delivery.channels.find(c => c.channel === 'website');
  const websiteLive = websiteChannel?.status === 'live' || websiteChannel?.status === 'optimising';
  addMilestone(
    'website_live', 'Website Launched',
    'Your new website is live — customers can now find and contact you online.',
    websiteLive || false,
    websiteChannel?.milestoneDate,
    'launch',
  );

  // 3. GBP active
  const gbpChannel = delivery.channels.find(c => c.channel === 'gbp');
  const gbpLive = gbpChannel?.status === 'live' || gbpChannel?.status === 'optimising';
  const gbpIncluded = gbpChannel?.isIncluded;
  if (gbpIncluded) {
    addMilestone(
      'gbp_live', 'Google Business Profile Optimised',
      'Your Google Business Profile is fully set up — you\'re now showing on Google Maps.',
      gbpLive || false,
      gbpChannel?.milestoneDate,
      'gbp',
    );
  }

  // 4. First reviews
  const reviewCount = client.businessProfile?.reviewCount || 0;
  const hasReviews = reviewCount >= 5;
  addMilestone(
    'first_reviews', 'First 5 Google Reviews',
    'Building your reputation with 5 or more Google reviews — a key trust signal.',
    hasReviews,
    hasReviews ? undefined : undefined,
    'review',
  );

  // 5. SEO rankings
  const ahrefs = (client as any).ahrefsData;
  const hasRankings = (ahrefs?.organicKeywords || 0) >= 5;
  const seoIncluded = delivery.channels.find(c => c.channel === 'seo')?.isIncluded;
  if (seoIncluded) {
    addMilestone(
      'first_rankings', 'First Search Rankings',
      'Your business is now appearing in Google search results for relevant keywords.',
      hasRankings,
      hasRankings ? undefined : undefined,
      'ranking',
    );
  }

  // 6. 10+ reviews
  const hasTenReviews = reviewCount >= 10;
  addMilestone(
    'ten_reviews', '10 Google Reviews',
    '10 reviews is a key trust threshold — most customers check reviews before calling.',
    hasTenReviews,
    undefined,
    'review',
  );

  // 7. Active optimisation
  const isOptimising = delivery.phase === 'optimising';
  addMilestone(
    'optimising', 'Active Optimisation Running',
    'Your digital presence is live and we\'re continuously improving your results.',
    isOptimising,
    undefined,
    'traffic',
  );

  return milestones;
}

// ─── Client next actions ──────────────────────────────────────────────────────

function deriveNextActions(client: Client): ClientNextAction[] {
  const actions: ClientNextAction[] = [];

  // Onboarding blockers
  const onboarding = client.clientOnboarding;
  if (!client.activationPlan) {
    actions.push({
      id: 'complete-onboarding', category: 'approval', urgency: 'required_now',
      action: 'Complete your onboarding form',
      description: 'We need a few more details to get your project started.',
    });
  }

  // GBP access
  if (client.activationPlan?.selectedScope.includes('gbp') && !client.gbpLocationName) {
    actions.push({
      id: 'gbp-access', category: 'access', urgency: 'required_now',
      action: 'Grant access to your Google Business Profile',
      description: 'We need manager access to your GBP to start optimising it.',
    });
  }

  // Website review
  const ww = client.activationPlan?.websiteWorkstream;
  if (ww?.pageStructure?.length && client.activationPlan?.workstreams?.website?.status !== 'live') {
    actions.push({
      id: 'website-review', category: 'approval', urgency: 'this_week',
      action: 'Review and approve your website plan',
      description: `Your ${ww.pageStructure.length}-page website plan is ready for your review.`,
    });
  }

  // Review generation
  const reviewCount = client.businessProfile?.reviewCount || 0;
  if (reviewCount < 10 && client.activationPlan) {
    actions.push({
      id: 'reviews', category: 'feedback', urgency: 'when_ready',
      action: 'Ask your recent customers for a Google review',
      description: `You currently have ${reviewCount} review${reviewCount !== 1 ? 's' : ''}. Reaching 10 makes a significant difference to your visibility.`,
    });
  }

  // Scope activation plan notes
  const note = (onboarding as any)?.handoverNotes;
  if (note && typeof note === 'string' && note.length > 10) {
    // There might be client-requested items in the notes — skip parsing for now
  }

  return actions.slice(0, 5); // Cap at 5 to avoid overwhelm
}

// ─── Optimisation activity ────────────────────────────────────────────────────

function deriveOptimisationActivity(client: Client): OptimisationActivity {
  const mode = client.automationMode;
  const exec = client.executionStatus;
  const isActive = client.deliveryStatus === 'active' || !!exec;

  const recentActions: string[] = [];
  const upcomingWork: string[] = [];

  // Pull from execution status if available
  if (exec) {
    const status = exec as Record<string, any>;
    Object.entries(status).forEach(([channel, s]: [string, any]) => {
      if (s?.lastActionLabel) recentActions.push(s.lastActionLabel);
      if (s?.nextActionLabel) upcomingWork.push(s.nextActionLabel);
    });
  }

  // Derive from activation plan activity
  const gw = client.activationPlan?.gbpWorkstream;
  if (gw?.tasks) {
    const doneTasks = gw.tasks.filter(t => t.done).slice(0, 2);
    const todoTasks = gw.tasks.filter(t => !t.done).slice(0, 2);
    doneTasks.forEach(t => { if (!recentActions.includes(t.title)) recentActions.push(t.title); });
    todoTasks.forEach(t => { if (!upcomingWork.includes(t.title)) upcomingWork.push(t.title); });
  }

  // Default actions if nothing is available
  if (recentActions.length === 0 && isActive) {
    recentActions.push('Monthly performance review completed');
    if (client.activationPlan?.selectedScope.includes('seo')) {
      recentActions.push('SEO keyword monitoring updated');
    }
  }

  if (upcomingWork.length === 0 && isActive) {
    if (client.activationPlan?.selectedScope.includes('gbp')) {
      upcomingWork.push('Monthly GBP post scheduled');
      upcomingWork.push('Review response monitoring');
    }
    if (client.activationPlan?.selectedScope.includes('seo')) {
      upcomingWork.push('SEO performance analysis');
    }
  }

  const summaries: Record<string, string> = {
    assisted:    'Your team and ours are working together to grow your digital presence.',
    supervised:  'Our system is actively managing your digital presence with regular check-ins.',
    autonomous:  'Your digital presence is running on full autopilot — we handle everything.',
  };

  return {
    isActive,
    summary: mode ? (summaries[mode] || 'Your digital presence is being actively managed.') : 'Your digital presence is being managed.',
    recentActions: recentActions.slice(0, 4),
    upcomingWork: upcomingWork.slice(0, 3),
  };
}

// ─── Strategy alignment ───────────────────────────────────────────────────────

function deriveStrategyAlignment(client: Client, delivery: DeliverySummary): StrategyAlignment {
  const scope = client.activationPlan?.selectedScope || [];
  const sourceIntel = client.sourceIntelligence;

  const SCOPE_LABELS: Record<string, string> = {
    website: 'New professional website',
    gbp: 'Google Business Profile optimisation',
    seo: 'Search engine optimisation',
    ads: 'Google Ads campaign',
    content: 'Content marketing',
    local_seo: 'Local SEO pages',
    telemetry: 'Analytics & tracking',
    autopilot: 'Growth autopilot',
    portal_access: 'Client portal access',
  };

  const promised = scope.map(s => SCOPE_LABELS[s] || s);

  // What has been delivered
  const delivered: string[] = [];
  delivery.channels.forEach(c => {
    if (['live', 'optimising'].includes(c.status)) {
      delivered.push(c.highlight || c.label);
    }
  });

  // Add any milestone-based deliverables
  const reviewCount = client.businessProfile?.reviewCount || 0;
  if (reviewCount > 0) {
    delivered.push(`${reviewCount} Google review${reviewCount !== 1 ? 's' : ''} established`);
  }

  if (delivered.length === 0 && client.activationPlan) {
    delivered.push('Onboarding complete — delivery starting');
  }

  // What is still to come
  const upcoming: string[] = [];
  delivery.channels.forEach(c => {
    if (['planned', 'in_progress'].includes(c.status) && c.isIncluded) {
      if (c.status === 'in_progress') {
        upcoming.push(`${c.label}: currently being built`);
      } else {
        upcoming.push(`${c.label}: scheduled for delivery`);
      }
    }
  });

  // Add review milestone if not yet achieved
  if (reviewCount < 10) {
    upcoming.push(`Reach 10 Google reviews (currently ${reviewCount})`);
  }

  // Growth prescription context
  const gp = (client as any).growthPrescription;
  if (gp?.nextPriorityAction) {
    upcoming.push(gp.nextPriorityAction);
  }

  return {
    promised: promised.slice(0, 6),
    delivered: delivered.slice(0, 5),
    upcoming: upcoming.slice(0, 5),
  };
}

// ─── Main adapter ─────────────────────────────────────────────────────────────

export function deriveClientDashboard(client: Client): ClientDashboardState {
  const delivery     = deriveDeliverySummary(client);
  const performance  = derivePerformanceSummary(client, delivery.channels);
  const health       = deriveHealthScore(client);
  const milestones   = deriveMilestones(client, delivery);
  const nextActions  = deriveNextActions(client);
  const optimisation = deriveOptimisationActivity(client);
  const strategy     = deriveStrategyAlignment(client, delivery);

  return {
    clientId:          client.id,
    businessName:      client.businessName,
    primaryContact:    client.primaryContactName,
    delivery,
    performance,
    health,
    milestones,
    nextActions,
    optimisation,
    strategyAlignment: strategy,
    generatedAt:       new Date().toISOString(),
  };
}
