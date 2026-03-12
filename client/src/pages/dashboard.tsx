import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Phone, Users, FileText, DollarSign, Target, AlertTriangle, CheckCircle, Clock, Mail, MessageSquare, CalendarCheck, MapPin, Send, TrendingUp, Zap, BarChart2, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatCard from '@/components/StatCard';
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
    const TARGET_KEY_TO_ACTIVITY_TYPE: Record<string, string> = {
      calls: 'call', sms: 'sms', emails: 'email', dropins: 'dropin', meetings: 'meeting'
    };
    const ACTIVITY_WEIGHTS: Record<string, number> = {
      call: 1.0, sms: 0.6, email: 0.4, dropin: 1.2, meeting: 0.5
    };
    const EARLY_STAGES = ['suspect', 'contacted', 'engaged'];
    const MID_STAGES = ['qualified', 'discovery'];
    const LATE_STAGES = ['proposal', 'verbal_commit', 'won'];
    const ALL_STAGES = [...EARLY_STAGES, ...MID_STAGES, ...LATE_STAGES];
    
    const todayActivities = activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt);
    });
    
    let weightedSum = 0;
    let targetSum = 0;
    
    Object.entries(activityTargets).forEach(([targetKey, target]) => {
      const activityType = TARGET_KEY_TO_ACTIVITY_TYPE[targetKey] || targetKey;
      const count = todayActivities.filter(a => a.type === activityType).length;
      const weight = ACTIVITY_WEIGHTS[activityType] || 0.5;
      weightedSum += Math.min(count / Math.max(target, 1), 1.5) * weight;
      targetSum += weight;
    });
    
    const activityScore = targetSum > 0 ? (weightedSum / targetSum) * 100 : 50;
    
    const stageChanges = activities.filter(a => a.type === 'stage_change');
    const newDealsCreated = activities.filter(a => a.type === 'deal').length;
    const dealsRemoved = stageChanges.filter(a => 
      a.metadata?.newStage === 'won' || a.metadata?.newStage === 'lost'
    ).length;
    
    let replacementRate: number;
    let replacementScore: number;
    if (newDealsCreated === 0 && dealsRemoved === 0) {
      replacementRate = 100;
      replacementScore = 75;
    } else if (dealsRemoved === 0) {
      replacementRate = 200;
      replacementScore = 100;
    } else {
      replacementRate = (newDealsCreated / dealsRemoved) * 100;
      if (replacementRate >= 120) replacementScore = 100;
      else if (replacementRate >= 100) replacementScore = 90;
      else if (replacementRate >= 80) replacementScore = 70;
      else if (replacementRate >= 60) replacementScore = 50;
      else replacementScore = 30;
    }
    
    const earlyStageCount = stageChanges.filter(a => EARLY_STAGES.includes(a.metadata?.newStage as string)).length;
    const midStageCount = stageChanges.filter(a => MID_STAGES.includes(a.metadata?.newStage as string)).length;
    const lateStageCount = stageChanges.filter(a => LATE_STAGES.includes(a.metadata?.newStage as string)).length;
    const totalStageCount = earlyStageCount + midStageCount + lateStageCount;
    
    let earlyStagePercent: number;
    let lateStagePercent: number;
    let pipelineHealthScore: number;
    
    if (totalStageCount === 0) {
      earlyStagePercent = 50;
      lateStagePercent = 50;
      pipelineHealthScore = 75;
    } else {
      earlyStagePercent = Math.round((earlyStageCount / totalStageCount) * 100);
      lateStagePercent = Math.round(((midStageCount + lateStageCount) / totalStageCount) * 100);
      const idealEarlyPercent = 50;
      const balancePenalty = Math.abs(earlyStagePercent - idealEarlyPercent);
      pipelineHealthScore = Math.max(0, Math.min(100, 100 - balancePenalty));
    }
    
    const rawScore = Math.round(replacementScore * 0.33 + activityScore * 0.34 + pipelineHealthScore * 0.33);
    const score = Math.max(0, Math.min(100, rawScore));
    const status = getMomentumStatus(score);
    
    const prevAvg = previousScores.length > 0 ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length : score;
    const trend = score > prevAvg + 5 ? 'up' : score < prevAvg - 5 ? 'down' : 'flat';
    
    const minScore = Math.min(replacementScore, activityScore, pipelineHealthScore);
    const constraint = minScore === replacementScore ? 'replacement' : minScore === activityScore ? 'activity' : 'pipeline';
    
    return {
      score,
      status,
      statusLabel: getMomentumStatusLabel(status),
      statusColor: getMomentumStatusColor(status),
      breakdown: {
        replacementScore, replacementRate: Math.round(replacementRate), newDealsCreated, dealsRemoved,
        activityScore: Math.round(activityScore), activityIndex: weightedSum, targetActivityIndex: targetSum,
        pipelineHealthScore, earlyStagePercent, lateStagePercent,
        adjustments: []
      },
      constraint,
      trend
    };
  }, [activities, activityTargets, previousScores]);

  const todayMetrics = dailyMetrics.find(m => isToday(new Date(m.date))) || {
    calls: 0, doors: 0, meetings: 0, followups: 0, proposals: 0, deals: 0, momentumScore: 0
  };

  const trendData = useMemo(() => {
    const scores = dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse();
    const rollingAvg = calculateRollingAverage(scores, 3);
    
    return dailyMetrics.slice(0, 7).reverse().map((m, i) => ({
      date: format(new Date(m.date), 'EEE'),
      score: m.momentumScore,
      avg: rollingAvg[i] || m.momentumScore,
      status: m.momentumScore >= 80 ? 'healthy' : m.momentumScore >= 65 ? 'stable' : m.momentumScore >= 50 ? 'at_risk' : 'critical',
    }));
  }, [dailyMetrics]);

  const trendAlert = useMemo(() => 
    detectTrendAlert(dailyMetrics.slice(0, 7).map(m => m.momentumScore).reverse()),
  [dailyMetrics]);

  const recentActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);
  }, [activities]);

  const todayCompletedActions = useMemo(() => {
    return activities.filter(a => {
      const createdAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(createdAt) && a.type === 'nba_completed';
    });
  }, [activities]);

  const funnelData = useMemo(() => {
    const activeLeads = leads.filter(l => !l.archived);
    const stageCounts: Record<string, number> = {};
    
    activeLeads.forEach(l => {
      stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1;
    });
    
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

  const wonMrr = useMemo(() => {
    return activities
      .filter(a => a.type === 'deal' || a.type === 'proposal_won' || (a.type === 'stage_change' && a.metadata?.newStage === 'won'))
      .reduce((sum, a) => sum + (Number(a.metadata?.mrr) || Number(a.metadata?.wonMrr) || 0), 0);
  }, [activities]);

  // Total cumulative activity counts (all time, not just today)
  const totalActivityCounts = useMemo(() => {
    return {
      proposalsSent: activities.filter(a => a.type === 'proposal_sent').length,
      proposalsWon: activities.filter(a => a.type === 'proposal_won').length,
      calls: activities.filter(a => a.type === 'call').length,
      emails: activities.filter(a => a.type === 'email').length,
      meetings: activities.filter(a => a.type === 'meeting').length,
      meetingsBooked: activities.filter(a => a.type === 'meeting_booked').length,
    };
  }, [activities]);

  const todayLabel = format(new Date(), 'MMMM yyyy');
  const userName = authUser?.displayName || authUser?.email?.split('@')[0] || 'Rep';

  const statusBadges = [
    {
      label: momentum.score >= 80 ? 'Momentum Strong' : momentum.score >= 65 ? 'Building Momentum' : 'Momentum At Risk',
      icon: Zap,
      color: momentum.score >= 80 ? 'border-emerald-400/40 text-emerald-300' : momentum.score >= 65 ? 'border-blue-400/40 text-blue-300' : 'border-amber-400/40 text-amber-300',
    },
    {
      label: `${leads.filter(l => !l.archived).length} Active Leads`,
      icon: Users,
      color: 'border-violet-400/40 text-violet-300',
    },
    {
      label: `$${wonMrr.toLocaleString()} Won MRR`,
      icon: DollarSign,
      color: 'border-sky-400/40 text-sky-300',
    },
  ];

  return (
    <div className="overflow-auto h-full" data-testid="text-dashboard-title">
      {/* Hero Section */}
      <div className="relative px-8 pt-10 pb-12 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e0a4e 0%, #2d1b69 45%, #1a1040 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, #7c3aed 0%, transparent 60%)' }} />
        <div className="relative max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-white/70 text-sm mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {userName} — {todayLabel}
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 leading-tight">
            Daily Sales Performance
          </h1>
          <p className="text-white/60 text-lg max-w-xl mb-8">
            A live view of today's activity, pipeline momentum, and where to focus next.
          </p>
          <div className="flex flex-wrap gap-3">
            {statusBadges.map((badge) => (
              <div key={badge.label} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-white/5 text-sm font-medium ${badge.color}`}>
                <badge.icon className="h-3.5 w-3.5" />
                {badge.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-8 space-y-8">
        {/* Performance Snapshot — dark card */}
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f0a1e 0%, #1a1040 100%)' }}>
          <div className="px-6 pt-5 pb-2">
            <p className="text-xs font-semibold tracking-widest text-white/40 uppercase">Today's Performance Snapshot</p>
          </div>
          {[
            { icon: Phone, value: todayActivityCounts.calls, label: 'Calls Made', target: targets.calls, color: 'text-violet-400 bg-violet-400/10' },
            { icon: Mail, value: todayActivityCounts.emails, label: 'Emails Sent', target: null, color: 'text-blue-400 bg-blue-400/10' },
            { icon: MessageSquare, value: todayActivityCounts.sms, label: 'SMS Sent', target: null, color: 'text-sky-400 bg-sky-400/10' },
            { icon: CalendarCheck, value: todayActivityCounts.meetingsBooked, label: 'Meetings Booked', target: null, color: 'text-emerald-400 bg-emerald-400/10' },
            { icon: Users, value: todayActivityCounts.meetings, label: 'Meetings Held', target: targets.meetings, color: 'text-teal-400 bg-teal-400/10' },
            { icon: MapPin, value: todayActivityCounts.dropins, label: 'Drop-ins', target: targets.doors, color: 'text-amber-400 bg-amber-400/10' },
          ].map((item, i, arr) => (
            <div key={item.label} className={`flex items-center gap-4 px-6 py-4 ${i < arr.length - 1 ? 'border-b border-white/5' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/50 text-sm">{item.label}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-2xl font-bold text-white">{item.value}</span>
                {item.target !== null && (
                  <span className="text-white/30 text-sm">/ {item.target}</span>
                )}
              </div>
            </div>
          ))}
          <div className="px-6 py-3 border-t border-white/5">
            <p className="text-white/25 text-xs">Activity reflects logged entries for today only.</p>
          </div>
        </div>

        {/* All-time totals */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4">All-Time Pipeline Totals</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Send, label: 'Proposals Sent', value: totalActivityCounts.proposalsSent, color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/10' },
              { icon: FileText, label: 'Proposals Won', value: totalActivityCounts.proposalsWon, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10' },
              { icon: DollarSign, label: 'Won MRR', value: `$${wonMrr.toLocaleString()}`, color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/10' },
            ].map((item) => (
              <Card key={item.label} className="p-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{item.label}</p>
                  <p className="text-2xl font-bold">{item.value}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Momentum + Coach */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4">Momentum Score</p>
          <div className="grid lg:grid-cols-2 gap-6">
            <MomentumScoreCard momentum={momentum} showBreakdown={true} />
            <MomentumCoach momentum={momentum} />
          </div>
        </div>

        {/* Charts */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4">Trend & Pipeline</p>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-500" />
                  <h2 className="font-semibold">Momentum Trend</h2>
                </div>
                <div className="flex items-center gap-2">
                  {trendAlert.alert && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {trendAlert.type === 'downtrend' ? 'Downtrend' : 'Flatline'}
                    </Badge>
                  )}
                  <Badge variant="secondary">Last 7 Days</Badge>
                </div>
              </div>
              <div className="h-56" data-testid="momentum-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis domain={[0, 100]} className="text-xs" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [value, name === 'avg' ? '3-Day Avg' : 'Score']}
                    />
                    <ReferenceLine y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" label={{ value: 'Healthy', position: 'right', fontSize: 10 }} />
                    <ReferenceLine y={65} stroke="hsl(48, 96%, 53%)" strokeDasharray="5 5" label={{ value: 'Stable', position: 'right', fontSize: 10 }} />
                    <ReferenceLine y={50} stroke="hsl(25, 95%, 53%)" strokeDasharray="5 5" label={{ value: 'At Risk', position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = getMomentumStatusColor(payload.score >= 80 ? 'healthy' : payload.score >= 65 ? 'stable' : payload.score >= 50 ? 'at_risk' : 'critical');
                        return <circle key={payload.date} cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-violet-500" />
                  <h2 className="font-semibold">Pipeline Funnel</h2>
                </div>
                <Badge variant="secondary">{funnelData.reduce((sum, d) => sum + d.count, 0)} Leads</Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="stage" type="category" className="text-xs" width={80} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>

        {/* Activity log */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4">Activity Log</p>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <h2 className="font-semibold">Completed Today</h2>
                </div>
                <Badge variant="default">{todayCompletedActions.length}</Badge>
              </div>
              <div className="space-y-3">
                {todayCompletedActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No completed actions today</p>
                ) : (
                  todayCompletedActions.slice(0, 5).map(activity => (
                    <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg hover-elevate" data-testid={`completed-action-${activity.id}`}>
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{activity.notes || 'Action completed'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(activity.createdAt instanceof Date ? activity.createdAt : new Date(activity.createdAt), 'h:mm a')}
                        </p>
                      </div>
                      {activity.metadata?.points && (
                        <Badge variant="outline" className="text-xs">+{activity.metadata.points}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">Recent Activity</h2>
                </div>
                <Badge variant="secondary">{recentActivities.length}</Badge>
              </div>
              <div className="space-y-3">
                {recentActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
                ) : (
                  recentActivities.map(activity => (
                    <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg hover-elevate" data-testid={`recent-activity-${activity.id}`}>
                      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-400/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate capitalize">{activity.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(activity.createdAt instanceof Date ? activity.createdAt : new Date(activity.createdAt), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
