import { useState, useCallback } from 'react';
import {
  Stethoscope, Globe, Search, Star, BarChart3, Zap, AlertTriangle,
  ChevronDown, ChevronUp, CheckCircle2, Clock, TrendingUp, Loader2,
  RefreshCw, Copy, Check, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { patchLead } from '@/store';
import {
  Lead, GrowthPrescription, ProductRecommendation, InvestmentOption,
  INVESTMENT_TIER_LABELS, INVESTMENT_TIER_COLORS,
} from '@/lib/types';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { generateRunId, enrichWithMeta, persistEngineHistory, isOutputStale } from '@/lib/engineOutputService';
import { EngineHistoryDrawer } from '@/components/EngineHistoryDrawer';
import { format } from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return ''; }
}

const PRODUCT_CONFIG: Record<ProductRecommendation['product'], { icon: typeof Globe; color: string }> = {
  website: { icon: Globe,     color: 'text-violet-600 dark:text-violet-400' },
  seo:     { icon: Search,    color: 'text-blue-600 dark:text-blue-400' },
  gbp:     { icon: Star,      color: 'text-emerald-600 dark:text-emerald-400' },
  ads:     { icon: BarChart3, color: 'text-orange-600 dark:text-orange-400' },
};

const URGENCY_CONFIG = {
  high:   { label: 'High Urgency',   cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  medium: { label: 'Medium Urgency', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  low:    { label: 'Low Urgency',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
};

const TIER_BG: Record<string, string> = {
  starter:     'bg-slate-50 dark:bg-slate-900',
  momentum:    'bg-blue-50 dark:bg-blue-950/30',
  accelerated: 'bg-violet-50 dark:bg-violet-950/30',
  performance: 'bg-amber-50 dark:bg-amber-950/30',
};

const TIER_BADGE: Record<string, string> = {
  starter:     'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  momentum:    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  accelerated: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  performance: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
};

// ─── Components ───────────────────────────────────────────────────────────────

function StackCard({ rec }: { rec: ProductRecommendation }) {
  const { icon: Icon, color } = PRODUCT_CONFIG[rec.product];
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-muted/20" data-testid={`stack-card-${rec.product}`}>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-background border ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground">#{rec.priority}</span>
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{rec.label}</p>
        <p className="text-xs text-muted-foreground leading-snug">{rec.reason}</p>
        <div className="flex items-center gap-3 pt-1">
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-3 w-3" /> {rec.impact}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" /> {rec.timeline}
          </span>
        </div>
      </div>
    </div>
  );
}

function InvestmentCard({ opt }: { opt: InvestmentOption }) {
  const bg = TIER_BG[opt.tier] || TIER_BG.starter;
  const badge = TIER_BADGE[opt.tier] || TIER_BADGE.starter;
  const border = INVESTMENT_TIER_COLORS[opt.tier];
  return (
    <div className={`relative rounded-xl border-2 p-4 space-y-3 ${bg} ${border} ${opt.recommended ? 'ring-2 ring-violet-500/40' : ''}`} data-testid={`investment-card-${opt.tier}`}>
      {opt.recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white">RECOMMENDED</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge}`}>{INVESTMENT_TIER_LABELS[opt.tier]}</span>
          <p className="text-xl font-bold mt-1">${opt.monthlyInvestment.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
          <p className="text-xs text-muted-foreground">${opt.weeklyEquivalent}/wk · {opt.speed}</p>
        </div>
      </div>
      <p className="text-xs text-foreground leading-snug">{opt.description}</p>
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{opt.outcomes}</p>
        </div>
        <div className="flex gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{opt.tradeoffs}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props { lead: Lead; }

export default function GrowthPrescriptionPanel({ lead }: Props) {
  const { orgId, authReady } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();

  const [expanded, setExpanded] = useState(!!lead.growthPrescription);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prescription, setPrescription] = useState<GrowthPrescription | null>(
    lead.growthPrescription ? { ...lead.growthPrescription, generatedAt: new Date(lead.growthPrescription.generatedAt) } : null
  );
  const [activeTab, setActiveTab] = useState<'stack' | 'investment'>('stack');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const si = lead.strategyIntelligence || {};
      const crawled = lead.crawledPages || [];
      const sitemap = lead.sitemapPages || [];

      const payload = {
        businessName: lead.companyName,
        industry: lead.industry || '',
        location: lead.address || lead.areaName || lead.regionName || '',
        hasWebsite: !!lead.website,
        websiteUrl: lead.website || '',
        sitemapPageCount: sitemap.length,
        crawledPageCount: crawled.length,
        hasGBP: !!(lead as any).googleMapsUrl || !!(lead.sourceData?.facts?.gbp && lead.sourceData.facts.gbp !== 'no'),
        reviewCount: lead.sourceData?.facts?.reviews ? parseInt(lead.sourceData.facts.reviews) || 0 : 0,
        rating: lead.sourceData?.facts?.rating ? parseFloat(lead.sourceData.facts.rating) || 0 : 0,
        businessOverview: si.businessOverview || '',
        idealCustomer: si.idealCustomer || '',
        coreServices: si.coreServices || '',
        targetLocations: si.targetLocations || '',
        growthObjective: si.growthObjective || '',
        discoveryNotes: si.discoveryNotes || '',
      };

      const res = await fetch('/api/ai/growth-prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to generate prescription');
      const data = await res.json();
      const runId = generateRunId();
      const result: GrowthPrescription = enrichWithMeta(data, 'growthPrescription', runId) as GrowthPrescription;
      setPrescription(result);
      setExpanded(true);

      if (orgId && authReady) {
        updateLeadInFirestore(orgId, lead.id, { growthPrescription: result } as any, authReady).catch(console.error);
        dispatch(patchLead({ id: lead.id, updates: { growthPrescription: result } as any }));
        await persistEngineHistory(orgId, 'leads', lead.id, runId, { ...result, leadId: lead.id, orgId });
      }
      toast({ title: 'Growth prescription generated' });
    } catch (err) {
      toast({ title: 'Failed to generate prescription', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const copyDiagnosis = useCallback(async () => {
    if (!prescription) return;
    const text = [
      `GROWTH PRESCRIPTION — ${lead.companyName}`,
      ``,
      `DIAGNOSIS: ${prescription.businessDiagnosis}`,
      ``,
      `PRIMARY OBJECTIVE: ${prescription.primaryObjective}`,
      ``,
      `RECOMMENDED STACK:`,
      ...prescription.recommendedStack.map(r => `#${r.priority} ${r.label} — ${r.reason}`),
      ``,
      `COST OF INACTION: ${prescription.costOfInaction}`,
      ``,
      `Generated: ${fmtDate(prescription.generatedAt)}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [prescription, lead.companyName]);

  const urgency = prescription ? URGENCY_CONFIG[prescription.urgencyLevel] : null;

  return (
    <div className="rounded-lg border overflow-hidden bg-background" data-testid="growth-prescription-panel">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
        data-testid="button-prescription-toggle"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 text-white">
            <Stethoscope className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Growth Prescription</p>
            <p className="text-xs text-muted-foreground">
              {prescription
                ? `${prescription.recommendedStack.length} channel stack · ${fmtDate(prescription.generatedAt)}`
                : 'Diagnose the opportunity and prescribe a growth stack'}
            </p>
          </div>
          {prescription && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isOutputStale(prescription.generatedAt, 'growthPrescription') ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'}`}>
              {isOutputStale(prescription.generatedAt, 'growthPrescription') ? 'Stale' : 'Fresh'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {prescription && (
            <button
              onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-history-growth-prescription"
            >
              <History className="h-3 w-3" />
              Runs
            </button>
          )}
          {urgency && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${urgency.cls}`}>
              {urgency.label}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t">
          {/* Generate button */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
            <Button
              size="sm"
              onClick={generate}
              disabled={generating}
              className="gap-1.5 h-8 text-xs"
              data-testid="button-generate-prescription"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : prescription ? <RefreshCw className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              {generating ? 'Generating…' : prescription ? 'Regenerate' : 'Generate Prescription'}
            </Button>
            {prescription && (
              <button
                onClick={copyDiagnosis}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-copy-prescription"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          {prescription && (
            <div className="px-4 pb-4 space-y-4">
              {/* Diagnosis */}
              <div className="rounded-lg bg-muted/30 border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" /> Diagnosis
                </p>
                <p className="text-sm text-foreground leading-relaxed">{prescription.businessDiagnosis}</p>
                {prescription.primaryObjective && (
                  <div className="flex items-start gap-1.5 pt-1 border-t">
                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-foreground">{prescription.primaryObjective}</p>
                  </div>
                )}
              </div>

              {/* Tab selector */}
              <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
                {(['stack', 'investment'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    data-testid={`tab-${tab}`}
                  >
                    {tab === 'stack' ? `Recommended Stack (${prescription.recommendedStack.length})` : 'Investment Options'}
                  </button>
                ))}
              </div>

              {/* Stack tab */}
              {activeTab === 'stack' && (
                <div className="space-y-2">
                  {[...prescription.recommendedStack]
                    .sort((a, b) => a.priority - b.priority)
                    .map(rec => <StackCard key={rec.product} rec={rec} />)}
                </div>
              )}

              {/* Investment tab */}
              {activeTab === 'investment' && (
                <div className="space-y-4">
                  {[...prescription.investmentOptions]
                    .sort((a, b) => a.monthlyInvestment - b.monthlyInvestment)
                    .map(opt => <InvestmentCard key={opt.tier} opt={opt} />)}
                </div>
              )}

              {/* Cost of inaction */}
              {prescription.costOfInaction && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-0.5">Cost of Inaction</p>
                    <p className="text-xs text-red-600 dark:text-red-300 leading-snug">{prescription.costOfInaction}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <EngineHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orgId={orgId || ''}
        entityCollection="leads"
        entityId={lead.id}
        engineType="growthPrescription"
      />
    </div>
  );
}
