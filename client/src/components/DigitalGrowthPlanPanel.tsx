import { useState } from 'react';
import {
  TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Zap, Target, BarChart3, DollarSign, Globe, MapPin,
  Search, Lightbulb, ArrowRight, Rocket, Clock,
  Shield, Brain, Star, BarChart2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Lead, GrowthPrescription, ProductRecommendation, InvestmentOption } from '@/lib/types';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return ''; }
}

function fmt$(v: number) {
  return `$${v.toLocaleString('en-AU')}`;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const URGENCY_CONFIG = {
  high:   { label: 'High Urgency', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  medium: { label: 'Moderate Urgency', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  low:    { label: 'Low Urgency', bg: 'bg-slate-50 dark:bg-slate-900/20', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-600 dark:text-slate-400', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

const PRODUCT_CONFIG: Record<ProductRecommendation['product'], { label: string; icon: typeof Globe; color: string; bg: string; desc: string }> = {
  website: { label: 'Website', icon: Globe, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', desc: 'Conversion-optimised local service website' },
  seo:     { label: 'Local SEO', icon: Search, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', desc: 'Keyword targeting and local search dominance' },
  gbp:     { label: 'GBP Management', icon: MapPin, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', desc: 'Google Business Profile optimisation & reviews' },
  ads:     { label: 'Paid Ads', icon: BarChart3, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', desc: 'Google Ads for immediate traffic and leads' },
};

const TIER_BORDERS: Record<string, string> = {
  starter:      'border-slate-300 dark:border-slate-600',
  momentum:     'border-blue-400 dark:border-blue-600',
  accelerated:  'border-violet-400 dark:border-violet-600',
  performance:  'border-amber-400 dark:border-amber-600',
};

const TIER_BADGE: Record<string, string> = {
  starter:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  momentum:     'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  accelerated:  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  performance:  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityDot({ s }: { s: 'high' | 'medium' | 'low' }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${s === 'high' ? 'bg-red-500' : s === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />;
}

function ProductCard({ rec }: { rec: ProductRecommendation }) {
  const cfg = PRODUCT_CONFIG[rec.product];
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-lg border ${cfg.bg} p-3 space-y-2`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-md ${cfg.bg} flex items-center justify-center border shrink-0`}>
          <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{cfg.label}</span>
            <Badge variant="outline" className="text-[10px]">Priority {rec.priority}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{cfg.desc}</p>
        </div>
      </div>
      <p className="text-xs text-foreground pl-9">{rec.reason}</p>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground pl-9"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Less detail' : 'More detail'}
      </button>
      {expanded && (
        <div className="pl-9 space-y-1.5 text-xs">
          <div>
            <span className="text-muted-foreground">Impact: </span>
            <span className="text-foreground">{rec.impact}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Timeline: </span>
            <span className="text-foreground">{rec.timeline}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function InvestmentCard({ option, isSelected, onSelect }: { option: InvestmentOption; isSelected: boolean; onSelect: () => void }) {
  const border = TIER_BORDERS[option.tier] || 'border-slate-200';
  const badge = TIER_BADGE[option.tier] || 'bg-slate-100 text-slate-600';
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border-2 p-3 text-left transition-all ${border} ${isSelected ? 'ring-2 ring-violet-500 ring-offset-1' : 'hover:shadow-sm'} ${option.recommended ? 'relative' : ''}`}
      data-testid={`btn-tier-${option.tier}`}
    >
      {option.recommended && (
        <span className="absolute -top-2.5 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white">Recommended</span>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge}`}>{option.label}</span>
          <p className="text-lg font-bold mt-1">{fmt$(option.monthlyInvestment)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
          <p className="text-xs text-muted-foreground">{fmt$(option.weeklyEquivalent)}/week</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Speed</p>
          <p className="text-xs font-semibold">{option.speed}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{option.description}</p>
      {isSelected && (
        <div className="mt-2 space-y-1.5 text-xs border-t pt-2">
          <div>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Outcomes: </span>
            <span>{option.outcomes}</span>
          </div>
          {option.tradeoffs && (
            <div>
              <span className="text-amber-600 dark:text-amber-400 font-medium">Trade-offs: </span>
              <span>{option.tradeoffs}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PlanTab = 'diagnosis' | 'strategy' | 'investment' | 'outcomes';

interface DigitalGrowthPlanPanelProps {
  lead: Lead;
}

export default function DigitalGrowthPlanPanel({ lead }: DigitalGrowthPlanPanelProps) {
  const [activeTab, setActiveTab] = useState<PlanTab>('diagnosis');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const prescription = lead.growthPrescription;
  const diag = lead.aiGrowthPlan?.strategyDiagnosis;
  const si = lead.strategyIntelligence;

  const urgencyCfg = prescription ? URGENCY_CONFIG[prescription.urgencyLevel] : URGENCY_CONFIG.medium;

  const tabs: { id: PlanTab; label: string }[] = [
    { id: 'diagnosis', label: 'Diagnosis' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'investment', label: 'Investment' },
    { id: 'outcomes', label: 'Outcomes' },
  ];

  if (!prescription && !diag) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 px-4">
        <Brain className="w-10 h-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">No growth plan generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Run the Growth Prescription from the Deal Intelligence panel to generate a strategic plan for this lead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="digital-growth-plan-panel">

      {/* ── Plan header ─────────────────────────────────────────────────── */}
      {prescription && (
        <div className={`rounded-lg border ${urgencyCfg.bg} ${urgencyCfg.border} p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className={`w-4 h-4 ${urgencyCfg.text}`} />
              <span className="text-sm font-semibold">Growth Diagnosis</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${urgencyCfg.badge}`}>
              {urgencyCfg.label}
            </span>
          </div>
          <p className="text-sm text-foreground">{prescription.businessDiagnosis}</p>
          {prescription.primaryObjective && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Primary objective:</span> {prescription.primaryObjective}
            </p>
          )}
          {prescription.generatedAt && (
            <p className="text-[10px] text-muted-foreground">Generated {fmtDate(prescription.generatedAt)}</p>
          )}
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
              data-testid={`plan-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Diagnosis tab ────────────────────────────────────────────────── */}
      {activeTab === 'diagnosis' && (
        <div className="space-y-4">

          {/* Strategy diagnosis readiness score */}
          {diag && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness Score</span>
                <span className={`text-lg font-bold ${diag.readinessScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : diag.readinessScore >= 45 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  {diag.readinessScore}/100
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${diag.readinessScore >= 70 ? 'bg-emerald-500' : diag.readinessScore >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${diag.readinessScore}%` }} />
              </div>
              {diag.insightSentence && (
                <p className="text-sm text-foreground border-l-2 border-violet-400 pl-3 italic">{diag.insightSentence}</p>
              )}
            </div>
          )}

          {/* What's limiting growth */}
          {(diag?.gaps?.length || 0) > 0 && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-semibold">What's Limiting Growth</span>
              </div>
              <div className="space-y-3">
                {diag!.gaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <SeverityDot s={gap.severity} />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{gap.title}</p>
                      <p className="text-xs text-muted-foreground">{gap.evidence}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">{gap.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current position */}
          {diag?.currentPosition && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold">Current Position</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  Google Clarity: {diag.currentPosition.googleClarity}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{diag.currentPosition.summary}</p>
              {diag.currentPosition.pageBreakdown.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {diag.currentPosition.pageBreakdown.slice(0, 6).map((p, i) => (
                    <div key={i} className="rounded-md bg-muted/50 p-2 text-center">
                      <p className="text-sm font-bold">{p.count}</p>
                      <p className="text-[10px] text-muted-foreground">{p.type}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Strategy notes */}
          {si?.businessOverview && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold">Business Intelligence</span>
              </div>
              <div className="space-y-2 text-xs">
                {si.businessOverview && <p><span className="font-medium text-muted-foreground">Overview: </span>{si.businessOverview}</p>}
                {si.idealCustomer && <p><span className="font-medium text-muted-foreground">Ideal customer: </span>{si.idealCustomer}</p>}
                {si.growthObjective && <p><span className="font-medium text-muted-foreground">Growth objective: </span>{si.growthObjective}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Strategy tab ─────────────────────────────────────────────────── */}
      {activeTab === 'strategy' && (
        <div className="space-y-4">

          {/* Recommended stack */}
          {prescription?.recommendedStack && prescription.recommendedStack.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended Solution Stack</p>
              {prescription.recommendedStack
                .sort((a, b) => a.priority - b.priority)
                .map((rec, i) => (
                  <ProductCard key={i} rec={rec} />
                ))}
            </div>
          )}

          {/* Growth potential */}
          {diag?.growthPotential && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold">Growth Potential</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  Confidence: {diag.growthPotential.forecastBand.confidence}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{diag.growthPotential.summary}</p>
              {diag.growthPotential.opportunities.length > 0 && (
                <div className="space-y-1.5">
                  {diag.growthPotential.opportunities.map((opp, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span>{opp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Priority actions */}
          {diag?.priorities && diag.priorities.length > 0 && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold">Priority Actions</span>
              </div>
              <div className="space-y-3">
                {diag.priorities.map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-400 shrink-0">
                      {p.rank}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{p.action}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                      {p.examples && p.examples.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.examples.map((ex, j) => (
                            <span key={j} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{ex}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Investment tab ───────────────────────────────────────────────── */}
      {activeTab === 'investment' && (
        <div className="space-y-4">
          {prescription?.investmentOptions && prescription.investmentOptions.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Select a tier to see detail. Tap a card to expand.</p>
              <div className="space-y-3">
                {prescription.investmentOptions.map((opt, i) => (
                  <InvestmentCard
                    key={i}
                    option={opt}
                    isSelected={selectedTier === opt.tier}
                    onSelect={() => setSelectedTier(selectedTier === opt.tier ? null : opt.tier)}
                  />
                ))}
              </div>

              {prescription.costOfInaction && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Cost of Inaction
                  </p>
                  <p className="text-xs text-foreground">{prescription.costOfInaction}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Generate the Growth Prescription to see investment options
            </div>
          )}
        </div>
      )}

      {/* ── Outcomes tab ─────────────────────────────────────────────────── */}
      {activeTab === 'outcomes' && (
        <div className="space-y-4">
          {diag?.growthPotential?.forecastBand ? (
            <>
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-semibold">Expected Outcomes</span>
                  <Badge variant="outline" className="text-xs ml-auto capitalize">
                    {diag.growthPotential.forecastBand.confidence} confidence
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center space-y-1">
                    <Eye className="w-4 h-4 text-blue-500 mx-auto" />
                    <p className="text-[10px] text-muted-foreground">More Impressions</p>
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{diag.growthPotential.forecastBand.additionalImpressions}</p>
                  </div>
                  <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3 text-center space-y-1">
                    <TrendingUp className="w-4 h-4 text-violet-500 mx-auto" />
                    <p className="text-[10px] text-muted-foreground">More Visitors</p>
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{diag.growthPotential.forecastBand.additionalVisitors}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center space-y-1">
                    <Target className="w-4 h-4 text-emerald-500 mx-auto" />
                    <p className="text-[10px] text-muted-foreground">More Enquiries</p>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{diag.growthPotential.forecastBand.additionalEnquiries}</p>
                  </div>
                </div>
              </div>

              {/* Sub-scores */}
              {diag.subscores && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dimension Scores</span>
                  {([
                    ['Service Clarity', diag.subscores.serviceClarityScore],
                    ['Location Relevance', diag.subscores.locationRelevanceScore],
                    ['Content Coverage', diag.subscores.contentCoverageScore],
                    ['GBP Alignment', diag.subscores.gbpAlignmentScore],
                    ['Authority', diag.subscores.authorityScore],
                  ] as [string, number][]).map(([label, score]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold">{score}/100</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Generate the Growth Prescription and run the Strategy Diagnosis to see expected outcomes
            </div>
          )}
        </div>
      )}
    </div>
  );
}
