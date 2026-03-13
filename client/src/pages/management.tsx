import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchTeamMembers, fetchLeads, fetchAllActivities, fetchClients } from '@/lib/firestoreService';
import type { Lead, Activity, Client, TeamMember } from '@/lib/types';
import { STAGE_ORDER } from '@/lib/types';
import {
  Users,
  TrendingUp,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Target,
  ChevronRight,
  BarChart3,
  Activity as ActivityIcon,
  UserCheck,
  Clock,
  Shield,
  Crown,
} from 'lucide-react';
import { format, isToday, isThisWeek, subDays, formatDistanceToNow } from 'date-fns';
import { Redirect } from 'wouter';

interface RepMetrics {
  member: TeamMember;
  leadCount: number;
  leadsByStage: Record<string, number>;
  activeDeals: number;
  clientCount: number;
  todayActivities: number;
  weekActivities: number;
  conversationCount: number;
  lastActivityDate: Date | null;
  avgConversationStage: string;
  pipelineValue: number;
}

function getRoleIcon(role: string) {
  if (role === 'owner') return Crown;
  if (role === 'admin') return Shield;
  return UserCheck;
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  if (role === 'owner') return 'default';
  if (role === 'admin') return 'secondary';
  return 'outline';
}

export default function ManagementPage() {
  const { user, orgId, authReady, membershipReady, isManager } = useAuth();
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | '30days'>('week');

  if (!isManager) {
    return <Redirect to="/dashboard" />;
  }

  const { data: teamMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['/team-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchTeamMembers(orgId, authReady);
    },
    enabled: !!orgId && authReady && membershipReady,
  });

  const { data: allLeads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['/management/leads', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchLeads(orgId, authReady);
    },
    enabled: !!orgId && authReady && membershipReady,
  });

  const { data: allActivities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['/management/activities', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchAllActivities(orgId, authReady);
    },
    enabled: !!orgId && authReady && membershipReady,
  });

  const { data: allClients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['/management/clients', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return await fetchClients(orgId, authReady);
    },
    enabled: !!orgId && authReady && membershipReady,
  });

  const isLoading = loadingMembers || loadingLeads || loadingActivities || loadingClients;

  const repMetrics: RepMetrics[] = useMemo(() => {
    const activeMembers = teamMembers.filter(m => m.status === 'active');
    
    return activeMembers.map(member => {
      const memberId = member.id;
      const memberLeads = allLeads.filter(l => l.userId === memberId);
      const memberActivities = allActivities.filter(a => a.userId === memberId);
      const memberClients = allClients.filter(c => c.userId === memberId);

      const leadsByStage: Record<string, number> = {};
      memberLeads.forEach(l => {
        leadsByStage[l.stage] = (leadsByStage[l.stage] || 0) + 1;
      });

      const todayActivities = memberActivities.filter(a => {
        const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        return isToday(d);
      }).length;

      const weekActivities = memberActivities.filter(a => {
        const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        return isThisWeek(d);
      }).length;

      const conversationCount = memberLeads.reduce((sum, l) => sum + (l.conversationCount || 0), 0);

      const activityDates = memberActivities.map(a => 
        a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)
      ).sort((a, b) => b.getTime() - a.getTime());

      const activeDeals = memberLeads.filter(l => 
        !l.archived && l.stage !== 'won' && l.stage !== 'lost'
      ).length;

      const pipelineValue = memberLeads
        .filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost')
        .reduce((sum, l) => sum + (l.mrr || 0), 0);

      return {
        member,
        leadCount: memberLeads.length,
        leadsByStage,
        activeDeals,
        clientCount: memberClients.length,
        todayActivities,
        weekActivities,
        conversationCount,
        lastActivityDate: activityDates.length > 0 ? activityDates[0] : null,
        avgConversationStage: 'N/A',
        pipelineValue,
      };
    }).sort((a, b) => b.weekActivities - a.weekActivities);
  }, [teamMembers, allLeads, allActivities, allClients]);

  const selectedRep = selectedRepId ? repMetrics.find(r => r.member.id === selectedRepId) : null;
  const selectedRepLeads = selectedRepId ? allLeads.filter(l => l.userId === selectedRepId) : [];
  const selectedRepActivities = selectedRepId ? allActivities.filter(a => a.userId === selectedRepId) : [];

  const filteredActivities = useMemo(() => {
    const now = new Date();
    return selectedRepActivities.filter(a => {
      const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      if (timeRange === 'today') return isToday(d);
      if (timeRange === 'week') return isThisWeek(d);
      return d >= subDays(now, 30);
    });
  }, [selectedRepActivities, timeRange]);

  const orgTotals = useMemo(() => ({
    totalLeads: allLeads.length,
    totalClients: allClients.length,
    totalActiveDeals: allLeads.filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost').length,
    totalPipelineValue: allLeads.filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost').reduce((s, l) => s + (l.mrr || 0), 0),
    todayActivityCount: allActivities.filter(a => {
      const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isToday(d);
    }).length,
    weekActivityCount: allActivities.filter(a => {
      const d = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return isThisWeek(d);
    }).length,
    totalReps: teamMembers.filter(m => m.status === 'active').length,
  }), [allLeads, allClients, allActivities, teamMembers]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-management-title">Management Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-8 bg-muted rounded w-1/3" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-management-title">Management Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Team overview and performance tracking</p>
        </div>
        {selectedRepId && (
          <Button
            variant="outline"
            onClick={() => setSelectedRepId(null)}
            data-testid="button-back-to-overview"
          >
            Back to Overview
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4" data-testid="card-stat-total-reps">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium">Active Reps</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{orgTotals.totalReps}</p>
        </Card>
        <Card className="p-4" data-testid="card-stat-active-deals">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Target className="h-4 w-4" />
            <span className="text-xs font-medium">Active Deals</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{orgTotals.totalActiveDeals}</p>
        </Card>
        <Card className="p-4" data-testid="card-stat-pipeline-value">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">Pipeline MRR</span>
          </div>
          <p className="text-2xl font-bold text-foreground">${orgTotals.totalPipelineValue.toLocaleString()}</p>
        </Card>
        <Card className="p-4" data-testid="card-stat-today-activities">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ActivityIcon className="h-4 w-4" />
            <span className="text-xs font-medium">Today's Activities</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{orgTotals.todayActivityCount}</p>
          <p className="text-xs text-muted-foreground">{orgTotals.weekActivityCount} this week</p>
        </Card>
      </div>

      {selectedRepId && selectedRep ? (
        <RepDetailView
          rep={selectedRep}
          leads={selectedRepLeads}
          activities={filteredActivities}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {repMetrics.map(rep => (
              <RepCard
                key={rep.member.id}
                rep={rep}
                onClick={() => setSelectedRepId(rep.member.id)}
              />
            ))}
          </div>
          {repMetrics.length === 0 && (
            <Card className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No team members found. Add team members in Settings.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function RepCard({ rep, onClick }: { rep: RepMetrics; onClick: () => void }) {
  const RoleIcon = getRoleIcon(rep.member.role);
  
  return (
    <Card
      className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
      data-testid={`card-rep-${rep.member.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-foreground">
              {(rep.member.displayName || rep.member.email || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">
              {rep.member.displayName || rep.member.email}
            </p>
            <Badge variant={getRoleBadgeVariant(rep.member.role)} className="text-[10px] mt-0.5">
              <RoleIcon className="h-3 w-3 mr-1" />
              {rep.member.role}
            </Badge>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-foreground">{rep.activeDeals}</p>
          <p className="text-[10px] text-muted-foreground">Active Deals</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{rep.todayActivities}</p>
          <p className="text-[10px] text-muted-foreground">Today</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{rep.weekActivities}</p>
          <p className="text-[10px] text-muted-foreground">This Week</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{rep.leadCount} leads · {rep.clientCount} clients</span>
          {rep.lastActivityDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(rep.lastActivityDate, 'dd/MM')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {rep.member.lastLoginAt ? (
            <>
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-muted-foreground">
                Last login {formatDistanceToNow(rep.member.lastLoginAt instanceof Date ? rep.member.lastLoginAt : new Date(rep.member.lastLoginAt), { addSuffix: true })}
              </span>
            </>
          ) : (
            <>
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
              <span className="text-muted-foreground/50">Never logged in</span>
            </>
          )}
        </div>
      </div>

      {rep.pipelineValue > 0 && (
        <div className="mt-2 text-xs font-medium text-foreground">
          Pipeline: ${rep.pipelineValue.toLocaleString()}/mo
        </div>
      )}
    </Card>
  );
}

function RepDetailView({
  rep,
  leads,
  activities,
  timeRange,
  onTimeRangeChange,
}: {
  rep: RepMetrics;
  leads: Lead[];
  activities: Activity[];
  timeRange: string;
  onTimeRangeChange: (v: 'today' | 'week' | '30days') => void;
}) {
  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost');

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGE_ORDER.forEach(s => { counts[s] = 0; });
    activeLeads.forEach(l => {
      counts[l.stage] = (counts[l.stage] || 0) + 1;
    });
    return counts;
  }, [activeLeads]);

  const activityBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(a => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }, [activities]);

  const recentActivities = activities.slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-bold text-foreground">
            {(rep.member.displayName || rep.member.email || '?').charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground" data-testid="text-rep-name">
            {rep.member.displayName || rep.member.email}
          </h2>
          <p className="text-sm text-muted-foreground">{rep.member.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Active Deals</p>
          <p className="text-xl font-bold text-foreground">{rep.activeDeals}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Leads</p>
          <p className="text-xl font-bold text-foreground">{rep.leadCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Clients</p>
          <p className="text-xl font-bold text-foreground">{rep.clientCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Conversations</p>
          <p className="text-xl font-bold text-foreground">{rep.conversationCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pipeline MRR</p>
          <p className="text-xl font-bold text-foreground">${rep.pipelineValue.toLocaleString()}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Pipeline Distribution</h3>
          <div className="space-y-2">
            {STAGE_ORDER.filter(s => s !== 'won' && s !== 'lost').map(stage => {
              const count = stageDistribution[stage] || 0;
              const maxCount = Math.max(...Object.values(stageDistribution), 1);
              const percentage = (count / maxCount) * 100;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 capitalize">{stage}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Activity Breakdown</h3>
            <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as 'today' | 'week' | '30days')}>
              <SelectTrigger className="w-[120px] h-8" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="30days">30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activityBreakdown.length > 0 ? (
            <div className="space-y-2">
              {activityBreakdown.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between py-1">
                  <span className="text-sm text-muted-foreground capitalize">{type.replace(/_/g, ' ')}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No activities in this period</p>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold text-foreground mb-3">Recent Activity</h3>
        {recentActivities.length > 0 ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {recentActivities.map(activity => {
              const actDate = activity.createdAt instanceof Date ? activity.createdAt : new Date(activity.createdAt);
              return (
                <div key={activity.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    {activity.type === 'call' && <Phone className="h-3.5 w-3.5 text-muted-foreground" />}
                    {activity.type === 'email' && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                    {activity.type === 'sms' && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                    {activity.type === 'meeting' && <Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
                    {!['call', 'email', 'sms', 'meeting'].includes(activity.type) && (
                      <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground capitalize">{activity.type.replace(/_/g, ' ')}</p>
                    {activity.notes && (
                      <p className="text-xs text-muted-foreground truncate">{activity.notes}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {format(actDate, 'dd/MM HH:mm')}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        )}
      </Card>
    </div>
  );
}
