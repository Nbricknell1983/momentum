import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  RefreshCw, Zap, AlertTriangle, CheckCircle2, Clock, Ban,
  ChevronDown, ChevronUp, Building2, TrendingUp, Settings,
  ArrowRight, CircleDot, Loader2, BellOff, X, MessageSquarePlus,
  ExternalLink, ChevronRight, Wrench, ShieldAlert,
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
  suppressedUntil?: string | null;
  dismissedAt?: string | null;
  dismissedBy?: string | null;
  dismissReason?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Signals that are maintenance hygiene (lower default visual weight)
const MAINTENANCE_SIGNALS = new Set([
  'seo_engine_stale', 'website_engine_stale', 'gbp_engine_stale', 'ads_engine_stale',
]);

// Signals that indicate a genuine setup gap (high urgency, operational risk)
const SETUP_GAP_SIGNALS = new Set([
  'seo_engine_missing', 'website_engine_missing', 'gbp_engine_missing', 'ads_engine_missing',
]);

function isMaintenanceItem(item: WorkItem): boolean {
  return MAINTENANCE_SIGNALS.has(item.sourceSignal);
}

function isSnoozed(item: WorkItem): boolean {
  return !!(item.suppressedUntil && new Date(item.suppressedUntil).getTime() > Date.now());
}

function isDismissed(item: WorkItem): boolean {
  return !!item.dismissedAt;
}

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

