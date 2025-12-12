import { useSelector } from 'react-redux';
import { Phone, Users, FileText, DollarSign, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import StatCard from '@/components/StatCard';
import TrafficLight from '@/components/TrafficLight';
import { RootState } from '@/store';
import { getTrafficLightStatus, STAGE_LABELS } from '@/lib/types';
import { format, isToday, isPast } from 'date-fns';
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
} from 'recharts';

export default function DashboardPage() {
  const user = useSelector((state: RootState) => state.app.user);
  const leads = useSelector((state: RootState) => state.app.leads);
  const dailyMetrics = useSelector((state: RootState) => state.app.dailyMetrics);
  const tasks = useSelector((state: RootState) => state.app.tasks);

  // Get today's metrics
  const todayMetrics = dailyMetrics.find(m => isToday(new Date(m.date))) || {
    calls: 0, doors: 0, meetings: 0, followups: 0, proposals: 0, deals: 0, momentumScore: 0
  };

  // Calculate weekly momentum
  const weeklyMomentum = dailyMetrics.slice(0, 7).reduce((sum, m) => sum + m.momentumScore, 0);
  const avgMomentum = dailyMetrics.length > 0 
    ? Math.round(weeklyMomentum / Math.min(dailyMetrics.length, 7)) 
    : 0;

  // Get overdue leads
  const overdueLeads = leads.filter(lead => {
    if (lead.archived || !lead.nextContactDate) return false;
    return getTrafficLightStatus(lead) === 'red';
  }).slice(0, 5);

  // Get due today leads
  const dueTodayLeads = leads.filter(lead => {
    if (lead.archived || !lead.nextContactDate) return false;
    return isToday(new Date(lead.nextContactDate));
  });

  // Pipeline funnel data
  const funnelData = [
    { stage: 'Suspect', count: leads.filter(l => l.stage === 'suspect' && !l.archived).length },
    { stage: 'Contacted', count: leads.filter(l => l.stage === 'contacted' && !l.archived).length },
    { stage: 'Engaged', count: leads.filter(l => l.stage === 'engaged' && !l.archived).length },
    { stage: 'Qualified', count: leads.filter(l => l.stage === 'qualified' && !l.archived).length },
    { stage: 'Discovery', count: leads.filter(l => l.stage === 'discovery' && !l.archived).length },
    { stage: 'Proposal', count: leads.filter(l => l.stage === 'proposal' && !l.archived).length },
    { stage: 'Won', count: leads.filter(l => l.stage === 'won' && !l.archived).length },
  ];

  // Momentum trend data
  const trendData = dailyMetrics.slice(0, 7).reverse().map(m => ({
    date: format(new Date(m.date), 'EEE'),
    score: m.momentumScore,
  }));

  // Calculate total won MRR
  const wonMrr = leads
    .filter(l => l.stage === 'won' && !l.archived && l.mrr)
    .reduce((sum, l) => sum + (l.mrr || 0), 0);

  const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name || 'User'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2 text-base py-1 px-3">
            <Target className="h-4 w-4" />
            <span className="font-mono font-bold">{avgMomentum}</span>
            <span className="text-muted-foreground">Avg Momentum</span>
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Calls Today"
          value={todayMetrics.calls}
          target={targets.calls}
          change={todayMetrics.calls > 0 ? Math.round((todayMetrics.calls / targets.calls) * 100) - 100 : 0}
          icon={<Phone className="h-5 w-5" />}
        />
        <StatCard
          title="Meetings"
          value={todayMetrics.meetings}
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

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Momentum Trend */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Momentum Trend</h2>
            <Badge variant="secondary">Last 7 Days</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pipeline Funnel */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
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

      {/* Bottom Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Due Today */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
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

        {/* Overdue */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
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
