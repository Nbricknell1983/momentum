import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, RefreshCw, Zap, ShieldAlert, Users, TrendingUp,
  CheckCircle2, AlertTriangle, Loader2, Clock, Play, Settings2,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DailySummary {
  date: string;
  runAt: string;
  runBy: string;
  scheduled: boolean;
  headline: string;
  noMaterialChange: boolean;
  topRisks: string[];
  topActions: string[];
  operationsSummary: string;
  clientSummary: string;
  pipelineSummary: string;
  scanItemsCreated: number;
  scanItemsSkipped: number;
  totalItemsCreated: number;
  reviewSummaries: {
    operations:    { summary: string; itemsCreated: number };
    client_health: { summary: string; itemsCreated: number };
    pipeline:      { summary: string; itemsCreated: number };
  };
}

interface ReviewSchedule {
  enabled: boolean;
  dailyRunHour: number;
  clientMode: 'all' | 'priority' | 'flagged';
  lastRunAt: string | null;
  lastRunSummaryDate: string | null;
}

// ── Hour options (AEST-friendly) ──────────────────────────────────────────────

const HOUR_OPTIONS = [
  { value: 6,  label: '6:00 AM' },
  { value: 7,  label: '7:00 AM' },
  { value: 8,  label: '8:00 AM' },
  { value: 9,  label: '9:00 AM' },
  { value: 10, label: '10:00 AM' },
  { value: 14, label: '2:00 PM' },
  { value: 17, label: '5:00 PM' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm');
  } catch {
    return iso;
  }
}

