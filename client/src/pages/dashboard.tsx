import { useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Phone, Users, FileText, DollarSign, AlertTriangle, CheckCircle, Clock, Mail, MessageSquare, CalendarCheck, MapPin, Send, TrendingUp, Zap, BarChart2, Activity, ArrowRight, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MomentumScoreCard from '@/components/MomentumScoreCard';
import MomentumCoach from '@/components/MomentumCoach';
import { RootState } from '@/store';
import { calculateRollingAverage, detectTrendAlert, getMomentumStatusColor, getMomentumStatus, getMomentumStatusLabel } from '@/lib/momentumEngine';
import type { ActivityTargets, MomentumResult } from '@/lib/momentumEngine';
import { format, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'today', label: "Today's Activity" },
  { id: 'momentum', label: 'Momentum' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'activity', label: 'Activity Log' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const user = useSelector((state: RootState) => state.app.user);
  const leads = useSelector((state: RootState) => state.app.leads);
  const activities = useSelector((state: RootState) => state.app.activities);
  const dailyMetrics = useSelector((state: RootState) => state.app.dailyMetrics);

  const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };

  const todayActivityCounts = useMemo(() => {
    const todayActivities = activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt);
    });
    return {
      calls: todayActivities.filter(a => a.type === 'call').length,
      emails: todayActivities.filter(a => a.type === 'email').length,
      sms: todayActivities.filter(a => a.type === 'sms').length,
      meetings: todayActivities.filter(a => a.type === 'meeting').length,
      meetingsBooked: todayActivities.filter(a => a.type === 'meeting_booked').length,
      dropins: todayActivities.filter(a => a.type === 'dropin').length,
      proposalsSent: todayActivities.filter(a => a.type === 'proposal_sent').length,
      proposalsWon: todayActivities.filter(a => a.type === 'proposal_won').length,
    };
  }, [activities]);

  const activityTargets: ActivityTargets = useMemo(() => ({
    calls: targets.calls,
    sms: Math.round(targets.followups * 0.5),
    emails: Math.round(targets.followups * 0.3),
    dropins: targets.doors,
    meetings: targets.meetings,
  }), [targets]);

  const previousScores = useMemo(() =>
    dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse(),
  [dailyMetrics]);

  const momentum = useMemo((): MomentumResult => {
    const ACTIVITY_WEIGHTS: Record<string, number> = { call: 1.0, sms: 0.6, email: 0.4, dropin: 1.2, meeting: 0.5 };
    const EARLY_STAGES = ['suspect', 'contacted', 'engaged'];
    const MID_STAGES = ['qualified', 'discovery'];
    const LATE_STAGES = ['proposal', 'verbal_commit', 'won'];

    const todayActivities = activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt);
    });

    let weightedSum = 0;
    let targetSum = 0;
    Object.entries(activityTargets).forEach(([key, target]) => {
      const type = key === 'dropins' ? 'dropin' : key === 'calls' ? 'call' : key === 'emails' ? 'email' : key === 'meetings' ? 'meeting' : key;
      const count = todayActivities.filter(a => a.type === type).length;
      const weight = ACTIVITY_WEIGHTS[type] || 0.5;
      weightedSum += Math.min(count, target) * weight;
      targetSum += target * weight;
    });

    const activityScore = targetSum > 0 ? Math.round((weightedSum / targetSum) * 100) : 0;
    const activeLeads = leads.filter(l => !l.archived);
    const totalStageCount = activeLeads.length;
    const earlyStageCount = activeLeads.filter(l => EARLY_STAGES.includes(l.stage)).length;
    const midStageCount = activeLeads.filter(l => MID_STAGES.includes(l.stage)).length;
    const lateStageCount = activeLeads.filter(l => LATE_STAGES.includes(l.stage)).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentWins = activities.filter(a => a.type === 'proposal_won' && new Date(a.createdAt) >= sevenDaysAgo).length;
    const recentLosses = activities.filter(a => (a.type === 'archived' || a.type === 'lost') && new Date(a.createdAt) >= sevenDaysAgo).length;
    const netChange = recentWins - recentLosses;
    const replacementRate = totalStageCount > 0 ? (netChange / totalStageCount) * 100 : 0;
    const replacementScore = Math.max(0, Math.min(100, 50 + replacementRate * 5));
    const newDealsCreated = activities.filter(a => a.type === 'lead_created' && new Date(a.createdAt) >= sevenDaysAgo).length;
    const dealsRemoved = recentLosses;

    let pipelineHealthScore = 75;
    let earlyStagePercent = 0;
    let lateStagePercent = 0;
    if (totalStageCount > 0) {
      earlyStagePercent = Math.round((earlyStageCount / totalStageCount) * 100);
      lateStagePercent = Math.round(((midStageCount + lateStageCount) / totalStageCount) * 100);
      pipelineHealthScore = Math.max(0, Math.min(100, 100 - Math.abs(earlyStagePercent - 50)));
    }

    const rawScore = Math.round(replacementScore * 0.33 + activityScore * 0.34 + pipelineHealthScore * 0.33);
    const score = Math.max(0, Math.min(100, rawScore));
    const status = getMomentumStatus(score);
    const prevAvg = previousScores.length > 0 ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length : score;
    const trend = score > prevAvg + 5 ? 'up' : score < prevAvg - 5 ? 'down' : 'flat';
    const minScore = Math.min(replacementScore, activityScore, pipelineHealthScore);
    const constraint = minScore === replacementScore ? 'replacement' : minScore === activityScore ? 'activity' : 'pipeline';

    return {
      score, status, statusLabel: getMomentumStatusLabel(status), statusColor: getMomentumStatusColor(status),
      breakdown: { replacementScore, replacementRate: Math.round(replacementRate), newDealsCreated, dealsRemoved, activityScore: Math.round(activityScore), activityIndex: weightedSum, targetActivityIndex: targetSum, pipelineHealthScore, earlyStagePercent, lateStagePercent, adjustments: [] },
      constraint, trend,
    };
  }, [activities, activityTargets, previousScores]);

  const trendData = useMemo(() => {
    const scores = dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse();
    const rollingAvg = calculateRollingAverage(scores, 3);
    return dailyMetrics.slice(0, 7).reverse().map((m, i) => ({
      date: format(new Date(m.date), 'EEE'),
      score: m.momentumScore,
      avg: rollingAvg[i] || m.momentumScore,
    }));
  }, [dailyMetrics]);

  const trendAlert = useMemo(() =>
    detectTrendAlert(dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse()),
  [dailyMetrics]);

  const funnelData = useMemo(() => {
    const activeLeads = leads.filter(l => !l.archived);
    const stageCounts: Record<string, number> = {};
    activeLeads.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1; });
    return [
      { stage: 'Suspect', count: stageCounts['suspect'] || 0 },
      { stage: 'Contacted', count: stageCounts['contacted'] || 0 },
      { stage: 'Engaged', count: stageCounts['engaged'] || 0 },
      { stage: 'Qualified', count: stageCounts['qualified'] || 0 },
      { stage: 'Discovery', count: stageCounts['discovery'] || 0 },
      { stage: 'Proposal', count: stageCounts['proposal'] || 0 },
      { stage: 'Won', count: stageCounts['won'] || 0 },
    ];
  }, [leads]);

  const wonMrr = useMemo(() =>
    activities.filter(a => a.type === 'deal' || a.type === 'proposal_won' || (a.type === 'stage_change' && a.metadata?.newStage === 'won'))
      .reduce((sum, a) => sum + (Number(a.metadata?.mrr) || Number(a.metadata?.wonMrr) || 0), 0),
  [activities]);

  const totalActivityCounts = useMemo(() => ({
    proposalsSent: activities.filter(a => a.type === 'proposal_sent').length,
    proposalsWon: activities.filter(a => a.type === 'proposal_won').length,
    calls: activities.filter(a => a.type === 'call').length,
  }), [activities]);

  const recentActivities = useMemo(() =>
    [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
  [activities]);

  const todayCompletedActions = useMemo(() =>
    activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt) && a.type === 'nba_completed';
    }),
  [activities]);

  const todayLabel = format(new Date(), 'MMMM yyyy');
  const userName = authUser?.displayName || authUser?.email?.split('@')[0] || 'Rep';

  const momentumStatusBadge =
    momentum.score >= 80 ? { label: 'Momentum Strong', color: 'border-emerald-400/40 text-emerald-300', icon: Zap } :
    momentum.score >= 65 ? { label: 'Building Momentum', color: 'border-blue-400/40 text-blue-300', icon: TrendingUp } :
    { label: 'Momentum At Risk', color: 'border-amber-400/40 text-amber-300', icon: AlertTriangle };

  const activeLeadsCount = leads.filter(l => !l.archived).length;

  return (
    <div className="h-full overflow-auto" data-testid="text-dashboard-title">

      {/* Sticky Section Nav */}
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 px-8 overflow-x-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground pr-4 shrink-0 py-3">MOMENTUM</span>
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors hover:bg-muted/50 rounded-sm"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION: Overview (Hero) ── */}
      <section id="overview" className="relative px-12 pt-16 pb-24 overflow-hidden" style={{ background: 'linear-gradient(120deg, #13082e 0%, #1e0c4a 25%, #3b1585 60%, #5b1fc8 85%, #6d28d9 100%)' }}>
        {/* layered radial glow — mimics the reference purple bloom */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(ellipse 80% 90% at 80% 50%, rgba(109,40,217,0.55) 0%, transparent 65%), radial-gradient(ellipse 50% 70% at 100% 20%, rgba(139,92,246,0.3) 0%, transparent 60%)' }} />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-white/70 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {userName} — {todayLabel}
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
            Daily Sales Performance
          </h1>
          <p className="text-white/60 text-xl max-w-2xl mb-10 leading-relaxed">
            A live view of today's activity, pipeline momentum, and where to focus your energy next.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-white/5 text-sm font-medium ${momentumStatusBadge.color}`}>
              <momentumStatusBadge.icon className="h-3.5 w-3.5" />
              {momentumStatusBadge.label}
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-violet-400/40 bg-white/5 text-sm font-medium text-violet-300">
              <Users className="h-3.5 w-3.5" />
              {activeLeadsCount} Active Leads
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-sky-400/40 bg-white/5 text-sm font-medium text-sky-300">
              <DollarSign className="h-3.5 w-3.5" />
              ${wonMrr.toLocaleString()} Won MRR
            </div>
          </div>
        </div>
        {/* Scroll indicator mouse — bottom centre */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-50">
          <svg width="22" height="34" viewBox="0 0 22 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="20" height="32" rx="10" stroke="white" strokeWidth="1.5"/>
            <rect x="9.5" y="7" width="3" height="7" rx="1.5" fill="white">
              <animateTransform attributeName="transform" type="translate" values="0,0;0,5;0,0" dur="1.8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite"/>
            </rect>
          </svg>
        </div>
      </section>

      {/* ── SECTION: Today's Activity ── */}
      <section id="today" className="px-12 py-16 bg-white dark:bg-background">
        <div className="max-w-5xl">
          <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">TODAY'S NUMBERS</p>
          <h2 className="text-4xl font-bold text-foreground mb-3 tracking-tight">Performance snapshot</h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl">
            These numbers reflect all logged activity since midnight today. Hit your targets consistently to build momentum.
          </p>

          {/* 3-column stat cards */}
          <div className="grid grid-cols-3 gap-5 mb-8">
            {[
              { icon: Phone, value: todayActivityCounts.calls, target: targets.calls, label: 'Calls Made', desc: 'Outbound dials logged today', trend: 'Increasing', trendColor: 'text-emerald-600 dark:text-emerald-400', iconColor: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10' },
              { icon: CalendarCheck, value: todayActivityCounts.meetingsBooked, target: null, label: 'Meetings Booked', desc: 'New appointments scheduled', trend: null, trendColor: '', iconColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10' },
              { icon: Users, value: todayActivityCounts.meetings, target: targets.meetings, label: 'Meetings Held', desc: 'Discovery & sales conversations', trend: null, trendColor: '', iconColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.iconColor}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  {item.trend && <span className={`text-sm font-medium ${item.trendColor}`}>{item.trend}</span>}
                </div>
                <div className="text-4xl font-bold text-foreground mb-1">{item.value}</div>
                {item.target && <div className="text-xs text-muted-foreground mb-2">Target: {item.target}</div>}
                <div className="font-semibold text-foreground mb-1">{item.label}</div>
                <div className="text-sm text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-3 gap-5 mb-10">
            {[
              { icon: Mail, value: todayActivityCounts.emails, label: 'Emails Sent', iconColor: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/10' },
              { icon: MessageSquare, value: todayActivityCounts.sms, label: 'SMS Sent', iconColor: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-400/10' },
              { icon: MapPin, value: todayActivityCounts.dropins, label: 'Drop-ins', iconColor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.iconColor}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* All-time totals — dark callout */}
          <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, #0f0a1e 0%, #1a1040 100%)' }}>
            <p className="text-xs font-semibold tracking-widest text-white/40 uppercase mb-6">ALL-TIME TOTALS</p>
            <div className="grid grid-cols-3 gap-6">
              {[
                { icon: Send, value: totalActivityCounts.proposalsSent, label: 'Proposals Sent', color: 'text-violet-400 bg-violet-400/10' },
                { icon: FileText, value: totalActivityCounts.proposalsWon, label: 'Proposals Won', color: 'text-emerald-400 bg-emerald-400/10' },
                { icon: DollarSign, value: `$${wonMrr.toLocaleString()}`, label: 'Won MRR', color: 'text-sky-400 bg-sky-400/10' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{item.value}</div>
                    <div className="text-sm text-white/50">{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION: Momentum ── */}
      <section id="momentum" className="px-12 py-16" style={{ background: '#f8f7ff' }}>
        <div className="max-w-5xl dark:bg-transparent" style={{ background: 'transparent' }}>
          <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">MOMENTUM SCORE</p>
          <h2 className="text-4xl font-bold text-foreground mb-3 tracking-tight">How you're tracking</h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl">
            Your momentum score reflects pipeline health, activity consistency, and deal flow — updated in real time.
          </p>
          <div className="grid lg:grid-cols-2 gap-6">
            <MomentumScoreCard momentum={momentum} showBreakdown={true} />
            <MomentumCoach momentum={momentum} />
          </div>

          {/* Momentum context callout */}
          <div className="mt-8 rounded-2xl p-6 border-l-4 border-violet-500 bg-violet-50 dark:bg-violet-950/30">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1">Where the momentum is right now</p>
            <p className="text-sm text-violet-700/70 dark:text-violet-400">
              {momentum.score >= 80
                ? 'You are in a strong momentum phase. Keep the activity consistent and protect your pipeline health.'
                : momentum.score >= 65
                ? 'Momentum is building. Focus on converting engaged leads and maintaining call volume to push into the healthy zone.'
                : 'Momentum needs attention. Prioritise calls and new lead outreach today to turn the trend around.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION: Pipeline ── */}
      <section id="pipeline" className="px-12 py-16 bg-white dark:bg-background">
        <div className="max-w-5xl">
          <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">PIPELINE</p>
          <h2 className="text-4xl font-bold text-foreground mb-3 tracking-tight">Trend & funnel</h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl">
            Your 7-day momentum trend and a full breakdown of where leads sit across the pipeline right now.
          </p>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-500" />
                  <h3 className="font-semibold">Momentum Trend</h3>
                </div>
                <div className="flex items-center gap-2">
                  {trendAlert.alert && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      {trendAlert.type === 'downtrend' ? 'Downtrend' : 'Flatline'}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">Last 7 Days</Badge>
                </div>
              </div>
              <div className="h-56" data-testid="momentum-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} className="text-xs" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [value, name === 'avg' ? '3-Day Avg' : 'Score']}
                    />
                    <ReferenceLine y={80} stroke="hsl(142,76%,36%)" strokeDasharray="5 5" label={{ value: 'Healthy', position: 'right', fontSize: 10 }} />
                    <ReferenceLine y={65} stroke="hsl(48,96%,53%)" strokeDasharray="5 5" label={{ value: 'Stable', position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                    <Line
                      type="monotone" dataKey="score" stroke="#7c3aed" strokeWidth={2.5}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = getMomentumStatusColor(payload.score >= 80 ? 'healthy' : payload.score >= 65 ? 'stable' : payload.score >= 50 ? 'at_risk' : 'critical');
                        return <circle key={payload.date} cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-violet-500" />
                  <h3 className="font-semibold">Pipeline Funnel</h3>
                </div>
                <Badge variant="secondary" className="text-xs">{funnelData.reduce((s, d) => s + d.count, 0)} Leads</Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="stage" type="category" className="text-xs" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* What success looks like — 3 cards */}
          <div className="mt-12">
            <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">THE GOAL</p>
            <h3 className="text-2xl font-bold text-foreground mb-8">What success looks like</h3>
            <div className="grid grid-cols-3 gap-5">
              {[
                { icon: Target, title: 'Full Pipeline', desc: 'Every stage loaded with real opportunities — no gaps, no stale cards sitting untouched.', color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10' },
                { icon: TrendingUp, title: 'Consistent Activity', desc: 'Daily call targets hit, follow-ups logged on time, and momentum score trending green.', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10' },
                { icon: DollarSign, title: 'Growing MRR', desc: 'Proposals converting to wins and recurring revenue compounding month over month.', color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/10' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border bg-card p-6 hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold text-foreground mb-2">{item.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION: Activity Log ── */}
      <section id="activity" className="px-12 py-16" style={{ background: '#f8f7ff' }}>
        <div className="max-w-5xl">
          <p className="text-xs font-semibold tracking-widest text-violet-600 dark:text-violet-400 uppercase mb-3">ACTIVITY LOG</p>
          <h2 className="text-4xl font-bold text-foreground mb-3 tracking-tight">What's been happening</h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl">
            A complete log of recent activity across your pipeline — calls, emails, meetings, and milestones.
          </p>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-semibold">Completed Today</h3>
                </div>
                <Badge>{todayCompletedActions.length}</Badge>
              </div>
              <div className="space-y-3">
                {todayCompletedActions.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No completed actions yet today</p>
                    <p className="text-xs text-muted-foreground mt-1">Log activity from the Pipeline to see it here</p>
                  </div>
                ) : (
                  todayCompletedActions.slice(0, 6).map(activity => (
                    <div key={activity.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors" data-testid={`completed-action-${activity.id}`}>
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center shrink-0">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{activity.notes || 'Action completed'}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'h:mm a')}</p>
                      </div>
                      {activity.metadata?.points && (
                        <Badge variant="outline" className="text-xs shrink-0">+{activity.metadata.points}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">Recent Activity</h3>
                </div>
                <Badge variant="secondary">{recentActivities.length}</Badge>
              </div>
              <div className="space-y-3">
                {recentActivities.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No recent activity logged yet</p>
                  </div>
                ) : (
                  recentActivities.map(activity => (
                    <div key={activity.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors" data-testid={`recent-activity-${activity.id}`}>
                      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-400/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate capitalize">{activity.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'MMM d, h:mm a')}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="px-12 py-8 border-t bg-white dark:bg-background flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{userName} — Momentum Agent — {format(new Date(), 'MMMM yyyy')}</p>
        <p className="text-sm text-muted-foreground">Built to drive pipeline momentum</p>
      </div>
    </div>
  );
}
