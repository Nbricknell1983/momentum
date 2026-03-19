import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw, Zap, AlertTriangle, CheckCircle2, Clock, Ban,
  ChevronDown, ChevronUp, Building2, TrendingUp, Settings,
  ArrowRight, CircleDot, Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkStatus = 'detected' | 'triaged' | 'in_progress' | 'blocked' | 'awaiting_review' | 'complete';
type WorkPriority = 'high' | 'medium' | 'low';
type WorkType = 'system' | 'integration' | 'client' | 'pipeline';

interface WorkItem {
  id: string;
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  type: WorkType;
  title: string;
  diagnosis: string;
  sourceSignal: string;
  priority: WorkPriority;
  status: WorkStatus;
  owner: string;
  supporting: string[];
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  threadId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkStatus, { label: string; color: string; icon: typeof CircleDot }> = {
  detected:       { label: 'Detected',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',       icon: CircleDot },
  triaged:        { label: 'Triaged',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',           icon: Zap },
  in_progress:    { label: 'In Progress',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',   icon: RefreshCw },
  blocked:        { label: 'Blocked',         color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',               icon: Ban },
  awaiting_review:{ label: 'Awaiting Review', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',      icon: Clock },
  complete:       { label: 'Complete',        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400', icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<WorkPriority, { label: string; color: string; dot: string }> = {
  high:   { label: 'High',   color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',       dot: 'bg-red-500' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400', dot: 'bg-amber-500' },
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', dot: 'bg-slate-400' },
};

const TYPE_ICON: Record<WorkType, typeof Building2> = {
  system:      Settings,
  integration: Settings,
  client:      Building2,
  pipeline:    TrendingUp,
};

// Next status transitions for a given status
const NEXT_STATUSES: Record<WorkStatus, WorkStatus[]> = {
  detected:        ['triaged', 'complete'],
  triaged:         ['in_progress', 'blocked'],
  in_progress:     ['awaiting_review', 'blocked', 'complete'],
  blocked:         ['in_progress', 'complete'],
  awaiting_review: ['complete', 'in_progress'],
  complete:        [],
};

const STATUS_TRANSITION_LABELS: Partial<Record<WorkStatus, string>> = {
  triaged:         'Mark Triaged',
  in_progress:     'Start Work',
  blocked:         'Mark Blocked',
  awaiting_review: 'Send for Review',
  complete:        'Mark Complete',
};

type FilterTab = 'all' | 'high' | 'blocked' | 'awaiting_review' | 'complete';

// ── Sub-components ────────────────────────────────────────────────────────────

function SpecialistTag({ name, primary }: { name: string; primary?: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
      primary
        ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
    }`}>
      {primary && <span className="mr-1 opacity-60 text-[9px]">owner</span>}
      {name}
    </span>
  );
}

function WorkItemCard({
  item,
  onStatusChange,
  isUpdating,
}: {
  item: WorkItem;
  onStatusChange: (itemId: string, status: WorkStatus) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = TYPE_ICON[item.type] ?? Settings;
  const statusCfg = STATUS_CONFIG[item.status];
  const priorityCfg = PRIORITY_CONFIG[item.priority];
  const StatusIcon = statusCfg.icon;
  const nextStatuses = NEXT_STATUSES[item.status] ?? [];
  const isComplete = item.status === 'complete';

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isComplete
          ? 'border-border/40 bg-muted/30'
          : item.priority === 'high'
            ? 'border-red-200 dark:border-red-900/50 bg-card'
            : 'border-border bg-card'
      }`}
      data-testid={`work-item-${item.id}`}
    >
      {/* Header row */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
          item.type === 'system' || item.type === 'integration'
            ? 'bg-violet-100 dark:bg-violet-900/30'
            : item.type === 'pipeline'
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : 'bg-emerald-100 dark:bg-emerald-900/30'
        }`}>
          <TypeIcon className={`h-3.5 w-3.5 ${
            item.type === 'system' || item.type === 'integration'
              ? 'text-violet-600 dark:text-violet-400'
              : item.type === 'pipeline'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-emerald-600 dark:text-emerald-400'
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className={`text-sm font-medium leading-tight ${isComplete ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {item.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Priority */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
              {priorityCfg.label}
            </span>
            {/* Status */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCfg.color}`}>
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </span>
            {/* Client context */}
            {item.clientName && (
              <span className="text-[10px] text-muted-foreground">{item.clientName}</span>
            )}
            {/* Age */}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-muted-foreground mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          {/* Specialist assignment */}
          <div className="flex flex-wrap gap-1.5">
            {item.owner && <SpecialistTag name={item.owner} primary />}
            {item.supporting?.map(s => <SpecialistTag key={s} name={s} />)}
          </div>

          {/* Diagnosis */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-500 mb-1">Diagnosis</p>
            <p className="text-sm text-foreground leading-relaxed">{item.diagnosis}</p>
          </div>

          {/* Next action */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
            <ArrowRight className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-500 mb-0.5">Next Action</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{item.nextAction}</p>
            </div>
          </div>

          {/* Status transition buttons */}
          {!isComplete && nextStatuses.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {nextStatuses.map(next => (
                <Button
                  key={next}
                  size="sm"
                  variant={next === 'complete' ? 'default' : next === 'blocked' ? 'outline' : 'outline'}
                  className={`h-7 text-xs px-3 ${
                    next === 'complete' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                    next === 'blocked' ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400' : ''
                  }`}
                  onClick={() => onStatusChange(item.id, next)}
                  disabled={isUpdating}
                  data-testid={`status-transition-${item.id}-${next}`}
                >
                  {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : STATUS_TRANSITION_LABELS[next] ?? next}
                </Button>
              ))}
            </div>
          )}

          {/* Meta */}
          <p className="text-[10px] text-muted-foreground">
            Created {format(new Date(item.createdAt), 'dd/MM/yyyy HH:mm')}
            {item.resolvedAt && ` · Resolved ${format(new Date(item.resolvedAt), 'dd/MM/yyyy HH:mm')}`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BullpenWorkQueue() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery<{ items: WorkItem[] }>({
    queryKey: ['/api/bullpen/work-items', orgId],
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/bullpen/work-items?orgId=${orgId}`);
      return r.json();
    },
    enabled: !!orgId,
    refetchInterval: 60000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/bullpen/trigger-scan', { orgId });
      return r.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['/api/bullpen/work-items', orgId] });
      toast({
        title: result.created > 0 ? `${result.created} new work item${result.created > 1 ? 's' : ''} detected` : 'Queue scan complete',
        description: result.created > 0
          ? `${result.skipped} item${result.skipped !== 1 ? 's' : ''} already in queue.`
          : 'No new signals detected. Queue is up to date.',
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Scan failed', description: e.message, variant: 'destructive' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: WorkStatus }) => {
      const r = await apiRequest('PATCH', `/api/bullpen/work-items/${itemId}`, { orgId, status });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/bullpen/work-items', orgId] });
      setUpdatingId(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
      setUpdatingId(null);
    },
  });

  const handleStatusChange = useCallback((itemId: string, status: WorkStatus) => {
    setUpdatingId(itemId);
    statusMutation.mutate({ itemId, status });
  }, [statusMutation]);

  const items: WorkItem[] = data?.items ?? [];

  const filtered = items.filter(item => {
    if (activeFilter === 'all')             return item.status !== 'complete';
    if (activeFilter === 'high')            return item.priority === 'high' && item.status !== 'complete';
    if (activeFilter === 'blocked')         return item.status === 'blocked';
    if (activeFilter === 'awaiting_review') return item.status === 'awaiting_review';
    if (activeFilter === 'complete')        return item.status === 'complete';
    return true;
  });

  const openCount    = items.filter(i => i.status !== 'complete').length;
  const highCount    = items.filter(i => i.priority === 'high' && i.status !== 'complete').length;
  const blockedCount = items.filter(i => i.status === 'blocked').length;
  const reviewCount  = items.filter(i => i.status === 'awaiting_review').length;

  const FILTER_TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',             label: 'Open',           count: openCount },
    { id: 'high',            label: 'High Priority',  count: highCount },
    { id: 'blocked',         label: 'Blocked',        count: blockedCount },
    { id: 'awaiting_review', label: 'Needs Review',   count: reviewCount },
    { id: 'complete',        label: 'Complete' },
  ];

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-violet-500" />
          Work Queue
          {openCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[10px] font-bold">
              {openCount}
            </span>
          )}
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || isFetching}
          data-testid="button-trigger-scan"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {scanMutation.isPending ? 'Scanning…' : 'Scan for Work'}
        </Button>
      </div>

      <Card className="border bg-card">
        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 px-4 pt-3 pb-0 border-b border-border/50 overflow-x-auto">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors shrink-0 ${
                activeFilter === tab.id
                  ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              data-testid={`filter-tab-${tab.id}`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1 py-0.5 rounded-full text-[10px] font-bold min-w-[16px] text-center ${
                  activeFilter === tab.id
                    ? 'bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading work queue…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium text-foreground">
                {activeFilter === 'all' ? 'No open work items' :
                 activeFilter === 'complete' ? 'No completed items yet' :
                 `No ${activeFilter.replace('_', ' ')} items`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeFilter === 'all'
                  ? 'Click "Scan for Work" to detect signals from your Momentum state.'
                  : 'Switch to All Open to see active items.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  onStatusChange={handleStatusChange}
                  isUpdating={updatingId === item.id}
                />
              ))}

              {activeFilter !== 'complete' && (
                <div className="pt-1">
                  <Separator className="mb-2" />
                  <p className="text-[11px] text-muted-foreground text-center">
                    {filtered.length} open item{filtered.length !== 1 ? 's' : ''} ·{' '}
                    <button
                      onClick={() => setActiveFilter('complete')}
                      className="underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      view completed
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
