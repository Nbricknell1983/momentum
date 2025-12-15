import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Phone, Users, FileText, DollarSign, Target, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatCard from '@/components/StatCard';
import TrafficLight from '@/components/TrafficLight';
import MomentumScoreCard from '@/components/MomentumScoreCard';
import MomentumCoach from '@/components/MomentumCoach';
import { RootState } from '@/store';
import { getTrafficLightStatus, STAGE_LABELS } from '@/lib/types';
import { calculateMomentum, calculateRollingAverage, detectTrendAlert, getMomentumStatusColor } from '@/lib/momentumEngine';
import type { ActivityTargets } from '@/lib/momentumEngine';
import { format, isToday } from 'date-fns';
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
      dropins: todayActivities.filter(a => a.type === 'dropin').length,
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

  const momentum = useMemo(() => 
    calculateMomentum(leads, activities, activityTargets, previousScores),
  [leads, activities, activityTargets, previousScores]);

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

  const overdueLeads = leads.filter(lead => {
    if (lead.archived || !lead.nextContactDate) return false;
    return getTrafficLightStatus(lead) === 'red';
  }).slice(0, 5);

  const dueTodayLeads = leads.filter(lead => {
    if (lead.archived || !lead.nextContactDate) return false;
    return isToday(new Date(lead.nextContactDate));
  });

  const funnelData = [
    { stage: 'Suspect', count: leads.filter(l => l.stage === 'suspect' && !l.archived).length },
    { stage: 'Contacted', count: leads.filter(l => l.stage === 'contacted' && !l.archived).length },
    { stage: 'Engaged', count: leads.filter(l => l.stage === 'engaged' && !l.archived).length },
    { stage: 'Qualified', count: leads.filter(l => l.stage === 'qualified' && !l.archived).length },
    { stage: 'Discovery', count: leads.filter(l => l.stage === 'discovery' && !l.archived).length },
    { stage: 'Proposal', count: leads.filter(l => l.stage === 'proposal' && !l.archived).length },
    { stage: 'Won', count: leads.filter(l => l.stage === 'won' && !l.archived).length },
  ];

  const wonMrr = leads
    .filter(l => l.stage === 'won' && !l.archived && l.mrr)
    .reduce((sum, l) => sum + (l.mrr || 0), 0);

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name || 'User'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2 text-base py-1 px-3">
            <Target className="h-4 w-4" />
            <span className="font-mono font-bold" style={{ color: momentum.statusColor }}>{momentum.score}</span>
            <span className="text-muted-foreground">Momentum</span>
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Calls Today"
          value={todayActivityCounts.calls}
          target={targets.calls}
          change={todayActivityCounts.calls > 0 ? Math.round((todayActivityCounts.calls / targets.calls) * 100) - 100 : 0}
          icon={<Phone className="h-5 w-5" />}
        />
        <StatCard
          title="Meetings"
          value={todayActivityCounts.meetings}
          target={targets.meetings}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Proposals"
          value={todayMetrics.proposals}
          target={targets.proposals}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Won MRR"
          value={`$${wonMrr.toLocaleString()}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <MomentumScoreCard momentum={momentum} showBreakdown={true} />
        <MomentumCoach momentum={momentum} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-semibold">Momentum Trend</h2>
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
          <div className="h-64" data-testid="momentum-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis domain={[0, 100]} className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === 'avg' ? '3-Day Avg' : 'Score'
                  ]}
                />
                <ReferenceLine y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" label={{ value: 'Healthy', position: 'right', fontSize: 10 }} />
                <ReferenceLine y={65} stroke="hsl(48, 96%, 53%)" strokeDasharray="5 5" label={{ value: 'Stable', position: 'right', fontSize: 10 }} />
                <ReferenceLine y={50} stroke="hsl(25, 95%, 53%)" strokeDasharray="5 5" label={{ value: 'At Risk', position: 'right', fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const color = getMomentumStatusColor(
                      payload.score >= 80 ? 'healthy' : 
                      payload.score >= 65 ? 'stable' : 
                      payload.score >= 50 ? 'at_risk' : 'critical'
                    );
                    return (
                      <circle
                        key={payload.date}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={color}
                        stroke="white"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-semibold">Pipeline Funnel</h2>
            <Badge variant="secondary">{leads.filter(l => !l.archived).length} Total</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="stage" type="category" className="text-xs" width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-semibold">Due Today</h2>
            <Badge variant="default">{dueTodayLeads.length}</Badge>
          </div>
          <div className="space-y-3">
            {dueTodayLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No leads due today</p>
            ) : (
              dueTodayLeads.slice(0, 5).map(lead => (
                <div key={lead.id} className="flex items-center gap-3 p-2 rounded-lg hover-elevate" data-testid={`due-today-${lead.id}`}>
                  <TrafficLight status="amber" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.companyName}</p>
                    <p className="text-xs text-muted-foreground">{STAGE_LABELS[lead.stage]}</p>
                  </div>
                  {lead.mrr && (
                    <Badge variant="outline" className="text-xs">${lead.mrr}</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h2 className="font-semibold">Overdue</h2>
            </div>
            <Badge variant="destructive">{overdueLeads.length}</Badge>
          </div>
          <div className="space-y-3">
            {overdueLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No overdue leads</p>
            ) : (
              overdueLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-3 p-2 rounded-lg hover-elevate" data-testid={`overdue-${lead.id}`}>
                  <TrafficLight status="red" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {lead.nextContactDate && format(new Date(lead.nextContactDate), 'MMM d')}
                    </p>
                  </div>
                  {lead.mrr && (
                    <Badge variant="outline" className="text-xs">${lead.mrr}</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
