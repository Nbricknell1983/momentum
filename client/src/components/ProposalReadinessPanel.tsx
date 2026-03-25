import { useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Target, ArrowRight, Shield, Rocket, Zap, Globe,
  MapPin, Search, BarChart3, FileText, Brain, Link2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lead } from '@/lib/types';
import { deriveProposalReadiness, deriveHandoffReadiness, type ReadinessCheckItem } from '@/lib/salesIntelligenceTypes';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  complete:     { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20', label: 'Complete' },
  partial:      { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', label: 'Partial' },
  missing:      { icon: XCircle, color: 'text-red-400', bg: 'bg-red-50 dark:bg-red-950/20', label: 'Missing' },
  not_required: { icon: CheckCircle2, color: 'text-slate-400', bg: '', label: 'N/A' },
};

const WEIGHT_DOTS = (w: number) => Array.from({ length: 5 }, (_, i) => (
  <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full ${i < w ? 'bg-violet-500' : 'bg-muted'}`} />
));

const MODULE_ICON: Record<string, typeof Globe> = {
  website: Globe,
  seo:     Search,
  gbp:     MapPin,
  ads:     BarChart3,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreGauge({ score, label, ready }: { score: number; label: string; ready: boolean }) {
  const color = ready ? 'text-emerald-600 dark:text-emerald-400' : score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const barColor = ready ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {ready
          ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready</span></>
          : <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /><span className="text-muted-foreground">Not ready</span></>}
      </div>
    </div>
  );
}

function ChecklistItem({ item }: { item: ReadinessCheckItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;
  if (item.status === 'not_required') return null;

  return (
    <div className={`rounded-lg border overflow-hidden ${item.blocker && item.status !== 'complete' ? 'border-red-200 dark:border-red-800' : 'border-border'}`}>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${item.status === 'complete' ? 'text-foreground' : item.status === 'missing' ? 'text-muted-foreground' : 'text-foreground'}`}>
              {item.label}
            </span>
            {item.blocker && item.status !== 'complete' && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-1.5 py-0.5 rounded">BLOCKER</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex gap-0.5">{WEIGHT_DOTS(item.weight)}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t space-y-2">
          <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
          {item.status !== 'complete' && item.action && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2.5 flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{item.action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PanelTab = 'proposal' | 'handoff' | 'integration';

interface ProposalReadinessPanelProps {
  lead: Lead;
}

export default function ProposalReadinessPanel({ lead }: ProposalReadinessPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('proposal');
  const { orgId } = useAuth();

  const proposal = useMemo(() => deriveProposalReadiness(lead), [lead]);
  const handoff = useMemo(() => deriveHandoffReadiness(lead), [lead]);

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'proposal', label: 'Proposal Readiness' },
    { id: 'handoff', label: 'Handoff Readiness' },
    { id: 'integration', label: 'Provisioning' },
  ];

  return (
    <div className="space-y-4" data-testid="proposal-readiness-panel">

      {/* ── Score cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreGauge score={proposal.score} label="Proposal Ready" ready={proposal.ready} />
        <ScoreGauge score={handoff.score} label="Handoff Ready" ready={handoff.ready} />
      </div>

      {/* ── Blockers banner ──────────────────────────────────────────────── */}
      {(proposal.blockers.length > 0 || handoff.blockers.length > 0) && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">
              {proposal.blockers.length + handoff.blockers.filter(b => !proposal.blockers.find(pb => pb.id === b.id.replace('p_', ''))).length} Blockers to Resolve
            </span>
          </div>
          <div className="space-y-1.5">
            {[...new Map([...proposal.blockers, ...handoff.blockers].map(b => [b.id, b])).values()].map(b => (
              <div key={b.id} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1" />
                <span>{b.label}{b.action ? ` — ${b.action}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`readiness-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Proposal tab ─────────────────────────────────────────────────── */}
      {activeTab === 'proposal' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{proposal.recommendation}</p>
          <div className="space-y-2">
            {proposal.items.map(item => <ChecklistItem key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {/* ── Handoff tab ──────────────────────────────────────────────────── */}
      {activeTab === 'handoff' && (
        <div className="space-y-4">

          {/* Handoff status strip */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Strategy complete', value: handoff.strategyComplete },
              { label: 'Data complete', value: handoff.dataComplete },
              { label: 'Notes written', value: handoff.notesComplete },
              { label: 'Scope selected', value: handoff.scopeSelected },
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-md p-2.5 flex items-center gap-2 border ${value ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-muted/50 border-border'}`}>
                {value
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className={value ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-muted-foreground'}>{label}</span>
              </div>
            ))}
          </div>

          {/* Suggested modules */}
          {handoff.suggestedModules.length > 0 && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-sm font-medium">Recommended Modules</span>
              </div>
              <div className="space-y-2">
                {handoff.suggestedModules.map((m, i) => {
                  const Icon = MODULE_ICON[m.module] || Globe;
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <Icon className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium capitalize">{m.module.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{m.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-2.5">
                <p className="text-[10px] text-violet-700 dark:text-violet-400 font-medium uppercase tracking-wide mb-0.5">Suggested Archetype</p>
                <p className="text-sm font-semibold capitalize text-foreground">{handoff.suggestedArchetype.replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="space-y-2">
            {handoff.items
              .filter(i => !i.id.startsWith('p_'))
              .map(item => <ChecklistItem key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {/* ── Integration / Provisioning tab ───────────────────────────────── */}
      {activeTab === 'integration' && (
        <div className="space-y-4">

          {/* Stage gate */}
          {lead.stage !== 'won' && lead.stage !== 'verbal_commit' && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Lead not yet won</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Provisioning into AI Systems happens after the lead is converted to a client. Close this deal first, then convert via the Pipeline.
              </p>
            </div>
          )}

          {/* Provisioning summary */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-semibold">AI Systems Provisioning</span>
            </div>
            <p className="text-xs text-muted-foreground">
              When this lead is converted to a client, you can provision them into AI Systems — creating their tenant, configuring modules (website, SEO, GBP, ads), and triggering their delivery workflow.
            </p>
            <div className="space-y-2">
              {[
                { label: 'Tenant creation', detail: 'Secure isolated workspace created in AI Systems' },
                { label: 'Module configuration', detail: `Modules: ${handoff.suggestedModules.map(m => m.module).join(', ') || 'to be selected'}` },
                { label: 'Workflow initiation', detail: 'Delivery workflows, publishing engine, and telemetry started' },
                { label: 'Portal access', detail: 'Client portal URL generated for onboarding' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center text-[10px] font-bold text-violet-700 dark:text-violet-400 shrink-0">{i + 1}</div>
                  <div>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What to do next */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold">What to do next</span>
            </div>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-none">
              {[
                'Close the deal and move to Won in the pipeline',
                'Convert the lead to a client using the Convert button',
                'Open the client record and navigate to the Provisioning panel',
                'Verify readiness score and create the AI Systems tenant',
                'Monitor onboarding progress from the client view',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-bold text-foreground">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