function fmtDate(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return isoDate;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BullpenDailyBrief() {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: summary, isLoading: summaryLoading } = useQuery<DailySummary | null>({
    queryKey: ['/api/bullpen/daily-summary', orgId],
    queryFn: async () => {
      const r = await fetch(`/api/bullpen/daily-summary?orgId=${orgId}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: schedule, isLoading: scheduleLoading } = useQuery<ReviewSchedule>({
    queryKey: ['/api/bullpen/review-schedule', orgId],
    queryFn: async () => {
      const r = await fetch(`/api/bullpen/review-schedule?orgId=${orgId}`);
      if (!r.ok) throw new Error('Failed to load schedule');
      return r.json();
    },
    enabled: !!orgId,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const runBrief = useMutation({
    mutationFn: (force: boolean) =>
      apiRequest('POST', '/api/bullpen/daily-run', { orgId, force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/bullpen/daily-summary', orgId] });
      qc.invalidateQueries({ queryKey: ['/api/bullpen/review-schedule', orgId] });
      qc.invalidateQueries({ queryKey: ['/api/bullpen/work-items', orgId] });
    },
  });

  const patchSchedule = useMutation({
    mutationFn: (updates: Partial<ReviewSchedule>) =>
      apiRequest('PATCH', '/api/bullpen/review-schedule', { orgId, ...updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/bullpen/review-schedule', orgId] });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleToggleEnabled() {
    if (!schedule) return;
    patchSchedule.mutate({ enabled: !schedule.enabled });
  }

  function handleSaveSchedule() {
    const updates: Partial<ReviewSchedule> = {};
    if (pendingHour !== null) updates.dailyRunHour = pendingHour;
    if (pendingMode !== null) updates.clientMode = pendingMode as ReviewSchedule['clientMode'];
    if (Object.keys(updates).length) patchSchedule.mutate(updates);
    setPendingHour(null);
    setPendingMode(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const isRunning = runBrief.isPending;
  const isToday = summary
    ? (() => {
        const TZ = 10 * 3600000;
        const local = new Date(Date.now() + TZ);
        const dateKey = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
        return summary.date === dateKey;
      })()
    : false;

  return (
    <div className="space-y-4" data-testid="bullpen-daily-brief">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-foreground">Daily Brief</span>
          {isToday && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-xs px-1.5 py-0.5">
              Today
            </Badge>
          )}
          {summary && !isToday && (
            <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-xs px-1.5 py-0.5">
              {fmtDate(summary.date)}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowSchedule(s => !s)}
            data-testid="toggle-schedule-panel"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => runBrief.mutate(!isToday)}
            disabled={isRunning}
            data-testid="run-daily-brief-btn"
          >
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {isRunning ? 'Running…' : isToday ? 'Re-run' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* ── Skipped result ── */}
      {runBrief.data && (runBrief.data as any)?.skipped && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Already ran today. Click Re-run to force a fresh run.
        </div>
      )}

      {/* ── Schedule panel ── */}
      {showSchedule && (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Automatic Daily Schedule</p>
            {scheduleLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-center gap-2">
                <Label htmlFor="sched-enabled" className="text-xs text-muted-foreground">
                  {schedule?.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="sched-enabled"
                  checked={schedule?.enabled ?? false}
                  onCheckedChange={handleToggleEnabled}
                  disabled={patchSchedule.isPending}
                  data-testid="schedule-enabled-toggle"
                />
              </div>
            )}
          </div>

          {schedule && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Run time (AEST)</Label>
                <Select
                  value={String(pendingHour ?? schedule.dailyRunHour)}
                  onValueChange={v => setPendingHour(Number(v))}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="schedule-hour-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Client scope</Label>
                <Select
                  value={pendingMode ?? schedule.clientMode ?? 'all'}
                  onValueChange={v => setPendingMode(v)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="schedule-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All active clients</SelectItem>
                    <SelectItem value="priority">Priority clients only</SelectItem>
                    <SelectItem value="flagged">Flagged clients only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(pendingHour !== null || pendingMode !== null) && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveSchedule}
              disabled={patchSchedule.isPending}
              data-testid="save-schedule-btn"
            >
              {patchSchedule.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          )}

          {schedule?.lastRunAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last run: {fmtDateTime(schedule.lastRunAt)}
              {schedule.scheduled && <span className="text-xs text-muted-foreground">(auto)</span>}
            </div>
          )}
        </div>
      )}

      {/* ── No summary yet ── */}
      {summaryLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!summaryLoading && !summary && (
        <div className="rounded-xl border border-dashed border-border/40 p-6 text-center space-y-2">
          <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No daily brief yet.</p>
          <p className="text-xs text-muted-foreground/60">
            Enable automatic scheduling or click Run Now to generate today's brief.
          </p>
        </div>
      )}

      {/* ── Summary card ── */}
      {!summaryLoading && summary && (
        <div className="space-y-3">
          {/* Headline */}
          <div
            className={`rounded-xl border p-3 ${
              summary.noMaterialChange
                ? 'bg-muted/20 border-border/30'
                : 'bg-violet-500/8 border-violet-500/25'
            }`}
          >
            <div className="flex items-start gap-2">
              {summary.noMaterialChange ? (
                <CheckCircle2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm font-medium text-foreground leading-snug">{summary.headline}</p>
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{fmtDate(summary.date)}</span>
              <span>·</span>
              <span>{summary.totalItemsCreated} work item{summary.totalItemsCreated !== 1 ? 's' : ''} created</span>
              {summary.scheduled && (
                <>
                  <span>·</span>
                  <span className="text-violet-400">auto</span>
                </>
              )}
            </div>
          </div>

          {/* Top actions */}
          {summary.topActions && summary.topActions.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Top Actions Today</p>
              <ul className="space-y-1">
                {summary.topActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <span className="text-emerald-400 font-bold flex-shrink-0">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top risks */}
          {summary.topRisks && summary.topRisks.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/8 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Risks to Address</p>
              <ul className="space-y-1">
                {summary.topRisks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <ShieldAlert className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Three-section grid — stacked on narrow rail, side-by-side on wider */}
          <div className="grid grid-cols-1 gap-2">
            <SectionCard
              icon={<Settings2 className="h-3.5 w-3.5 text-slate-400" />}
              label="Operations"
              summary={summary.operationsSummary}
              itemsCreated={summary.reviewSummaries?.operations?.itemsCreated ?? 0}
            />
            <SectionCard
              icon={<Users className="h-3.5 w-3.5 text-sky-400" />}
              label="Clients"
              summary={summary.clientSummary}
              itemsCreated={summary.reviewSummaries?.client_health?.itemsCreated ?? 0}
            />
            <SectionCard
              icon={<TrendingUp className="h-3.5 w-3.5 text-violet-400" />}
              label="Pipeline"
              summary={summary.pipelineSummary}
              itemsCreated={summary.reviewSummaries?.pipeline?.itemsCreated ?? 0}
            />
          </div>

          {/* Scan stats footer */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground px-1 min-w-0">
            <span className="shrink-0">Scan: {summary.scanItemsCreated} new, {summary.scanItemsSkipped} deduped</span>
            <span className="shrink-0 truncate">Run at {fmtDateTime(summary.runAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  label,
  summary,
  itemsCreated,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  itemsCreated: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LEN = 120;
  const truncated = summary && summary.length > PREVIEW_LEN && !expanded;

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-2.5 space-y-1.5 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="shrink-0">{icon}</span>
          <span className="text-xs font-medium text-foreground/80 truncate">{label}</span>
        </div>
        {itemsCreated > 0 && (
          <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px] px-1 py-0 shrink-0">
            +{itemsCreated}
          </Badge>
        )}
      </div>
      {summary ? (
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-relaxed break-words overflow-hidden">
            {truncated ? summary.slice(0, PREVIEW_LEN) + '…' : summary}
          </p>
          {summary.length > PREVIEW_LEN && (
            <button
              className="text-[10px] text-violet-400 hover:underline mt-0.5 flex items-center gap-0.5"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <><ChevronUp className="h-2.5 w-2.5" /> less</> : <><ChevronDown className="h-2.5 w-2.5" /> more</>}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/40 italic">No findings</p>
      )}
    </div>
  );
}