type FilterTab = 'open' | 'high' | 'blocked' | 'snoozed' | 'dismissed' | 'complete';

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
  onSnooze,
  onDismiss,
  onCreateThread,
  isUpdating,
}: {
  item: WorkItem;
  onStatusChange: (itemId: string, status: WorkStatus) => void;
  onSnooze: (itemId: string, duration: '3d' | '7d' | '14d') => void;
  onDismiss: (itemId: string) => void;
  onCreateThread: (item: WorkItem) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = TYPE_ICON[item.type] ?? Settings;
  const statusCfg = STATUS_CONFIG[item.status];
  const priorityCfg = PRIORITY_CONFIG[item.priority];
  const StatusIcon = statusCfg.icon;
  const nextStatuses = NEXT_STATUSES[item.status] ?? [];
  const isComplete = item.status === 'complete';
  const snoozed = isSnoozed(item);
  const dismissed = isDismissed(item);

  function scrollToCommandCenter() {
    document.getElementById('bullpen-command-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div
      className={`rounded-lg border transition-colors ${
        dismissed
          ? 'border-border/30 bg-muted/20 opacity-60'
          : snoozed
            ? 'border-border/40 bg-muted/30'
            : isComplete
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
          <p className={`text-sm font-medium leading-tight ${isComplete || dismissed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
              {priorityCfg.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCfg.color}`}>
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </span>
            {snoozed && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <BellOff className="h-3 w-3" />
                Snoozed until {format(new Date(item.suppressedUntil!), 'dd/MM/yyyy')}
              </span>
            )}
            {dismissed && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <X className="h-3 w-3" />
                Dismissed
              </span>
            )}
            {item.clientName && (
              <span className="text-[10px] text-muted-foreground">{item.clientName}</span>
            )}
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

          {/* Status transitions + thread + snooze/dismiss row */}
          {!isComplete && !dismissed && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Status transition buttons */}
              {nextStatuses.map(next => (
                <Button
                  key={next}
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs px-3 ${
                    next === 'complete' ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' :
                    next === 'blocked'  ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400' : ''
                  }`}
                  onClick={() => onStatusChange(item.id, next)}
                  disabled={isUpdating}
                  data-testid={`status-transition-${item.id}-${next}`}
                >
                  {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : STATUS_TRANSITION_LABELS[next] ?? next}
                </Button>
              ))}

              <div className="flex-1" />

              {/* Thread button */}
              {item.threadId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400"
                  onClick={scrollToCommandCenter}
                  data-testid={`button-open-thread-${item.id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Thread
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400"
                  onClick={() => onCreateThread(item)}
                  disabled={isUpdating}
                  data-testid={`button-create-thread-${item.id}`}
                >
                  <MessageSquarePlus className="h-3 w-3" />
                  Create Thread
                </Button>
              )}

              {/* Snooze dropdown */}
              {!snoozed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                      data-testid={`button-snooze-${item.id}`}
                    >
                      <BellOff className="h-3 w-3" />
                      Snooze
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem onClick={() => onSnooze(item.id, '3d')}>3 days</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSnooze(item.id, '7d')}>7 days</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSnooze(item.id, '14d')}>14 days</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Dismiss button */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={() => onDismiss(item.id)}
                disabled={isUpdating}
                data-testid={`button-dismiss-${item.id}`}
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            </div>
          )}

          {/* Snoozed note */}
          {snoozed && !isComplete && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Snoozed until {format(new Date(item.suppressedUntil!), 'dd/MM/yyyy')}. Item will reappear when the snooze expires.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={() => onStatusChange(item.id, item.status)}
                data-testid={`button-unsnooze-${item.id}`}
              >
                Wake up
              </Button>
            </div>
          )}

          {/* Dismiss reason */}
          {dismissed && item.dismissReason && (
            <p className="text-xs text-muted-foreground italic">Dismissed: {item.dismissReason}</p>
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

// ── Group section ──────────────────────────────────────────────────────────────

function ItemGroup({
  label,
  icon: Icon,
  items,
  defaultCollapsed = false,
  onStatusChange,
  onSnooze,
  onDismiss,
  onCreateThread,
  updatingId,
}: {
  label: string;
  icon: typeof ShieldAlert;
  items: WorkItem[];
  defaultCollapsed?: boolean;
  onStatusChange: (id: string, s: WorkStatus) => void;
  onSnooze: (id: string, d: '3d' | '7d' | '14d') => void;
  onDismiss: (id: string) => void;
  onCreateThread: (item: WorkItem) => void;
  updatingId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (items.length === 0) return null;
  return (
    <div>
      <button
        className="flex items-center gap-2 w-full py-1.5 text-left"
        onClick={() => setCollapsed(c => !c)}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold ml-0.5">{items.length}</span>
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {!collapsed && (
        <div className="space-y-2 mt-1">
          {items.map(item => (
            <WorkItemCard
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
              onCreateThread={onCreateThread}
              isUpdating={updatingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sort helper — priority weight × recency ────────────────────────────────────

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const STATUS_BOOST: Partial<Record<WorkStatus, number>> = { blocked: 1, awaiting_review: 0.5 };

function sortItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const aScore = PRIORITY_WEIGHT[a.priority] + (STATUS_BOOST[a.status] ?? 0);
    const bScore = PRIORITY_WEIGHT[b.priority] + (STATUS_BOOST[b.status] ?? 0);
    if (bScore !== aScore) return bScore - aScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BullpenWorkQueue() {
  const { orgId, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('open');
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

  const patchMutation = useMutation({
    mutationFn: async (payload: Record<string, any> & { itemId: string }) => {
      const { itemId, ...body } = payload;
      const r = await apiRequest('PATCH', `/api/bullpen/work-items/${itemId}`, { orgId, ...body });
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
    patchMutation.mutate({ itemId, status });
  }, [patchMutation]);

  const handleSnooze = useCallback((itemId: string, duration: '3d' | '7d' | '14d') => {
    setUpdatingId(itemId);
    patchMutation.mutate({ itemId, snooze: duration });
    toast({ title: `Snoozed for ${duration === '3d' ? '3' : duration === '7d' ? '7' : '14'} days`, description: 'Item will reappear when the snooze expires.' });
  }, [patchMutation, toast]);

  const handleDismiss = useCallback((itemId: string) => {
    setUpdatingId(itemId);
    patchMutation.mutate({ itemId, dismiss: true });
    toast({ title: 'Item dismissed', description: 'It will not reappear unless the condition materially changes.' });
  }, [patchMutation, toast]);

  const handleCreateThread = useCallback(async (item: WorkItem) => {
    if (!orgId || !user || !db) return;
    try {
      const now = Timestamp.now();
      const threadRef = await addDoc(collection(db, 'orgs', orgId, 'bullpenThreads'), {
        title: item.title,
        category: item.type === 'pipeline' ? 'process' : item.type === 'system' || item.type === 'integration' ? 'integration' : 'client',
        route: '',
        priority: item.priority === 'high' ? 'urgent' : item.priority === 'medium' ? 'normal' : 'low',
        status: 'open',
        owner: item.owner,
        supporting: item.supporting ?? [],
        createdAt: now,
        updatedAt: now,
        lastMessage: item.diagnosis,
        messageCount: 1,
        createdBy: user.uid,
        sourceWorkItemId: item.id,
      });
      // Initial message with full context
      await addDoc(collection(db, 'orgs', orgId, 'bullpenThreads', threadRef.id, 'messages'), {
        role: 'user',
        text: `**Work Queue Item: ${item.title}**\n\n**Diagnosis:** ${item.diagnosis}\n\n**Recommended Next Action:** ${item.nextAction}${item.clientName ? `\n\n**Client:** ${item.clientName}` : ''}`,
        createdAt: now,
        authorId: user.uid,
      });
      // Link the thread ID back to the work item
      await patchMutation.mutateAsync({ itemId: item.id, threadId: threadRef.id });
      toast({ title: 'Thread created', description: 'The work item context has been pre-loaded. Scroll up to Command Center.' });
      document.getElementById('bullpen-command-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e: any) {
      toast({ title: 'Failed to create thread', description: e.message, variant: 'destructive' });
    }
  }, [orgId, user, patchMutation, toast]);

  const items: WorkItem[] = data?.items ?? [];

  // ── Filtering ──────────────────────────────────────────────────────────────

  const openItems = items.filter(i =>
    i.status !== 'complete' && !isDismissed(i) && !isSnoozed(i)
  );
  const snoozedItems = items.filter(i => isSnoozed(i) && !isDismissed(i));
  const dismissedItems = items.filter(i => isDismissed(i));
  const completeItems = items.filter(i => i.status === 'complete');
  const highItems = openItems.filter(i => i.priority === 'high');
  const blockedItems = openItems.filter(i => i.status === 'blocked');

  const filtered: WorkItem[] = (() => {
    switch (activeFilter) {
      case 'open':      return sortItems(openItems);
      case 'high':      return sortItems(highItems);
      case 'blocked':   return sortItems(blockedItems);
      case 'snoozed':   return sortItems(snoozedItems);
      case 'dismissed': return [...dismissedItems].sort((a, b) => new Date(b.dismissedAt!).getTime() - new Date(a.dismissedAt!).getTime());
      case 'complete':  return [...completeItems].sort((a, b) => new Date(b.resolvedAt ?? b.updatedAt).getTime() - new Date(a.resolvedAt ?? a.updatedAt).getTime());
    }
  })();

  // For the open tab, split into Operational Risk vs Maintenance groups
  const openOperational = filtered.filter(i => !isMaintenanceItem(i));
  const openMaintenance  = filtered.filter(i => isMaintenanceItem(i));
  const useGrouping = activeFilter === 'open' && (openOperational.length > 0 || openMaintenance.length > 0);

  const FILTER_TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'open',      label: 'Open',         count: openItems.length },
    { id: 'high',      label: 'High Priority', count: highItems.length },
    { id: 'blocked',   label: 'Blocked',       count: blockedItems.length },
    { id: 'snoozed',   label: 'Snoozed',       count: snoozedItems.length },
    { id: 'dismissed', label: 'Dismissed' },
    { id: 'complete',  label: 'Complete' },
  ];

  const emptyMessage = {
    open:      { title: 'No open work items', sub: 'Click "Scan for Work" to detect signals from your Momentum state.' },
    high:      { title: 'No high-priority items', sub: 'Switch to All Open to see all active items.' },
    blocked:   { title: 'No blocked items', sub: 'Items move here when marked as blocked.' },
    snoozed:   { title: 'No snoozed items', sub: 'Snooze low-value items to keep the queue sharp.' },
    dismissed: { title: 'No dismissed items', sub: 'Dismissed items appear here.' },
    complete:  { title: 'No completed items yet', sub: 'Resolved work items will appear here.' },
  }[activeFilter];

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-violet-500" />
          Work Queue
          {openItems.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[10px] font-bold">
              {openItems.length}
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
              <p className="text-sm font-medium text-foreground">{emptyMessage.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{emptyMessage.sub}</p>
            </div>
          ) : useGrouping ? (
            <div className="space-y-4">
              <ItemGroup
                label="Operational Risk"
                icon={ShieldAlert}
                items={openOperational}
                onStatusChange={handleStatusChange}
                onSnooze={handleSnooze}
                onDismiss={handleDismiss}
                onCreateThread={handleCreateThread}
                updatingId={updatingId}
              />
              <ItemGroup
                label="Maintenance"
                icon={Wrench}
                items={openMaintenance}
                defaultCollapsed={openOperational.length > 0}
                onStatusChange={handleStatusChange}
                onSnooze={handleSnooze}
                onDismiss={handleDismiss}
                onCreateThread={handleCreateThread}
                updatingId={updatingId}
              />
              <div className="pt-1">
                <Separator className="mb-2" />
                <p className="text-[11px] text-muted-foreground text-center">
                  {openItems.length} open item{openItems.length !== 1 ? 's' : ''} ·{' '}
                  <button
                    onClick={() => setActiveFilter('complete')}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    view completed
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  onStatusChange={handleStatusChange}
                  onSnooze={handleSnooze}
                  onDismiss={handleDismiss}
                  onCreateThread={handleCreateThread}
                  isUpdating={updatingId === item.id}
                />
              ))}
              {activeFilter !== 'complete' && activeFilter !== 'dismissed' && (
                <div className="pt-1">
                  <Separator className="mb-2" />
                  <p className="text-[11px] text-muted-foreground text-center">
                    {filtered.length} item{filtered.length !== 1 ? 's' : ''} ·{' '}
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
