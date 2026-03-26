import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import {
  Inbox,
  Package,
  Users,
  TrendingUp,
  Settings2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type WorkItem = {
  id: string;
  type: 'delivery' | 'client' | 'pipeline' | 'system';
  title: string;
  diagnosis: string;
  nextAction: string;
  priority: 'high' | 'medium' | 'low';
  status: 'detected' | 'in_progress' | 'resolved';
  owner: string;
  supporting: string[];
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  delivery: { label: 'Implementation Brief', icon: Package, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  client:   { label: 'Client Alert',         icon: Users,   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  pipeline: { label: 'Pipeline Action',      icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  system:   { label: 'System Notice',        icon: Settings2, color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
};

const PRIORITY_STYLE: Record<string, string> = {
  high:   'bg-red-500/15 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  low:    'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const STATUS_LABEL: Record<string, string> = {
  detected:    'Needs action',
  in_progress: 'In progress',
  resolved:    'Done',
};

type FilterType = 'all' | 'delivery' | 'client' | 'pipeline' | 'system';

export default function MyWorkPage() {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<WorkItem[]>({
    queryKey: ['/api/my-work', orgId],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/my-work?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load work items');
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/my-work/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/my-work', orgId] });
      toast({ title: 'Updated', description: 'Work item status updated.' });
    },
  });

  const items = data || [];
  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);
  const pending   = items.filter(i => i.status === 'detected').length;
  const inProg    = items.filter(i => i.status === 'in_progress').length;
  const done      = items.filter(i => i.status === 'resolved').length;

  const TABS: { key: FilterType; label: string; icon: any }[] = [
    { key: 'all',      label: 'All',            icon: Inbox },
    { key: 'delivery', label: 'Implementation', icon: Package },
    { key: 'client',   label: 'Client',         icon: Users },
    { key: 'pipeline', label: 'Pipeline',        icon: TrendingUp },
    { key: 'system',   label: 'System',          icon: Settings2 },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border px-6 py-5 flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Inbox className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">My Work</h1>
          </div>
          <p className="text-sm text-muted-foreground">Assigned tasks, recommended next steps, and items needing your attention.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-my-work"
          className="text-muted-foreground h-8 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 flex gap-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="font-semibold text-foreground">{pending}</span>
          <span className="text-muted-foreground">needs action</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="font-semibold text-foreground">{inProg}</span>
          <span className="text-muted-foreground">in progress</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span className="font-semibold text-foreground">{done}</span>
          <span className="text-muted-foreground">completed</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-6 pt-4 pb-0 flex gap-1 border-b border-border flex-shrink-0">
        {TABS.map(tab => {
          const count = tab.key === 'all' ? items.length : items.filter(i => i.type === tab.key).length;
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              data-testid={`tab-my-work-${tab.key}`}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t border-b-2 transition-colors ${
                active
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Work items */}
      <div className="flex-1 px-6 py-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">All clear</p>
            <p className="text-xs text-muted-foreground/60 mt-1">No work items in this category right now.</p>
          </div>
        ) : (
          filtered.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.system;
            const Icon = meta.icon;
            const isExpanded = expandedId === item.id;
            const isResolved = item.status === 'resolved';

            return (
              <div
                key={item.id}
                data-testid={`card-work-item-${item.id}`}
                className={`border rounded-xl transition-all ${isResolved ? 'opacity-50' : ''} ${meta.bg}`}
              >
                {/* Card header */}
                <button
                  className="w-full text-left px-4 py-3.5 flex items-start gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  data-testid={`button-expand-work-${item.id}`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 border ${PRIORITY_STYLE[item.priority]}`}>
                        {item.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
                    {item.clientName && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {item.clientName}
                      </p>
                    )}
                  </div>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground/50 flex-shrink-0 transition-transform mt-0.5 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {item.diagnosis && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Context</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.diagnosis}</p>
                      </div>
                    )}
                    {item.nextAction && (
                      <div className="bg-background/50 border border-border rounded-lg px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Recommended next step</p>
                        <p className="text-sm text-foreground leading-relaxed">{item.nextAction}</p>
                      </div>
                    )}
                    {(item.owner || item.supporting?.length > 0) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Assigned to:</p>
                        {item.owner && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{item.owner}</span>
                        )}
                        {item.supporting?.map((s: string) => (
                          <span key={s} className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground/70">{s}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      {item.status === 'detected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'in_progress' })}
                          disabled={updateStatus.isPending}
                          data-testid={`button-start-work-${item.id}`}
                        >
                          Mark in progress
                        </Button>
                      )}
                      {item.status === 'in_progress' && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'resolved' })}
                          disabled={updateStatus.isPending}
                          data-testid={`button-resolve-work-${item.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Mark done
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
