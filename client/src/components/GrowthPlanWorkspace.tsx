import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { patchLead } from '@/store';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Lead } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp, Save, Copy, FileDown, ArrowLeft, AlertTriangle,
  CheckCircle2, Zap, Target, BarChart3, DollarSign, ChevronDown,
  ChevronUp, Check, Info, AlertCircle
} from 'lucide-react';
import { GrowthPlanInputs, EMPTY_INPUTS, PaidSearchGrowthPlan } from '@/lib/growth-plan/types';
import { runCalculations, getMissingFields } from '@/lib/growth-plan/calculations';
import { generateInsights } from '@/lib/growth-plan/commentary';
import { generateRecommendations } from '@/lib/growth-plan/recommendations';
import { generateRoadmap } from '@/lib/growth-plan/roadmap';
import { generateExportSections, generatePlainSummary } from '@/lib/growth-plan/summary';
import { getBenchmarkForIndustry, INDUSTRY_LABELS } from '@/lib/growth-plan/benchmarks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(v: number | null | undefined, dp = 0): string {
  if (v == null) return '—';
  return `$${v.toLocaleString('en-AU', { maximumFractionDigits: dp })}`;
}
function fmtN(v: number | null | undefined, dp = 1): string {
  if (v == null) return '—';
  return v.toLocaleString('en-AU', { maximumFractionDigits: dp });
}
function fmtROI(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}x`;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function NumInput({
  label, value, onChange, placeholder, prefix, suffix, helper, testId
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  helper?: string;
  testId?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-2.5 text-xs text-muted-foreground pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          value={value ?? ''}
          onChange={e => {
            const v = e.target.value;
            onChange(v === '' ? null : parseFloat(v));
          }}
          placeholder={placeholder ?? ''}
          className={`h-8 text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''}`}
          data-testid={testId}
        />
        {suffix && (
          <span className="absolute right-2.5 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
        )}
      </div>
      {helper && <p className="text-xs text-muted-foreground/70">{helper}</p>}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10' : 'bg-muted/30'}`}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-lg font-bold tracking-tight ${accent ? 'text-orange-600 dark:text-orange-400' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className }: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-background p-4 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ScenarioRow({ label, leads, cpa, customers, revenue, roi, highlight }: {
  label: string;
  leads: number | null;
  cpa: number | null;
  customers: number | null;
  revenue: number | null;
  roi: number | null;
  highlight?: 'green' | 'amber' | 'red';
}) {
  const rowClass =
    highlight === 'green' ? 'bg-green-50/50 dark:bg-green-900/10' :
    highlight === 'amber' ? 'bg-amber-50/50 dark:bg-amber-900/10' : '';
  return (
    <tr className={`text-sm border-b last:border-0 ${rowClass}`}>
      <td className="py-2 px-3 font-medium text-muted-foreground w-10">{label}</td>
      <td className="py-2 px-3 text-right font-mono">{fmtN(leads)}</td>
      <td className="py-2 px-3 text-right font-mono">{fmt$(cpa)}</td>
      <td className="py-2 px-3 text-right font-mono">{fmtN(customers)}</td>
      <td className="py-2 px-3 text-right font-mono">{fmt$(revenue)}</td>
      <td className="py-2 px-3 text-right font-mono">{fmtROI(roi)}</td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GrowthPlanWorkspaceProps {
  lead: Lead;
  onBack?: () => void;
}

export default function GrowthPlanWorkspace({ lead, onBack }: GrowthPlanWorkspaceProps) {
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise inputs from saved plan or prefill from live deal data
  const [inputs, setInputs] = useState<GrowthPlanInputs>(() => {
    const saved = (lead as any).paidSearchGrowthPlan?.inputs;
    if (saved) return { ...EMPTY_INPUTS, ...saved };

    const googleAds = lead.marketingActivity?.find(a => a.channel === 'Google Ads');
    const benchmark = getBenchmarkForIndustry(lead.industry ?? null);

    return {
      ...EMPTY_INPUTS,
      industry: lead.industry ?? null,
      targetLocation: lead.territory ?? null,
      paidCampaignActive: googleAds ? true : null,
      netAdSpend: googleAds?.spend ?? null,
      cvrLow: benchmark.cvrLow,
      cvrMid: benchmark.cvrMid,
      cvrHigh: benchmark.cvrHigh,
      ctr: benchmark.ctr,
      impressionShare: benchmark.impressionShare,
    };
  });

  const setInput = useCallback(<K extends keyof GrowthPlanInputs>(key: K, value: GrowthPlanInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Apply benchmark defaults when industry changes and CVR is at default
  const prevIndustry = useRef(inputs.industry);
  useEffect(() => {
    if (inputs.industry !== prevIndustry.current) {
      prevIndustry.current = inputs.industry;
      const bench = getBenchmarkForIndustry(inputs.industry);
      const savedInputs = (lead as any).paidSearchGrowthPlan?.inputs;
      setInputs(prev => ({
        ...prev,
        cvrLow: savedInputs?.cvrLow ?? bench.cvrLow,
        cvrMid: savedInputs?.cvrMid ?? bench.cvrMid,
        cvrHigh: savedInputs?.cvrHigh ?? bench.cvrHigh,
        ctr: savedInputs?.ctr ?? bench.ctr,
        impressionShare: savedInputs?.impressionShare ?? bench.impressionShare,
      }));
    }
  }, [inputs.industry, lead]);

  // Derived calculations (all memoised)
  const calculations = useMemo(() => runCalculations(inputs), [inputs]);
  const insights = useMemo(() => generateInsights(inputs, calculations), [inputs, calculations]);
  const recommendations = useMemo(() => generateRecommendations(inputs, calculations), [inputs, calculations]);
  const roadmap = useMemo(() => generateRoadmap(inputs, calculations), [inputs, calculations]);
  const missingFields = useMemo(() => getMissingFields(inputs), [inputs]);

  const buildPlan = useCallback((): PaidSearchGrowthPlan => {
    const exportSections = generateExportSections(
      { isActive: true, inputs, calculations, insights, recommendations, roadmap,
        export: { executiveSummary: null, shortSummary: null, pdfSections: [], publicPageSections: [] },
        metadata: { generatedAt: null, updatedAt: null, basedOnLiveData: true, missingFields } },
      lead.companyName
    );
    const shortSummary = generatePlainSummary(
      { isActive: true, inputs, calculations, insights, recommendations, roadmap,
        export: { executiveSummary: null, shortSummary: null, pdfSections: [], publicPageSections: [] },
        metadata: { generatedAt: null, updatedAt: null, basedOnLiveData: true, missingFields } },
      lead.companyName
    );
    return {
      isActive: true,
      inputs,
      calculations,
      insights,
      recommendations,
      roadmap,
      export: {
        executiveSummary: shortSummary,
        shortSummary,
        pdfSections: exportSections,
        publicPageSections: exportSections,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        basedOnLiveData: true,
        missingFields,
      },
    };
  }, [inputs, calculations, insights, recommendations, roadmap, missingFields, lead.companyName]);

  const handleSave = useCallback(async () => {
    if (!orgId || !authReady) return;
    setSaving(true);
    try {
      const plan = buildPlan();
      dispatch(patchLead({ id: lead.id, updates: { paidSearchGrowthPlan: plan } as any }));
      await updateLeadInFirestore(orgId, lead.id, { paidSearchGrowthPlan: plan } as any, authReady);
      toast({ title: 'Growth Plan saved to deal' });
    } catch (err) {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [orgId, authReady, buildPlan, dispatch, lead.id, toast]);

  const handleCopySummary = useCallback(() => {
    const plan = buildPlan();
    const text = generatePlainSummary(plan, lead.companyName);
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildPlan, lead.companyName]);

  // Opportunity label
  const oppLabel =
    calculations.opportunityScore === null ? null :
    calculations.opportunityScore >= 70 ? { label: 'High Opportunity', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' } :
    calculations.opportunityScore >= 40 ? { label: 'Moderate Opportunity', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' } :
    { label: 'Limited Opportunity', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* TOP BAR */}
      <div className="shrink-0 border-b px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack} data-testid="button-growthplan-back">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500 shrink-0" />
              <h2 className="text-sm font-semibold">Growth Plan</h2>
              <span className="text-xs text-muted-foreground hidden sm:inline">— Paid Search Opportunity Model</span>
            </div>
            {insights.summaryHeadline && (
              <p className="text-xs text-muted-foreground mt-0.5">{insights.summaryHeadline}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopySummary} data-testid="button-growthplan-copy">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled data-testid="button-growthplan-pdf">
            <FileDown className="h-3 w-3" />
            PDF
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSave} disabled={saving} data-testid="button-growthplan-save">
            <Save className="h-3 w-3" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* WARNINGS */}
          {insights.warnings.length > 0 && (
            <div className="space-y-1.5">
              {insights.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800/50">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* KPI ROW */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="Search Demand"
              value={inputs.totalMonthlySearches ? inputs.totalMonthlySearches.toLocaleString() : (calculations.estimatedClicks ? `${calculations.estimatedClicks.toLocaleString()} clicks` : '—')}
              sub={inputs.totalMonthlySearches ? 'searches/mo' : (!calculations.estimatedClicks ? 'Add market data' : undefined)}
            />
            <StatCard
              label="Est. Leads"
              value={calculations.leadsMid ? `${Math.round(calculations.leadsMid ?? 0)}–${Math.round(calculations.leadsHigh ?? 0)}` : '—'}
              sub={calculations.leadsMid ? 'per month (mid–high)' : 'Add inputs to calculate'}
            />
            <StatCard
              label="Revenue Potential"
              value={calculations.revenueMid ? fmt$(calculations.revenueMid) : '—'}
              sub={calculations.revenueMid ? `mid scenario/mo` : 'Add job value'}
              accent={calculations.revenueMid !== null}
            />
            <StatCard
              label="ROI Range"
              value={calculations.roiLow ? `${fmtROI(calculations.roiLow)}–${fmtROI(calculations.roiHigh)}` : '—'}
              sub={calculations.roiMid ? (calculations.roiMid >= 1 ? 'positive return' : 'below break-even') : 'Add investment data'}
            />
          </div>

          {/* MODE TOGGLE */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            <button
              onClick={() => setInput('calculatorMode', 'budget')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${inputs.calculatorMode === 'budget' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-mode-budget"
            >
              Budget Forecast
            </button>
            <button
              onClick={() => setInput('calculatorMode', 'market')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${inputs.calculatorMode === 'market' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="button-mode-market"
            >
              Market Opportunity
            </button>
          </div>

          {/* MAIN 2-COL GRID */}
          <div className="grid grid-cols-2 gap-4">

            {/* LEFT COLUMN — Inputs */}
            <div className="space-y-4">

              {/* BUSINESS INPUTS */}
              <SectionCard title="Business Inputs" icon={DollarSign}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-muted-foreground">Industry</Label>
                    <Select
                      value={inputs.industry ?? 'none'}
                      onValueChange={v => setInput('industry', v === 'none' ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select industry —</SelectItem>
                        {INDUSTRY_LABELS.map(({ key, label }) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs text-muted-foreground">Target Location</Label>
                    <Input
                      value={inputs.targetLocation ?? ''}
                      onChange={e => setInput('targetLocation', e.target.value || null)}
                      placeholder="e.g. Brisbane South"
                      className="h-8 text-sm"
                      data-testid="input-target-location"
                    />
                  </div>
                  <NumInput label="Monthly Package $" value={inputs.monthlyPackagePrice} onChange={v => setInput('monthlyPackagePrice', v)} prefix="$" placeholder="5000" testId="input-package-price" />
                  <NumInput label="Management Fee $" value={inputs.managementFee} onChange={v => setInput('managementFee', v)} prefix="$" placeholder="1500" helper="Agency fee/mo" testId="input-mgmt-fee" />
                  <NumInput label="Net Ad Spend $" value={inputs.netAdSpend} onChange={v => setInput('netAdSpend', v)} prefix="$" placeholder="2500" helper="Media budget/mo" testId="input-ad-spend" />
                  <NumInput label="Avg Job Value $" value={inputs.averageJobValue} onChange={v => setInput('averageJobValue', v)} prefix="$" placeholder="4000" testId="input-job-value" />
                  <div className="col-span-2">
                    <NumInput label="Close Rate %" value={inputs.closeRate !== null ? inputs.closeRate * 100 : null} onChange={v => setInput('closeRate', v !== null ? v / 100 : null)} suffix="%" placeholder="20" helper="% of leads that become customers" testId="input-close-rate" />
                  </div>
                </div>
              </SectionCard>

              {/* MARKET INPUTS */}
              <SectionCard title="Market Inputs" icon={BarChart3}>
                <p className="text-xs text-muted-foreground/70 -mt-1">
                  {inputs.calculatorMode === 'market'
                    ? 'Used to calculate demand-based click forecast.'
                    : 'Market data enriches opportunity scoring. Switch to Market mode to use for click forecast.'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Keyword Cluster</Label>
                    <Input
                      value={inputs.keywordCluster ?? ''}
                      onChange={e => setInput('keywordCluster', e.target.value || null)}
                      placeholder="e.g. builders Brisbane"
                      className="h-8 text-sm"
                      data-testid="input-keyword-cluster"
                    />
                  </div>
                  <NumInput label="Total Monthly Searches" value={inputs.totalMonthlySearches} onChange={v => setInput('totalMonthlySearches', v)} placeholder="3000" helper="From Keyword Planner" testId="input-total-searches" />
                  <NumInput label="Avg CPC $" value={inputs.avgCpc} onChange={v => setInput('avgCpc', v)} prefix="$" placeholder="8.50" testId="input-avg-cpc" />
                  <NumInput label="Low CPC $" value={inputs.lowCpc} onChange={v => setInput('lowCpc', v)} prefix="$" placeholder="5.00" testId="input-low-cpc" />
                  <NumInput label="High CPC $" value={inputs.highCpc} onChange={v => setInput('highCpc', v)} prefix="$" placeholder="14.00" testId="input-high-cpc" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Competition</Label>
                    <Select
                      value={inputs.competition ?? 'none'}
                      onValueChange={v => setInput('competition', v === 'none' ? null : v as any)}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="select-competition">
                        <SelectValue placeholder="Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select —</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumInput label="CTR %" value={inputs.ctr !== null ? inputs.ctr * 100 : null} onChange={v => setInput('ctr', v !== null ? v / 100 : null)} suffix="%" placeholder="5" testId="input-ctr" />
                  <div className="col-span-2">
                    <NumInput label="Impression Share %" value={inputs.impressionShare !== null ? inputs.impressionShare * 100 : null} onChange={v => setInput('impressionShare', v !== null ? v / 100 : null)} suffix="%" placeholder="30" helper="% of eligible searches shown your ad" testId="input-impression-share" />
                  </div>
                </div>
              </SectionCard>

              {/* BENCHMARK INPUTS */}
              <SectionCard title="Conversion Rate Benchmarks" icon={Target}>
                <p className="text-xs text-muted-foreground/70 -mt-1">
                  Auto-loaded from industry benchmark. Override to match account history.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <NumInput label="CVR Low %" value={inputs.cvrLow !== null ? inputs.cvrLow * 100 : null} onChange={v => setInput('cvrLow', v !== null ? v / 100 : null)} suffix="%" placeholder="5" testId="input-cvr-low" />
                  <NumInput label="CVR Mid %" value={inputs.cvrMid !== null ? inputs.cvrMid * 100 : null} onChange={v => setInput('cvrMid', v !== null ? v / 100 : null)} suffix="%" placeholder="10" testId="input-cvr-mid" />
                  <NumInput label="CVR High %" value={inputs.cvrHigh !== null ? inputs.cvrHigh * 100 : null} onChange={v => setInput('cvrHigh', v !== null ? v / 100 : null)} suffix="%" placeholder="18" testId="input-cvr-high" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground w-full border border-dashed mt-1"
                  onClick={() => {
                    const bench = getBenchmarkForIndustry(inputs.industry);
                    setInputs(prev => ({ ...prev, cvrLow: bench.cvrLow, cvrMid: bench.cvrMid, cvrHigh: bench.cvrHigh, ctr: bench.ctr, impressionShare: bench.impressionShare }));
                  }}
                  data-testid="button-reset-benchmarks"
                >
                  Reset to industry benchmark
                </Button>
              </SectionCard>

              {/* COVERAGE INPUTS */}
              <SectionCard title="Coverage & Setup" icon={Zap}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Dedicated Landing Page</Label>
                    <Select
                      value={inputs.landingPageExists === null ? 'unknown' : inputs.landingPageExists ? 'yes' : 'no'}
                      onValueChange={v => setInput('landingPageExists', v === 'unknown' ? null : v === 'yes')}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="select-landing-page">
                        <SelectValue placeholder="Unknown" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Unknown</SelectItem>
                        <SelectItem value="yes">Yes — exists</SelectItem>
                        <SelectItem value="no">No — missing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumInput label="Page Relevance Score" value={inputs.pageRelevanceScore} onChange={v => setInput('pageRelevanceScore', v)} placeholder="0–10" testId="input-page-relevance" />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SEO Coverage</Label>
                    <Select
                      value={inputs.seoCoverageStatus ?? 'unknown'}
                      onValueChange={v => setInput('seoCoverageStatus', v === 'unknown' ? null : v as any)}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="select-seo-coverage">
                        <SelectValue placeholder="Not assessed" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Not assessed</SelectItem>
                        <SelectItem value="missing">Missing</SelectItem>
                        <SelectItem value="weak">Weak</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="strong">Strong</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Paid Campaign Active</Label>
                    <Select
                      value={inputs.paidCampaignActive === null ? 'unknown' : inputs.paidCampaignActive ? 'yes' : 'no'}
                      onValueChange={v => setInput('paidCampaignActive', v === 'unknown' ? null : v === 'yes')}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid="select-paid-campaign">
                        <SelectValue placeholder="Unknown" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Unknown</SelectItem>
                        <SelectItem value="yes">Yes — active</SelectItem>
                        <SelectItem value="no">No — inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    value={inputs.notes ?? ''}
                    onChange={e => setInput('notes', e.target.value || null)}
                    placeholder="Additional context for this opportunity..."
                    className="text-sm min-h-[60px] resize-none"
                    data-testid="textarea-notes"
                  />
                </div>
              </SectionCard>
            </div>

            {/* RIGHT COLUMN — Outputs */}
            <div className="space-y-4">

              {/* FORECAST */}
              <SectionCard title="Click & Lead Forecast" icon={TrendingUp}>
                {calculations.estimatedClicks === null ? (
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-4 text-center">
                    <Info className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/50" />
                    {inputs.calculatorMode === 'budget'
                      ? 'Add Net Ad Spend and Avg CPC to generate a click forecast.'
                      : 'Add Total Monthly Searches, Impression Share, and CTR to generate a demand forecast.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-xs text-muted-foreground">Estimated Clicks</span>
                      <span className="text-sm font-bold font-mono">{fmtN(calculations.estimatedClicks, 0)}/mo</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Low', 'Mid', 'High'] as const).map((tier, i) => {
                        const leads = [calculations.leadsLow, calculations.leadsMid, calculations.leadsHigh][i];
                        const cpa = [calculations.cpaLow, calculations.cpaMid, calculations.cpaHigh][i];
                        const col = i === 0 ? 'text-rose-600 dark:text-rose-400' : i === 1 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
                        return (
                          <div key={tier} className="rounded-lg border bg-background p-2.5 text-center">
                            <p className={`text-xs font-semibold mb-1 ${col}`}>{tier}</p>
                            <p className="text-base font-bold font-mono">{fmtN(leads)}</p>
                            <p className="text-xs text-muted-foreground">leads/mo</p>
                            <Separator className="my-1.5" />
                            <p className="text-sm font-mono">{fmt$(cpa)}</p>
                            <p className="text-xs text-muted-foreground">CPA</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* REVENUE PROJECTION */}
              <SectionCard title="Revenue Projection" icon={DollarSign}>
                {calculations.revenueMid === null ? (
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-4 text-center">
                    <Info className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/50" />
                    Add Average Job Value and Close Rate to project revenue.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(['Low', 'Mid', 'High'] as const).map((tier, i) => {
                      const customers = [calculations.customersLow, calculations.customersMid, calculations.customersHigh][i];
                      const revenue = [calculations.revenueLow, calculations.revenueMid, calculations.revenueHigh][i];
                      const roi = [calculations.roiLow, calculations.roiMid, calculations.roiHigh][i];
                      const col = i === 0 ? 'text-rose-600 dark:text-rose-400' : i === 1 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
                      const roiOk = roi !== null && roi >= 1;
                      return (
                        <div key={tier} className="rounded-lg border bg-background p-2.5 text-center">
                          <p className={`text-xs font-semibold mb-1 ${col}`}>{tier}</p>
                          <p className="text-base font-bold font-mono">{fmt$(revenue)}</p>
                          <p className="text-xs text-muted-foreground">{fmtN(customers)} customers</p>
                          <Separator className="my-1.5" />
                          <p className={`text-sm font-bold font-mono ${roiOk ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {fmtROI(roi)} ROI
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* BREAK-EVEN */}
              <SectionCard title="Break-Even Analysis">
                {calculations.breakEvenCustomers === null ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Add investment, job value, and close rate to calculate break-even.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Total Investment</p>
                      <p className="text-base font-bold font-mono">{fmt$(calculations.totalInvestment)}</p>
                      <p className="text-xs text-muted-foreground">/mo</p>
                    </div>
                    <div className="text-center border-x">
                      <p className="text-xs text-muted-foreground mb-1">Break-even Leads</p>
                      <p className="text-base font-bold font-mono">{fmtN(calculations.breakEvenLeads)}</p>
                      <p className="text-xs text-muted-foreground">/mo needed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Break-even Customers</p>
                      <p className="text-base font-bold font-mono">{fmtN(calculations.breakEvenCustomers)}</p>
                      <p className="text-xs text-muted-foreground">/mo needed</p>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* OPPORTUNITY SCORE */}
              <SectionCard title="Opportunity Analysis" icon={Target}>
                {calculations.opportunityScore === null ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Add impression share, SEO coverage, and campaign status to score this opportunity.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-3xl font-bold">{calculations.opportunityScore}</span>
                          <span className="text-base text-muted-foreground">/100</span>
                        </div>
                        {oppLabel && (
                          <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${oppLabel.color}`}>
                            {oppLabel.label}
                          </span>
                        )}
                      </div>
                      <div className="text-right space-y-1">
                        {calculations.reachableDemand !== null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Reachable Demand</p>
                            <p className="text-sm font-mono font-semibold">{fmtN(calculations.reachableDemand, 0)}</p>
                          </div>
                        )}
                        {calculations.untappedDemand !== null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Untapped Demand</p>
                            <p className="text-sm font-mono font-semibold text-orange-500">{fmtN(calculations.untappedDemand, 0)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${calculations.opportunityScore >= 70 ? 'bg-green-500' : calculations.opportunityScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${calculations.opportunityScore}%` }}
                      />
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* COMMENTARY */}
              <SectionCard title="Analysis">
                {insights.commentary.length === 0 && insights.strengths.length === 0 && insights.gaps.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Add inputs to generate analysis commentary.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {insights.commentary.length > 0 && (
                      <div className="space-y-1.5">
                        {insights.commentary.map((c, i) => (
                          <p key={i} className="text-xs text-foreground/80 leading-relaxed">{c}</p>
                        ))}
                      </div>
                    )}
                    {insights.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Strengths</p>
                        <ul className="space-y-1">
                          {insights.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {insights.gaps.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Gaps</p>
                        <ul className="space-y-1">
                          {insights.gaps.map((g, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                              {g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* RECOMMENDED ACTIONS */}
              <SectionCard title="Priority Actions">
                {recommendations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Add more inputs to generate recommendations.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recommendations.slice(0, 4).map((rec, i) => {
                      const priorityBadge =
                        rec.priority === 'high'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                          : rec.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground';
                      return (
                        <div key={i} className="rounded-lg border bg-background p-3 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold leading-tight">{rec.title}</p>
                            <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityBadge}`}>
                              {rec.priority}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{rec.reason}</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">{rec.expectedImpact}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* SCENARIO TABLE */}
          {(calculations.leadsLow !== null || calculations.leadsMid !== null || calculations.leadsHigh !== null) && (
            <SectionCard title="Scenario Comparison">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 px-3 text-left font-medium w-10">Scenario</th>
                      <th className="py-2 px-3 text-right font-medium">Leads</th>
                      <th className="py-2 px-3 text-right font-medium">CPA</th>
                      <th className="py-2 px-3 text-right font-medium">Customers</th>
                      <th className="py-2 px-3 text-right font-medium">Revenue</th>
                      <th className="py-2 px-3 text-right font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ScenarioRow label="Low" leads={calculations.leadsLow} cpa={calculations.cpaLow} customers={calculations.customersLow} revenue={calculations.revenueLow} roi={calculations.roiLow} highlight="red" />
                    <ScenarioRow label="Mid" leads={calculations.leadsMid} cpa={calculations.cpaMid} customers={calculations.customersMid} revenue={calculations.revenueMid} roi={calculations.roiMid} highlight="amber" />
                    <ScenarioRow label="High" leads={calculations.leadsHigh} cpa={calculations.cpaHigh} customers={calculations.customersHigh} revenue={calculations.revenueHigh} roi={calculations.roiHigh} highlight="green" />
                  </tbody>
                </table>
              </div>
              {insights.assumptions.length > 0 && (
                <p className="text-xs text-muted-foreground/60 pt-1">
                  Assumptions: {insights.assumptions.join(' · ')}
                </p>
              )}
            </SectionCard>
          )}

          {/* 12-MONTH ROADMAP */}
          <div>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-background text-left"
              onClick={() => setShowRoadmap(v => !v)}
              data-testid="button-toggle-roadmap"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">12-Month Growth Roadmap</span>
              </div>
              {showRoadmap ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showRoadmap && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {[
                  { label: 'Q1 — Foundations', items: roadmap.q1, color: 'border-blue-200 dark:border-blue-800/50' },
                  { label: 'Q2 — Demand Capture', items: roadmap.q2, color: 'border-amber-200 dark:border-amber-800/50' },
                  { label: 'Q3 — Expansion', items: roadmap.q3, color: 'border-orange-200 dark:border-orange-800/50' },
                  { label: 'Q4 — Domination', items: roadmap.q4, color: 'border-green-200 dark:border-green-800/50' },
                ].map(({ label, items, color }) => (
                  <div key={label} className={`rounded-xl border-2 bg-background p-4 space-y-2 ${color}`}>
                    <p className="text-xs font-semibold">{label}</p>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MISSING DATA NOTE */}
          {missingFields.length > 0 && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="font-medium mb-1">To unlock the full forecast, add:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                {missingFields.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
