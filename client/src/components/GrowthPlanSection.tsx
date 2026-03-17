import { useState, useCallback, useEffect } from 'react';
import { Globe, Search, BarChart3, TrendingUp, FileDown, Loader2, RotateCcw, Copy, Check, Pin, AlertTriangle, CheckCircle2, XCircle, Minus, ExternalLink, Link, Sparkles, ChevronDown, ChevronRight, Target, Zap, Clock, ScanLine, Plus, Trash2, ChevronUp } from 'lucide-react';
import ShareStrategyModal from '@/components/ShareStrategyModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { Lead, CrawledPage, StrategyDiagnosis, StrategyDiagnosisGap, StrategyDiagnosisPriority } from '@/lib/types';

interface CompetitorAnalysis {
  domain: string;
  totalPages: number;
  crawledPages: CrawledPage[];
  error?: string;
}

interface CrawlData {
  url: string; success: boolean; error?: string; title?: string; metaDescription?: string;
  h1s: string[]; headingHierarchy: { tag: string; text: string }[]; internalLinks: number;
  externalLinks: number; wordCount: number; navLabels: string[]; hasHttps: boolean;
  hasSitemap: boolean; serviceKeywords: string[]; locationKeywords: string[];
  images: { total: number; withAlt: number; withoutAlt: number }; hasSchema: boolean;
  canonicalUrl?: string; ogTags: Record<string, string>;
}
interface XRayCallout { id: number; issue: string; detail: string; fix: string; severity: 'high' | 'medium' | 'low'; }
interface XRayResult { crawlData: CrawlData; callouts: XRayCallout[]; summary: string; }
interface SerpResult {
  keyword: string;
  prospectPosition: { mapsPresence: string; organicPresence: string; bestMatchingPage: string; relevanceScore: number; };
  competitors: { name: string; domain: string; position: number; strength: string }[];
  opportunities: { keyword: string; difficulty: string; volume: string; recommendation: string }[];
  serpSnapshot: { position: number; title: string; domain: string; snippet: string; type: string }[];
}
interface CompetitorGapResult {
  prospect: Record<string, string | number> & { keyWeaknesses?: string[] };
  competitorAverage: Record<string, string | number>;
  competitors: { name: string; servicePages: number; locationPages: number; contentDepth: string; strengths: string[]; topicsCovered?: string[]; contentAdvantage?: string }[];
  insights: string[];
  strategicWhiteSpace?: { opportunity: string; evidence: string; suggestedMove: string }[];
  contentGaps?: { topic: string; competitorExample: string; buyerIntent: string; priority: string }[];
}
interface ForecastResult {
  currentEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  projectedEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  growthTimeline: { month: string; traffic: number; leads: number; revenue: number }[];
  assumptions: string[]; keyDrivers: string[];
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1" data-testid={`button-copy-${label || 'text'}`}>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function InlineError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-950/20 text-sm space-y-2">
      <p className="text-red-700 dark:text-red-300">{error}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Retry</Button>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'high') return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (severity === 'medium') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <Minus className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = { high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400', medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400', low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' };
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colors[severity as keyof typeof colors] || colors.low}`}>{severity}</Badge>;
}

function SignalRow({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const icon = status === 'good' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : status === 'bad' ? <XCircle className="h-3.5 w-3.5 text-red-500" /> : status === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  return (
    <div className="flex items-start gap-2 py-1">
      {icon}
      <div className="flex-1 min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm truncate">{value}</p></div>
    </div>
  );
}

// ── Strategy Diagnosis UI Components ──────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-600 dark:text-green-400';
  if (score >= 45) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreRingColor(score: number) {
  if (score >= 70) return '#16a34a';
  if (score >= 45) return '#d97706';
  return '#dc2626';
}

function clarityBadge(clarity: string) {
  if (clarity === 'strong') return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400';
  if (clarity === 'moderate') return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400';
  return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
}

function confidenceLabel(confidence: string) {
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Medium confidence';
  return 'Low confidence — limited data';
}

function intentDot(intent: string) {
  if (intent === 'high') return 'bg-green-500';
  if (intent === 'medium') return 'bg-amber-400';
  return 'bg-red-400';
}

function ReadinessScoreCard({ diagnosis }: { diagnosis: StrategyDiagnosis }) {
  const score = diagnosis.readinessScore;
  const dvs = (diagnosis as any).digitalVisibilityScore;
  const dvsOverall = dvs?.overall ?? null;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
  const dvsOffset = dvsOverall !== null ? circumference - (dvsOverall / 100) * circumference : circumference;
  const genDate = diagnosis.generatedAt ? new Date(diagnosis.generatedAt) : null;
  const genLabel = genDate
    ? genDate.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + genDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  const subScoreItems = [
    { label: 'Service Clarity', value: diagnosis.subscores.serviceClarityScore },
    { label: 'Location Signals', value: diagnosis.subscores.locationRelevanceScore },
    { label: 'Content Coverage', value: diagnosis.subscores.contentCoverageScore },
    { label: 'GBP Alignment', value: diagnosis.subscores.gbpAlignmentScore },
    { label: 'Authority', value: diagnosis.subscores.authorityScore },
  ];

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="readiness-score-card">
      {/* Score header row */}
      <div className="px-3 pt-3 pb-2 space-y-3">
        <div className="flex items-start gap-3">
          {/* Growth Readiness */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative w-14 h-14 shrink-0">
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
                <circle cx="32" cy="32" r="28" fill="none" stroke={scoreRingColor(score)} strokeWidth="5"
                  strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-base font-bold ${scoreColor(score)}`}>{score}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Growth Readiness</p>
              <p className={`text-xs font-bold ${scoreColor(score)}`}>{score >= 70 ? 'Strong Position' : score >= 45 ? 'Developing' : 'Needs Attention'}</p>
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground mt-0.5">{confidenceLabel(diagnosis.confidence)}</Badge>
            </div>
          </div>

          {/* Digital Visibility Score */}
          {dvsOverall !== null && (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="relative w-14 h-14 shrink-0">
                <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
                  <circle cx="32" cy="32" r="28" fill="none" stroke={scoreRingColor(dvsOverall)} strokeWidth="5"
                    strokeDasharray={circumference} strokeDashoffset={dvsOffset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-base font-bold ${scoreColor(dvsOverall)}`}>{dvsOverall}</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Digital Visibility</p>
                <p className={`text-xs font-bold ${scoreColor(dvsOverall)}`}>{dvsOverall >= 70 ? 'Discoverable' : dvsOverall >= 45 ? 'Partial' : 'Hard to Find'}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Online discoverability</p>
              </div>
            </div>
          )}
        </div>

        {/* Digital Visibility Score breakdown */}
        {dvs?.components && (
          <div className="space-y-1.5 border-t pt-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Digital Visibility Breakdown</p>
            {Object.entries(dvs.components).map(([key, comp]: [string, any]) => (
              <div key={key} className="space-y-0.5" data-testid={`dvs-component-${key}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{comp.label}</span>
                  <span className={`text-[10px] font-bold ${scoreColor(comp.score)}`}>{comp.score}/100</span>
                </div>
                <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${comp.score >= 70 ? 'bg-green-500' : comp.score >= 45 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${comp.score}%` }} />
                </div>
                {comp.explanation && (
                  <p className="text-[9px] text-muted-foreground/70 leading-tight">{comp.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Insight sentence */}
        <p className="text-xs text-muted-foreground italic leading-relaxed border-t pt-2">"{diagnosis.insightSentence}"</p>

        {/* Client goal context */}
        {(diagnosis as any).clientGoalContext && (
          <div className="rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2.5 py-2">
            <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 mb-0.5 uppercase tracking-wide">Strategic Context</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{(diagnosis as any).clientGoalContext}</p>
          </div>
        )}

        {genLabel && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Analysed {genLabel}
          </p>
        )}
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-5 gap-px border-t bg-border">
        {subScoreItems.map(s => (
          <div key={s.label} className="text-center py-2 bg-background" data-testid={`subscore-${s.label.toLowerCase().replace(/\s/g, '-')}`}>
            <p className={`text-sm font-bold ${scoreColor(s.value)}`}>{s.value}</p>
            <p className="text-[8px] text-muted-foreground leading-tight px-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentPositionCard({ diagnosis }: { diagnosis: StrategyDiagnosis }) {
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="current-position-card">
      <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">Current Position</p>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${clarityBadge(diagnosis.currentPosition.googleClarity)}`}>
          Google Clarity: {diagnosis.currentPosition.googleClarity}
        </span>
      </div>
      <div className="p-3 space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">{diagnosis.currentPosition.summary}</p>
        {diagnosis.currentPosition.pageBreakdown?.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-1.5 text-muted-foreground font-medium">Page Type</th>
                  <th className="text-center p-1.5 text-muted-foreground font-medium">Count</th>
                  <th className="text-center p-1.5 text-muted-foreground font-medium">SEO Value</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.currentPosition.pageBreakdown.filter(r => r.count > 0).map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">{row.type}</td>
                    <td className="p-1.5 text-center font-medium">{row.count}</td>
                    <td className="p-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${intentDot(row.searchIntent)}`} />
                        <span className="text-muted-foreground capitalize">{row.searchIntent}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GrowthPotentialCard({ diagnosis }: { diagnosis: StrategyDiagnosis }) {
  const fb = diagnosis.growthPotential.forecastBand;
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="growth-potential-card">
      <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <p className="text-xs font-semibold">Growth Potential</p>
        {fb && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
            fb.confidence === 'strong' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
            fb.confidence === 'moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
            'bg-muted text-muted-foreground'}`}>
            {fb.confidence} confidence
          </span>
        )}
      </div>
      <div className="p-3 space-y-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">{diagnosis.growthPotential.summary}</p>
        {fb && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Monthly Impressions', value: fb.additionalImpressions, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Monthly Visitors', value: fb.additionalVisitors, color: 'text-green-600 dark:text-green-400' },
              { label: 'Monthly Enquiries', value: fb.additionalEnquiries, color: 'text-amber-600 dark:text-amber-400' },
            ].map(m => (
              <div key={m.label} className="border rounded p-2 text-center bg-muted/20">
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        )}
        {diagnosis.growthPotential.opportunities?.length > 0 && (
          <ul className="space-y-1">
            {diagnosis.growthPotential.opportunities.map((opp, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                <span>{opp}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GapCard({ gap, index }: { gap: StrategyDiagnosisGap; index: number }) {
  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`strategy-gap-${index}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30">
        <SeverityIcon severity={gap.severity} />
        <p className="text-xs font-semibold flex-1">{gap.title}</p>
        <SeverityBadge severity={gap.severity} />
      </div>
      <div className="p-2.5 space-y-1.5">
        <div className="flex gap-1.5">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide w-16 shrink-0 pt-0.5">Evidence</span>
          <p className="text-xs text-muted-foreground">{gap.evidence}</p>
        </div>
        {gap.impact && (
          <div className="flex gap-1.5">
            <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide w-16 shrink-0 pt-0.5">Impact</span>
            <p className="text-xs text-amber-700 dark:text-amber-400">{gap.impact}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WhiteSpaceCard({ item, index }: { item: any; index: number }) {
  return (
    <div className="border rounded-lg overflow-hidden border-emerald-200 dark:border-emerald-800" data-testid={`white-space-${index}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/30">
        <Zap className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex-1">{item.opportunity}</p>
        {item.searchDemand && <Badge className="text-[9px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-0">{item.searchDemand}</Badge>}
      </div>
      <div className="p-2.5 space-y-1.5">
        <div className="flex gap-1.5">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide w-16 shrink-0 pt-0.5">Evidence</span>
          <p className="text-xs text-muted-foreground">{item.evidence}</p>
        </div>
        {item.suggestedMove && (
          <div className="flex gap-1.5">
            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide w-16 shrink-0 pt-0.5">Move</span>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{item.suggestedMove}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PriorityList({ priorities }: { priorities: StrategyDiagnosisPriority[] }) {
  return (
    <div className="space-y-2" data-testid="priority-list">
      {priorities.map((p) => (
        <div key={p.rank} className="flex gap-3 border rounded-lg p-2.5 bg-muted/20">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">{p.rank}</div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-semibold">{p.action}</p>
            <p className="text-xs text-muted-foreground">{p.description}</p>
            {p.examples && p.examples.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {p.examples.map((ex, i) => (
                  <code key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">{ex}</code>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StrategyDiagnosisView({ diagnosis, onRegenerate, loading }: { diagnosis: StrategyDiagnosis; onRegenerate: () => void; loading: boolean }) {
  const strategicWhiteSpace = (diagnosis as any).strategicWhiteSpace as any[] | undefined;
  return (
    <div className="space-y-3" data-testid="strategy-diagnosis-view">
      <ReadinessScoreCard diagnosis={diagnosis} />
      <CurrentPositionCard diagnosis={diagnosis} />
      <GrowthPotentialCard diagnosis={diagnosis} />

      {diagnosis.gaps?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Biggest Constraints ({diagnosis.gaps.length})</p>
          {diagnosis.gaps.map((gap, i) => <GapCard key={i} gap={gap} index={i} />)}
        </div>
      )}

      {strategicWhiteSpace && strategicWhiteSpace.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Strategic White Space</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Opportunities no competitor has fully captured yet</p>
          {strategicWhiteSpace.map((item, i) => <WhiteSpaceCard key={i} item={item} index={i} />)}
        </div>
      )}

      {diagnosis.priorities?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Recommended Moves</p>
          <PriorityList priorities={diagnosis.priorities} />
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onRegenerate} disabled={loading} className="w-full gap-1 text-xs" data-testid="button-regenerate-diagnosis">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        {loading ? 'Regenerating...' : 'Regenerate Analysis'}
      </Button>
    </div>
  );
}

// ── Existing tool views (unchanged) ───────────────────────────────────────────

function WebsiteXRayView({ result }: { result: XRayResult }) {
  const d = result.crawlData;
  return (
    <div className="space-y-3" data-testid="xray-results">
      <div className="border rounded-lg p-3 bg-muted/20 space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">SEO Signals</p>
        <SignalRow label="Title Tag" value={d.title || 'Missing'} status={d.title ? (d.title.length > 10 && d.title.length < 70 ? 'good' : 'warn') : 'bad'} />
        <SignalRow label="Meta Description" value={d.metaDescription ? `${d.metaDescription.substring(0, 80)}...` : 'Missing'} status={d.metaDescription ? 'good' : 'bad'} />
        <SignalRow label="H1 Headings" value={d.h1s.length > 0 ? d.h1s.join(', ') : 'None found'} status={d.h1s.length === 1 ? 'good' : d.h1s.length === 0 ? 'bad' : 'warn'} />
        <SignalRow label="HTTPS" value={d.hasHttps ? 'Yes' : 'No'} status={d.hasHttps ? 'good' : 'bad'} />
        <SignalRow label="Sitemap" value={d.hasSitemap ? 'Found' : 'Not found'} status={d.hasSitemap ? 'good' : 'warn'} />
        <SignalRow label="Schema Markup" value={d.hasSchema ? 'Detected' : 'Not detected'} status={d.hasSchema ? 'good' : 'warn'} />
        <SignalRow label="Word Count" value={String(d.wordCount)} status={d.wordCount > 300 ? 'good' : d.wordCount > 100 ? 'warn' : 'bad'} />
        <SignalRow label="Internal Links" value={String(d.internalLinks)} status={d.internalLinks > 5 ? 'good' : 'warn'} />
        <SignalRow label="Images" value={`${d.images.total} total (${d.images.withAlt} with alt text)`} status={d.images.withoutAlt === 0 ? 'good' : 'warn'} />
      </div>
      {d.navLabels.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Navigation</p>
          <div className="flex flex-wrap gap-1">{d.navLabels.map((label, i) => <Badge key={i} variant="secondary" className="text-[10px]">{label}</Badge>)}</div>
        </div>
      )}
      {(d.serviceKeywords.length > 0 || d.locationKeywords.length > 0) && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Keywords Detected</p>
          {d.serviceKeywords.length > 0 && <div><p className="text-[10px] text-muted-foreground mb-1">Service Keywords</p><div className="flex flex-wrap gap-1">{d.serviceKeywords.map((kw, i) => <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>)}</div></div>}
          {d.locationKeywords.length > 0 && <div><p className="text-[10px] text-muted-foreground mb-1">Location Keywords</p><div className="flex flex-wrap gap-1">{d.locationKeywords.map((kw, i) => <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>)}</div></div>}
        </div>
      )}
      {result.callouts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Issues & Recommendations</p>
          {result.callouts.map((c) => (
            <div key={c.id} className="border rounded-lg p-2.5 space-y-1 bg-muted/20" data-testid={`callout-${c.id}`}>
              <div className="flex items-center gap-2"><SeverityIcon severity={c.severity} /><p className="text-sm font-medium flex-1">{c.issue}</p><SeverityBadge severity={c.severity} /></div>
              <p className="text-xs text-muted-foreground pl-5">{c.detail}</p>
              <p className="text-xs text-green-700 dark:text-green-400 pl-5">{c.fix}</p>
            </div>
          ))}
        </div>
      )}
      <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20"><p className="text-sm">{result.summary}</p></div>
      <CopyBtn text={`Website X-Ray Summary:\n${result.summary}\n\nIssues:\n${result.callouts.map(c => `- [${c.severity}] ${c.issue}: ${c.detail} → ${c.fix}`).join('\n')}`} label="xray-summary" />
    </div>
  );
}

function SerpAnalysisView({ result }: { result: SerpResult }) {
  return (
    <div data-testid="serp-results">
      <Tabs defaultValue="position" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="position" className="text-[10px] px-1">Position</TabsTrigger>
          <TabsTrigger value="serp" className="text-[10px] px-1">SERP View</TabsTrigger>
          <TabsTrigger value="competitors" className="text-[10px] px-1">Competitors</TabsTrigger>
          <TabsTrigger value="opportunities" className="text-[10px] px-1">Opportunities</TabsTrigger>
        </TabsList>
        <TabsContent value="position" className="space-y-3 mt-3">
          <div className="border rounded-lg p-3 bg-muted/20 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Prospect Position — "{result.keyword}"</p>
            <SignalRow label="Maps Presence" value={result.prospectPosition.mapsPresence} status={result.prospectPosition.mapsPresence === 'detected' ? 'good' : 'bad'} />
            <SignalRow label="Organic Presence" value={result.prospectPosition.organicPresence} status={result.prospectPosition.organicPresence === 'detected' ? 'good' : 'bad'} />
            <SignalRow label="Best Matching Page" value={result.prospectPosition.bestMatchingPage || 'None'} status={result.prospectPosition.bestMatchingPage ? 'good' : 'bad'} />
            <SignalRow label="Relevance Score" value={`${result.prospectPosition.relevanceScore}/100`} status={result.prospectPosition.relevanceScore > 60 ? 'good' : result.prospectPosition.relevanceScore > 30 ? 'warn' : 'bad'} />
          </div>
        </TabsContent>
        <TabsContent value="serp" className="space-y-2 mt-3">
          <p className="text-[11px] font-medium text-muted-foreground">Search Results Snapshot</p>
          {result.serpSnapshot.map((item, i) => (
            <div key={i} className="border rounded-lg p-2.5 bg-muted/20" data-testid={`serp-item-${i}`}>
              <div className="flex items-center gap-2 mb-0.5"><Badge variant="outline" className="text-[9px] px-1 py-0">{item.type === 'maps' ? 'Map Pack' : item.type === 'ad' ? 'Ad' : `#${item.position}`}</Badge><p className="text-xs text-muted-foreground truncate">{item.domain}</p></div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{item.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="competitors" className="space-y-2 mt-3">
          <p className="text-[11px] font-medium text-muted-foreground">Top Ranking Competitors</p>
          {result.competitors.map((c, i) => (
            <div key={i} className="border rounded-lg p-2.5 bg-muted/20 flex items-start gap-3" data-testid={`competitor-${i}`}>
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">{c.position}</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.domain}</p><p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{c.strength}</p></div>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="opportunities" className="space-y-2 mt-3">
          <p className="text-[11px] font-medium text-muted-foreground">Keyword Opportunities</p>
          {result.opportunities.map((o, i) => (
            <div key={i} className="border rounded-lg p-2.5 bg-muted/20" data-testid={`opportunity-${i}`}>
              <div className="flex items-center gap-2 mb-1"><p className="text-sm font-medium flex-1">{o.keyword}</p><Badge variant="outline" className="text-[9px]">{o.difficulty}</Badge></div>
              <p className="text-xs text-muted-foreground">Est. volume: {o.volume}</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{o.recommendation}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompetitorGapView({ result }: { result: CompetitorGapResult }) {
  const signals = ['servicePages', 'locationPages', 'contentDepth', 'internalLinking', 'reviewSignals'] as const;
  const signalLabels: Record<string, string> = { servicePages: 'Service Pages', locationPages: 'Location Pages', contentDepth: 'Content Depth', internalLinking: 'Internal Linking', reviewSignals: 'Review Signals' };
  return (
    <div className="space-y-3" data-testid="competitor-gap-results">
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/50"><th className="text-left p-2 font-medium text-muted-foreground">Signal</th><th className="text-center p-2 font-medium text-muted-foreground">Prospect</th><th className="text-center p-2 font-medium text-muted-foreground">Competitor Avg</th></tr></thead>
          <tbody>{signals.map((signal) => (<tr key={signal} className="border-t"><td className="p-2 text-muted-foreground">{signalLabels[signal]}</td><td className="p-2 text-center font-medium">{String(result.prospect[signal])}</td><td className="p-2 text-center font-medium">{String(result.competitorAverage[signal])}</td></tr>))}</tbody>
        </table>
      </div>

      {result.insights.length > 0 && (
        <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Key Insights</p>
          {result.insights.map((insight, i) => <p key={i} className="text-xs">• {insight}</p>)}
        </div>
      )}

      {result.competitors?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Competitor Deep Dive</p>
          {result.competitors.map((c, i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30">
                <p className="text-xs font-semibold flex-1">{c.name}</p>
                <Badge variant="outline" className="text-[9px]">{c.servicePages}s / {c.locationPages}l / {c.contentDepth}</Badge>
              </div>
              <div className="p-2.5 space-y-1.5">
                {c.contentAdvantage && (
                  <div className="flex gap-1.5">
                    <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide w-14 shrink-0 pt-0.5">Edge</span>
                    <p className="text-xs text-amber-700 dark:text-amber-400">{c.contentAdvantage}</p>
                  </div>
                )}
                {c.topicsCovered && c.topicsCovered.length > 0 && (
                  <div className="flex gap-1.5">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide w-14 shrink-0 pt-0.5">Topics</span>
                    <div className="flex flex-wrap gap-1">
                      {c.topicsCovered.map((t, ti) => (
                        <Badge key={ti} variant="secondary" className="text-[9px] px-1.5 py-0">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {c.strengths?.length > 0 && (
                  <div className="flex gap-1.5">
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide w-14 shrink-0 pt-0.5">Strengths</span>
                    <ul className="space-y-0.5">
                      {c.strengths.map((s, si) => <li key={si} className="text-xs text-muted-foreground">• {s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.contentGaps && result.contentGaps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Content Gap Analysis</p>
          {result.contentGaps.map((gap, i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30">
                <p className="text-xs font-semibold flex-1">{gap.topic}</p>
                <Badge variant={gap.priority === 'high' ? 'destructive' : gap.priority === 'medium' ? 'secondary' : 'outline'} className="text-[9px]">{gap.priority}</Badge>
              </div>
              <div className="p-2.5 space-y-1">
                <p className="text-xs text-muted-foreground">{gap.competitorExample}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Buyer intent: {gap.buyerIntent}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.strategicWhiteSpace && result.strategicWhiteSpace.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Strategic White Space</p>
          </div>
          {result.strategicWhiteSpace.map((item, i) => <WhiteSpaceCard key={i} item={item} index={i} />)}
        </div>
      )}
    </div>
  );
}

function TrafficForecastView({ result }: { result: ForecastResult }) {
  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const fmtDollar = (n: number) => `$${n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString()}`;
  return (
    <div className="space-y-3" data-testid="forecast-results">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Traffic Opportunity', current: fmtNum(result.currentEstimate.monthlyTraffic), projected: fmtNum(result.projectedEstimate.monthlyTraffic), color: 'text-blue-600' },
          { label: 'Lead Opportunity', current: fmtNum(result.currentEstimate.monthlyLeads), projected: fmtNum(result.projectedEstimate.monthlyLeads), color: 'text-green-600' },
          { label: 'Revenue Opportunity', current: fmtDollar(result.currentEstimate.monthlyRevenue), projected: fmtDollar(result.projectedEstimate.monthlyRevenue), color: 'text-amber-600' },
        ].map((metric) => (
          <div key={metric.label} className="border rounded-lg p-2.5 text-center bg-muted/20">
            <p className="text-[10px] text-muted-foreground mb-1">{metric.label}</p>
            <p className="text-xs text-muted-foreground line-through">{metric.current}/mo</p>
            <p className={`text-lg font-bold ${metric.color}`}>{metric.projected}</p>
            <p className="text-[10px] text-muted-foreground">per month</p>
          </div>
        ))}
      </div>
      {result.growthTimeline.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">12-Month Growth Timeline</p>
          <div className="space-y-1">
            {result.growthTimeline.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted-foreground shrink-0">{m.month}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (m.traffic / (result.projectedEstimate.monthlyTraffic || 1)) * 100)}%` }} />
                </div>
                <span className="w-12 text-right font-medium">{fmtNum(m.traffic)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result.keyDrivers.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">Key Growth Drivers</p>
          {result.keyDrivers.map((d, i) => <p key={i} className="text-sm">• {d}</p>)}
        </div>
      )}
      <div className="border rounded-lg p-2.5 bg-muted/30"><p className="text-[10px] text-muted-foreground italic">Estimates based on: {result.assumptions.join('; ')}</p></div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type ActiveTool = null | 'xray' | 'serp' | 'competitor' | 'forecast';

export default function GrowthPlanSection({ lead, onSaveToNotes, onSaveGrowthPlan, onSaveCompetitorDomains }: {
  lead: Lead | null;
  onSaveToNotes: (text: string) => void;
  onSaveGrowthPlan?: (data: { xray?: any; serp?: any; competitor?: any; forecast?: any; strategyDiagnosis?: any }) => void;
  onSaveCompetitorDomains?: (domains: string[]) => void;
}) {
  const { toast } = useToast();
  const { orgId } = useAuth();

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const [strategyDiagnosis, setStrategyDiagnosis] = useState<StrategyDiagnosis | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  const [xrayResult, setXrayResult] = useState<XRayResult | null>(null);
  const [serpResult, setSerpResult] = useState<SerpResult | null>(null);
  const [competitorResult, setCompetitorResult] = useState<CompetitorGapResult | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [serpKeyword, setSerpKeyword] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [urlLoading, setUrlLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [shareModal, setShareModal] = useState<{ reportId: string; publicSlug: string; strategy: any } | null>(null);
  const [competitorInput, setCompetitorInput] = useState('');
  const [crawledCompetitors, setCrawledCompetitors] = useState<CompetitorAnalysis[]>([]);
  const [competitorAnalysisLoading, setCompetitorAnalysisLoading] = useState(false);
  const [expandedCompetitor, setExpandedCompetitor] = useState<number | null>(null);

  useEffect(() => {
    if (lead?.aiGrowthPlan) {
      const gp = lead.aiGrowthPlan;
      if (gp.xray) setXrayResult(gp.xray);
      if (gp.serp) setSerpResult(gp.serp);
      if (gp.competitor) setCompetitorResult(gp.competitor);
      if (gp.forecast) setForecastResult(gp.forecast);
      if (gp.strategyDiagnosis) setStrategyDiagnosis(gp.strategyDiagnosis);
    } else {
      setXrayResult(null); setSerpResult(null); setCompetitorResult(null);
      setForecastResult(null); setStrategyDiagnosis(null);
    }
    // Restore saved competitor domains
    if (lead?.competitorDomains?.length) {
      setCompetitorInput(lead.competitorDomains.join(', '));
    }
  }, [lead?.id]);

  // Auto-trigger strategy diagnosis when sitemap data is available and no cached result
  useEffect(() => {
    if (
      lead?.id &&
      lead?.sitemapPages?.length &&
      !lead?.aiGrowthPlan?.strategyDiagnosis &&
      !diagnosisLoading
    ) {
      // Small delay to avoid triggering while section is still animating open
      const timer = setTimeout(() => {
        runStrategyDiagnosis();
      }, 600);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const businessName = lead?.companyName || '';
  const websiteUrl = lead?.website || '';
  const location = lead?.territory || lead?.areaName || '';
  const industry = lead?.industry || (lead?.sourceData as any)?.category || (lead?.sourceData as any)?.googleTypes?.[0] || '';
  const reviewCount = lead?.sourceData?.googleReviewCount;
  const rating = lead?.sourceData?.googleRating;

  const saveAll = (patches: { strategyDiagnosis?: any; xray?: any; serp?: any; competitor?: any; forecast?: any }) => {
    onSaveGrowthPlan?.({ xray: xrayResult, serp: serpResult, competitor: competitorResult, forecast: forecastResult, strategyDiagnosis: strategyDiagnosis ?? undefined, ...patches });
  };

  const runStrategyDiagnosis = async () => {
    if (!businessName) { toast({ title: 'Business name required', variant: 'destructive' }); return; }
    setDiagnosisLoading(true); setDiagnosisError(null);
    try {
      const adSpendData = lead?.marketingActivity?.[0] || null;
      const res = await fetch('/api/ai/growth-plan/strategy-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, industry, location,
          sitemapPages: lead?.sitemapPages || [],
          crawledPages: lead?.crawledPages || [],
          crawledCompetitors: crawledCompetitors.length > 0 ? crawledCompetitors : undefined,
          hasGBP: !!(lead?.sourceData as any)?.googleMapsUrl,
          gbpLink: (lead?.sourceData as any)?.googleMapsUrl || null,
          reviewCount: reviewCount ?? null,
          rating: rating ?? null,
          facebookUrl: lead?.facebookUrl || null,
          instagramUrl: lead?.instagramUrl || null,
          linkedinUrl: lead?.linkedinUrl || null,
          conversationNotes: lead?.notes || null,
          conversationInsights: lead?.aiConversationInsights || null,
          objections: lead?.aiObjectionResponses?.map((o: any) => o.objection) || [],
          dealStage: lead?.stage || null,
          mrr: lead?.mrr || null,
          adSpend: adSpendData,
          ahrefsData: lead?.ahrefsData || null,
          strategyIntelligence: lead?.strategyIntelligence || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate strategy analysis');
      const data: StrategyDiagnosis = await res.json();
      const withDate = { ...data, generatedAt: new Date() };
      setStrategyDiagnosis(withDate);
      saveAll({ strategyDiagnosis: withDate });
    } catch (err: any) {
      setDiagnosisError(err.message || 'Failed to generate strategy analysis');
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const analyseCompetitors = async () => {
    const domains = competitorInput.split(/[\n,]+/).map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean);
    if (!domains.length) {
      toast({ title: 'Enter at least one competitor domain', variant: 'destructive' });
      return;
    }
    setCompetitorAnalysisLoading(true);
    setCrawledCompetitors([]);
    const results: CompetitorAnalysis[] = [];
    for (const domain of domains.slice(0, 4)) {
      try {
        const base = `https://${domain}`;
        const sitemapUrl = `${base}/sitemap.xml`;
        const sRes = await fetch(`/api/sitemap?url=${encodeURIComponent(sitemapUrl)}`);
        const sData = sRes.ok ? await sRes.json() : null;
        const sitemapPages: { url: string }[] = (sData?.pages || []).slice(0, 50);
        const totalPages = sData?.totalPages || 0;
        let crawledPages: CrawledPage[] = [];
        if (sitemapPages.length > 0) {
          const cRes = await fetch('/api/crawl-pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: sitemapPages.map(p => p.url), domain }),
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            crawledPages = cData.crawledPages || [];
          }
        }
        results.push({ domain, totalPages, crawledPages });
      } catch {
        results.push({ domain, totalPages: 0, crawledPages: [], error: 'Could not analyse' });
      }
    }
    setCrawledCompetitors(results);
    setCompetitorAnalysisLoading(false);
    const ok = results.filter(r => !r.error && r.crawledPages.length > 0).length;
    // Persist the competitor domains to the lead
    if (domains.length > 0) {
      onSaveCompetitorDomains?.(domains);
    }
    toast({
      title: ok > 0 ? 'Competitors Analysed' : 'Analysis Complete',
      description: ok > 0
        ? `Extracted SEO signals from ${ok} competitor${ok !== 1 ? 's' : ''} · Saved to lead`
        : 'Could not fetch competitor data — check the domains are correct',
    });
  };

  const setToolLoading = (tool: string, val: boolean) => setLoading(p => ({ ...p, [tool]: val }));
  const setToolError = (tool: string, err: string | null) => setErrors(p => ({ ...p, [tool]: err }));

  const runXRay = async () => {
    if (!websiteUrl) { toast({ title: 'No website URL available for this lead', variant: 'destructive' }); return; }
    setActiveTool('xray'); setToolLoading('xray', true); setToolError('xray', null);
    try {
      const res = await fetch('/api/ai/growth-plan/website-xray', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ websiteUrl, businessName, industry, location }) });
      if (!res.ok) throw new Error('Failed to run website x-ray');
      const data = await res.json(); setXrayResult(data); saveAll({ xray: data });
    } catch (err: any) { setToolError('xray', err.message); } finally { setToolLoading('xray', false); }
  };

  const runSerp = async () => {
    if (!businessName) { toast({ title: 'Business name required', variant: 'destructive' }); return; }
    setActiveTool('serp'); setToolLoading('serp', true); setToolError('serp', null);
    try {
      const res = await fetch('/api/ai/growth-plan/serp-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName, websiteUrl, location, industry, keyword: serpKeyword }) });
      if (!res.ok) throw new Error('Failed to analyse search results');
      const data = await res.json(); setSerpResult(data); saveAll({ serp: data });
    } catch (err: any) { setToolError('serp', err.message); } finally { setToolLoading('serp', false); }
  };

  const runCompetitorGap = async () => {
    if (!businessName) { toast({ title: 'Business name required', variant: 'destructive' }); return; }
    setActiveTool('competitor'); setToolLoading('competitor', true); setToolError('competitor', null);
    try {
      const adSpendData = lead?.marketingActivity?.[0] || null;
      const res = await fetch('/api/ai/growth-plan/competitor-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, location, industry,
          serpData: serpResult,
          xrayData: xrayResult?.crawlData,
          crawledPages: lead?.crawledPages || [],
          crawledCompetitors: crawledCompetitors.length > 0 ? crawledCompetitors : undefined,
          strategyDiagnosis: strategyDiagnosis || undefined,
          sitemapPages: lead?.sitemapPages || [],
          conversationNotes: lead?.notes || null,
          dealStage: lead?.stage || null,
          ahrefsData: lead?.ahrefsData || null,
          adSpend: adSpendData,
          strategyIntelligence: lead?.strategyIntelligence || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to analyse competitor gap');
      const data = await res.json(); setCompetitorResult(data); saveAll({ competitor: data });
    } catch (err: any) { setToolError('competitor', err.message); } finally { setToolLoading('competitor', false); }
  };

  const runForecast = async () => {
    if (!businessName) { toast({ title: 'Business name required', variant: 'destructive' }); return; }
    setActiveTool('forecast'); setToolLoading('forecast', true); setToolError('forecast', null);
    try {
      const res = await fetch('/api/ai/growth-plan/traffic-forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName, websiteUrl, location, industry, reviewCount, rating, serpData: serpResult, xrayData: xrayResult?.crawlData }) });
      if (!res.ok) throw new Error('Failed to generate forecast');
      const data = await res.json(); setForecastResult(data); saveAll({ forecast: data });
    } catch (err: any) { setToolError('forecast', err.message); } finally { setToolLoading('forecast', false); }
  };

  const generatePdf = async () => {
    if (!businessName) { toast({ title: 'Business name required to generate PDF', variant: 'destructive' }); return; }
    setPdfLoading(true);
    try {
      const competitors = competitorInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const gbpLink = (lead?.sourceData as any)?.googleMapsUrl || null;

      // Generate structured 12-month strategy from AI
      const res = await fetch('/api/ai/growth-plan/twelve-month-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, industry, location,
          strategyDiagnosis: strategyDiagnosis || undefined,
          sitemapPages: lead?.sitemapPages || [],
          crawledPages: lead?.crawledPages || [],
          crawledCompetitors: crawledCompetitors.length > 0 ? crawledCompetitors : undefined,
          reviewCount: reviewCount ?? null,
          rating: rating ?? null,
          gbpLink,
          facebookUrl: lead?.facebookUrl || null,
          instagramUrl: lead?.instagramUrl || null,
          linkedinUrl: lead?.linkedinUrl || null,
          competitors,
          conversationNotes: lead?.notes || null,
          conversationInsights: lead?.aiConversationInsights || null,
          objections: lead?.aiObjectionResponses?.map((o: any) => o.objection) || [],
          dealStage: lead?.stage || null,
          mrr: lead?.mrr || null,
          adSpend: lead?.marketingActivity?.[0] || null,
          ahrefsData: lead?.ahrefsData || null,
          strategyIntelligence: lead?.strategyIntelligence || null,
        }),
      });
      if (!res.ok) throw new Error('Strategy generation failed');
      const s = await res.json();

      // ── PDF GENERATION ─────────────────────────────────────────────────────
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const M = 18; // margin
      const CW = PW - M * 2; // content width
      let y = 0;

      const DARK = [13, 17, 35] as const;
      const BLUE = [37, 99, 235] as const;
      const GREEN = [21, 128, 61] as const;
      const AMBER = [180, 83, 9] as const;
      const RED = [185, 28, 28] as const;
      const BODY = [30, 41, 59] as const;
      const MUTED = [148, 163, 184] as const;
      const WHITE = [255, 255, 255] as const;
      const BG_LIGHT = [248, 250, 252] as const;

      const newPage = () => { doc.addPage(); y = M; };
      const checkY = (need: number) => { if (y + need > PH - 15) newPage(); };

      const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: readonly number[] = BODY) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        doc.setTextColor(color[0], color[1], color[2]);
      };

      const sectionHeading = (title: string, subtitle?: string) => {
        checkY(18);
        doc.setFillColor(DARK[0], DARK[1], DARK[2]);
        doc.rect(M, y, CW, 9, 'F');
        setFont(9.5, 'bold', WHITE);
        doc.text(title.toUpperCase(), M + 3, y + 6);
        if (subtitle) {
          setFont(8, 'normal', MUTED);
          doc.text(subtitle, PW - M - 3, y + 6, { align: 'right' });
        }
        y += 13;
      };

      const bodyText = (text: string, opts?: { indent?: number; color?: readonly number[]; size?: number; style?: 'normal' | 'bold' }) => {
        checkY(6);
        setFont(opts?.size || 9, opts?.style || 'normal', opts?.color || BODY);
        const lines = doc.splitTextToSize(text, CW - (opts?.indent || 0));
        for (const line of lines) {
          checkY(5); doc.text(line, M + (opts?.indent || 0), y); y += 4.5;
        }
      };

      const bulletPoint = (text: string, color?: readonly number[]) => {
        checkY(5);
        setFont(8.5, 'normal', color || BODY);
        doc.text('•', M + 2, y);
        const lines = doc.splitTextToSize(text, CW - 8);
        for (const line of lines) { checkY(5); doc.text(line, M + 7, y); y += 4.5; }
      };

      const divider = (light = false) => {
        y += 2;
        doc.setDrawColor(light ? 226 : 203, light ? 232 : 213, light ? 240 : 224);
        doc.setLineWidth(0.3);
        doc.line(M, y, M + CW, y);
        y += 4;
      };

      // ── COVER PAGE ──────────────────────────────────────────────────────────
      doc.setFillColor(DARK[0], DARK[1], DARK[2]);
      doc.rect(0, 0, PW, PH, 'F');

      // Accent bar
      doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
      doc.rect(0, 0, 4, PH, 'F');

      // Prepared for chip
      doc.setFillColor(37, 50, 80);
      doc.roundedRect(M, 55, 60, 7, 1, 1, 'F');
      setFont(7.5, 'normal', MUTED);
      doc.text('PREPARED FOR', M + 30, 59.8, { align: 'center' });

      setFont(26, 'bold', WHITE);
      doc.text(businessName, PW / 2, 80, { align: 'center', maxWidth: CW });

      setFont(13, 'normal', MUTED);
      doc.text(`${industry || ''}${industry && location ? '  ·  ' : ''}${location || ''}`, PW / 2, 92, { align: 'center' });

      // Score badge if available
      if (strategyDiagnosis) {
        const scoreColor = strategyDiagnosis.readinessScore >= 70 ? GREEN : strategyDiagnosis.readinessScore >= 45 ? AMBER : RED;
        doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.roundedRect(PW / 2 - 22, 105, 44, 18, 2, 2, 'F');
        setFont(16, 'bold', WHITE);
        doc.text(`${strategyDiagnosis.readinessScore}`, PW / 2, 116, { align: 'center' });
        setFont(7, 'normal', WHITE);
        doc.text('Growth Readiness Score', PW / 2, 121, { align: 'center' });
      }

      setFont(10, 'bold', WHITE);
      doc.text('12-Month Marketing Growth Strategy', PW / 2, 140, { align: 'center' });

      setFont(8.5, 'normal', MUTED);
      const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(`Prepared ${dateStr}`, PW / 2, 152, { align: 'center' });

      // Key numbers row
      if (strategyDiagnosis?.growthPotential?.forecastBand) {
        const fb = strategyDiagnosis.growthPotential.forecastBand;
        const boxes = [
          { label: 'Additional Impressions', value: fb.additionalImpressions },
          { label: 'Additional Visitors', value: fb.additionalVisitors },
          { label: 'Additional Enquiries', value: fb.additionalEnquiries },
        ];
        const boxW = (CW - 8) / 3;
        boxes.forEach((b, i) => {
          const bx = M + i * (boxW + 4);
          doc.setFillColor(37, 50, 80);
          doc.roundedRect(bx, 170, boxW, 18, 1.5, 1.5, 'F');
          setFont(10, 'bold', WHITE);
          doc.text(b.value, bx + boxW / 2, 180, { align: 'center' });
          setFont(6.5, 'normal', MUTED);
          doc.text(b.label, bx + boxW / 2, 185, { align: 'center' });
        });
      }

      if (strategyDiagnosis?.insightSentence) {
        doc.setFillColor(37, 50, 80);
        doc.roundedRect(M, 200, CW, 16, 2, 2, 'F');
        setFont(8.5, 'italic', MUTED);
        doc.text(`"${strategyDiagnosis.insightSentence}"`, PW / 2, 210, { align: 'center', maxWidth: CW - 8 });
      }

      setFont(7.5, 'normal', [60, 80, 110] as const);
      doc.text('Confidential — Prepared by Momentum Agent  ·  battlescore.com.au', PW / 2, PH - 10, { align: 'center' });

      // ── EXECUTIVE SUMMARY ──────────────────────────────────────────────────
      newPage();
      sectionHeading('Executive Summary');

      if (s.executiveSummary) {
        const es = s.executiveSummary;
        if (es.currentChallenge) {
          doc.setFillColor(239, 246, 255);
          doc.roundedRect(M, y, CW, 1, 1, 1, 'F');
          checkY(12);
          doc.setFillColor(239, 246, 255);
          const challengeLines = doc.splitTextToSize(es.currentChallenge, CW - 8);
          const boxH = challengeLines.length * 4.5 + 8;
          doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'F');
          doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
          doc.rect(M, y, 2.5, boxH, 'F');
          setFont(8, 'bold', BODY);
          doc.text('Current Challenge', M + 5, y + 5);
          setFont(8.5, 'normal', BODY);
          let ty = y + 10;
          for (const line of challengeLines) { doc.text(line, M + 5, ty); ty += 4.5; }
          y += boxH + 4;
        }

        if (es.primaryGoal) { y += 2; bodyText(`Goal: ${es.primaryGoal}`, { style: 'bold', size: 9 }); y += 1; }
        if (es.growthTarget) { bodyText(es.growthTarget, { color: GREEN }); y += 2; }

        if (es.coreServices?.length) {
          bodyText('Core Services:', { style: 'bold', size: 8.5 }); y += 1;
          es.coreServices.forEach((s: string) => bulletPoint(s));
          y += 3;
        }

        if (es.primaryChannels?.length) {
          bodyText('Primary Growth Channels:', { style: 'bold', size: 8.5 }); y += 1;
          es.primaryChannels.forEach((c: string) => bulletPoint(c));
        }
      }

      // ── MARKET OPPORTUNITY ─────────────────────────────────────────────────
      if (s.marketOpportunity) {
        y += 6; checkY(30);
        sectionHeading('Market Opportunity Analysis');
        const mo = s.marketOpportunity;

        // Stats row
        const stats = [
          { label: 'Est. Monthly Searches', value: mo.totalMonthlySearches?.toLocaleString?.() || '—' },
          { label: 'Current Capture', value: mo.currentCapture || '—' },
          { label: 'Potential Capture', value: mo.potentialCapture || '—' },
        ];
        const sw = (CW - 6) / 3;
        stats.forEach((stat, i) => {
          const bx = M + i * (sw + 3);
          doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
          doc.roundedRect(bx, y, sw, 16, 1.5, 1.5, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(bx, y, sw, 16, 1.5, 1.5, 'S');
          setFont(11, 'bold', BLUE);
          doc.text(String(stat.value), bx + sw / 2, y + 8, { align: 'center' });
          setFont(6.5, 'normal', MUTED);
          doc.text(stat.label, bx + sw / 2, y + 13, { align: 'center' });
        });
        y += 22;

        if (mo.keyInsight) {
          doc.setFillColor(254, 252, 232);
          const kiLines = doc.splitTextToSize(mo.keyInsight, CW - 10);
          const kiH = kiLines.length * 4.5 + 8;
          doc.roundedRect(M, y, CW, kiH, 1.5, 1.5, 'F');
          doc.setFillColor(AMBER[0], AMBER[1], AMBER[2]);
          doc.rect(M, y, 2.5, kiH, 'F');
          setFont(8.5, 'italic', BODY);
          let ty = y + 5.5;
          for (const line of kiLines) { doc.text(line, M + 5, ty); ty += 4.5; }
          y += kiH + 5;
        }

        // Keyword table
        if (mo.keywords?.length) {
          bodyText('Keyword Opportunity Map', { style: 'bold', size: 8.5 }); y += 2;
          const cols = [{ w: CW * 0.42, label: 'Keyword' }, { w: CW * 0.18, label: 'Monthly Searches' }, { w: CW * 0.18, label: 'Current Rank' }, { w: CW * 0.22, label: 'Opportunity' }];
          // Header
          doc.setFillColor(DARK[0], DARK[1], DARK[2]);
          doc.rect(M, y, CW, 7, 'F');
          let cx = M;
          setFont(7.5, 'bold', WHITE);
          cols.forEach(col => { doc.text(col.label, cx + col.w / 2, y + 4.8, { align: 'center' }); cx += col.w; });
          y += 7;
          mo.keywords.slice(0, 8).forEach((kw: any, i: number) => {
            checkY(7);
            doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
            doc.rect(M, y, CW, 6.5, 'F');
            let kx = M;
            setFont(8, 'normal', BODY);
            const kwLines = doc.splitTextToSize(kw.keyword || '', cols[0].w - 2);
            doc.text(kwLines[0] || '', kx + 2, y + 4.5);
            kx += cols[0].w;
            setFont(8, 'normal', BLUE);
            doc.text(String(kw.monthlySearches || '—'), kx + cols[1].w / 2, y + 4.5, { align: 'center' });
            kx += cols[1].w;
            setFont(8, 'normal', MUTED);
            doc.text(String(kw.currentRank || '—'), kx + cols[2].w / 2, y + 4.5, { align: 'center' });
            kx += cols[2].w;
            const oppColor = kw.opportunity === 'high' ? GREEN : kw.opportunity === 'medium' ? AMBER : MUTED;
            setFont(7.5, 'bold', oppColor);
            doc.text((kw.opportunity || '').toUpperCase(), kx + cols[3].w / 2, y + 4.5, { align: 'center' });
            y += 6.5;
          });
          y += 4;
        }
      }

      // ── DIGITAL ASSET AUDIT ────────────────────────────────────────────────
      if (s.digitalAudit) {
        y += 4; checkY(30);
        sectionHeading('Digital Asset Audit');
        const da = s.digitalAudit;

        const auditBlock = (title: string, score: number, strengths: string[], gaps: string[]) => {
          checkY(20);
          const scoreColor = score >= 70 ? GREEN : score >= 45 ? AMBER : RED;
          doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
          doc.roundedRect(M, y, CW, 7, 1.5, 1.5, 'F');
          setFont(9, 'bold', BODY);
          doc.text(title, M + 3, y + 5);
          doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
          doc.roundedRect(M + CW - 22, y + 1, 19, 5, 1, 1, 'F');
          setFont(8, 'bold', WHITE);
          doc.text(`${score}/100`, M + CW - 12.5, y + 5, { align: 'center' });
          y += 10;
          if (strengths?.length) {
            setFont(7.5, 'bold', GREEN); doc.text('Strengths', M + 2, y); y += 4;
            strengths.slice(0, 3).forEach(s => bulletPoint(s, BODY));
          }
          if (gaps?.length) {
            y += 1; setFont(7.5, 'bold', RED); doc.text('Gaps', M + 2, y); y += 4;
            gaps.slice(0, 3).forEach(g => bulletPoint(g, BODY));
          }
          y += 5;
        };

        if (da.website) auditBlock('Website', da.website.score || 0, da.website.strengths || [], da.website.gaps || []);
        if (da.gbp) auditBlock(`Google Business Profile${da.gbp.reviews ? ` — ${da.gbp.reviews} reviews, ${da.gbp.rating}★` : ''}`, da.gbp.score || 0, da.gbp.strengths || [], da.gbp.gaps || []);
        if (da.authority) auditBlock('Authority & Trust Signals', da.authority.score || 0, da.authority.socialProfiles?.map((p: string) => p + ' profile found') || [], da.authority.gaps || []);
      }

      // ── GROWTH PILLARS ─────────────────────────────────────────────────────
      if (s.growthPillars?.length) {
        y += 4; checkY(30);
        sectionHeading('Growth Strategy — 4 Pillars');
        s.growthPillars.forEach((pillar: any) => {
          checkY(20);
          doc.setFillColor(DARK[0], DARK[1], DARK[2]);
          doc.roundedRect(M, y, 10, 10, 1, 1, 'F');
          setFont(11, 'bold', WHITE);
          doc.text(String(pillar.number || ''), M + 5, y + 7.5, { align: 'center' });
          setFont(10, 'bold', BODY);
          doc.text(pillar.title || '', M + 13, y + 4.5);
          setFont(8, 'normal', MUTED);
          doc.text(`${pillar.timeframe || ''}  ·  ${pillar.goal || ''}`, M + 13, y + 9);
          y += 15;
          if (pillar.actions?.length) {
            pillar.actions.slice(0, 3).forEach((act: any) => {
              checkY(8);
              bulletPoint(act.action || '', BLUE);
              if (act.detail) bodyText(act.detail, { indent: 7, color: MUTED, size: 8 });
              if (act.examples?.length) bodyText('e.g. ' + act.examples.join(', '), { indent: 7, color: MUTED, size: 7.5 });
              y += 1;
            });
          }
          y += 5; divider(true);
        });
      }

      // ── MONTHLY ROADMAP ────────────────────────────────────────────────────
      if (s.monthlyRoadmap?.length) {
        y += 4; checkY(40);
        sectionHeading('12-Month Execution Roadmap');
        const cols2 = [{ w: CW * 0.16, label: 'Period' }, { w: CW * 0.13, label: 'Phase' }, { w: CW * 0.47, label: 'Focus Areas' }, { w: CW * 0.14, label: 'Est. Leads' }];
        doc.setFillColor(DARK[0], DARK[1], DARK[2]);
        doc.rect(M, y, CW, 7, 'F');
        let cx2 = M;
        setFont(7.5, 'bold', WHITE);
        cols2.forEach(col => { doc.text(col.label, cx2 + col.w / 2, y + 4.8, { align: 'center' }); cx2 += col.w; });
        y += 7;

        s.monthlyRoadmap.forEach((row: any, i: number) => {
          const focusText = Array.isArray(row.focus) ? row.focus.join(' · ') : (row.focus || '');
          const focusLines = doc.splitTextToSize(focusText, cols2[2].w - 4);
          const rowH = Math.max(7, focusLines.length * 4.5 + 3);
          checkY(rowH);
          doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
          doc.rect(M, y, CW, rowH, 'F');
          let rx = M;
          setFont(7.5, 'bold', BODY); doc.text(row.period || '', rx + 2, y + 4.5); rx += cols2[0].w;
          setFont(7.5, 'normal', MUTED); doc.text(row.phase || '', rx + cols2[1].w / 2, y + 4.5, { align: 'center' }); rx += cols2[1].w;
          setFont(7.5, 'normal', BODY);
          for (let fl = 0; fl < focusLines.length; fl++) { doc.text(focusLines[fl], rx + 2, y + 4.5 + fl * 4.5); }
          rx += cols2[2].w;
          setFont(7.5, 'bold', GREEN); doc.text(row.estimatedLeads || '—', rx + cols2[3].w / 2, y + 4.5, { align: 'center' });
          y += rowH;
        });
        y += 5;

        // Milestone notes
        s.monthlyRoadmap.forEach((row: any) => {
          if (row.milestone) { checkY(7); bulletPoint(`${row.period}: ${row.milestone}`, MUTED); }
        });
      }

      // ── PROJECTED OUTCOMES ─────────────────────────────────────────────────
      if (s.projectedOutcomes?.length) {
        y += 6; checkY(30);
        sectionHeading('Projected Outcomes');
        const ow = (CW - (s.projectedOutcomes.length - 1) * 3) / s.projectedOutcomes.length;
        s.projectedOutcomes.forEach((outcome: any, i: number) => {
          const ox = M + i * (ow + 3);
          const confColor = outcome.confidence === 'high' ? GREEN : outcome.confidence === 'medium' ? AMBER : MUTED;
          doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
          doc.roundedRect(ox, y, ow, 22, 1.5, 1.5, 'F');
          doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
          doc.roundedRect(ox, y, ow, 22, 1.5, 1.5, 'S');
          setFont(8.5, 'bold', MUTED); doc.text(outcome.month || `Month ${i * 3 + 3}`, ox + ow / 2, y + 6, { align: 'center' });
          setFont(12, 'bold', BLUE); doc.text(String(outcome.estimatedLeads || '—'), ox + ow / 2, y + 13.5, { align: 'center' });
          setFont(7, 'normal', MUTED); doc.text('leads/mo', ox + ow / 2, y + 17, { align: 'center' });
          setFont(6, 'bold', confColor); doc.text((outcome.confidence || '').toUpperCase(), ox + ow / 2, y + 20.5, { align: 'center' });
        });
        y += 28;
      }

      // ── KPIs ───────────────────────────────────────────────────────────────
      if (s.kpis?.length) {
        y += 4; checkY(30);
        sectionHeading('Key Performance Indicators');
        const kcols = [{ w: CW * 0.45, label: 'Metric' }, { w: CW * 0.25, label: 'Baseline' }, { w: CW * 0.3, label: '12-Month Target' }];
        doc.setFillColor(DARK[0], DARK[1], DARK[2]);
        doc.rect(M, y, CW, 7, 'F');
        let kx = M;
        setFont(7.5, 'bold', WHITE);
        kcols.forEach(col => { doc.text(col.label, kx + col.w / 2, y + 4.8, { align: 'center' }); kx += col.w; });
        y += 7;
        s.kpis.forEach((kpi: any, i: number) => {
          checkY(7);
          doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
          doc.rect(M, y, CW, 6.5, 'F');
          let kx2 = M;
          setFont(8, 'bold', BODY); doc.text(kpi.metric || '', kx2 + 2, y + 4.5); kx2 += kcols[0].w;
          setFont(8, 'normal', MUTED); doc.text(String(kpi.baseline || '—'), kx2 + kcols[1].w / 2, y + 4.5, { align: 'center' }); kx2 += kcols[1].w;
          setFont(8, 'bold', GREEN); doc.text(String(kpi.target12Month || '—'), kx2 + kcols[2].w / 2, y + 4.5, { align: 'center' });
          y += 6.5;
        });
      }

      // ── REP TALKING POINTS ─────────────────────────────────────────────────
      if (s.repTalkingPoints?.length) {
        y += 6; checkY(20);
        sectionHeading('Sales Talking Points', 'Use these on the call');
        s.repTalkingPoints.forEach((point: string) => {
          checkY(10);
          doc.setFillColor(239, 246, 255);
          const ptLines = doc.splitTextToSize(`"${point}"`, CW - 10);
          const ptH = ptLines.length * 4.5 + 7;
          doc.roundedRect(M, y, CW, ptH, 1.5, 1.5, 'F');
          doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
          doc.rect(M, y, 2.5, ptH, 'F');
          setFont(8.5, 'italic', BODY);
          let ty = y + 5;
          for (const line of ptLines) { doc.text(line, M + 5, ty); ty += 4.5; }
          y += ptH + 3;
        });
      }

      // Footer on all pages
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        doc.setPage(pg);
        if (pg > 1) {
          doc.setFillColor(DARK[0], DARK[1], DARK[2]);
          doc.rect(0, PH - 10, PW, 10, 'F');
          setFont(7, 'normal', MUTED);
          doc.text(businessName, M, PH - 5);
          doc.text('12-Month Marketing Growth Strategy', PW / 2, PH - 5, { align: 'center' });
          doc.text(`Page ${pg} of ${totalPages}`, PW - M, PH - 5, { align: 'right' });
        }
      }

      const fileName = `${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_12Month_Growth_Strategy.pdf`;
      doc.save(fileName);
      toast({ title: 'Strategy PDF downloaded', description: 'Professional 12-month strategy document saved.' });
    } catch (err: any) {
      console.error('[generatePdf]', err);
      toast({ title: 'Failed to generate PDF', description: err.message, variant: 'destructive' });
    } finally { setPdfLoading(false); }
  };

  const generateReportUrl = async () => {
    if (!lead || !orgId) { toast({ title: 'Missing lead or org data', variant: 'destructive' }); return; }
    if (!businessName) { toast({ title: 'Business name required', variant: 'destructive' }); return; }
    const user = auth.currentUser;
    if (!user) { toast({ title: 'Not authenticated', variant: 'destructive' }); return; }
    setUrlLoading(true);
    try {
      const token = await user.getIdToken();
      const competitors = competitorInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const gbpLink = (lead?.sourceData as any)?.googleMapsUrl || null;

      // Generate 12-month strategy
      const stratRes = await fetch('/api/ai/growth-plan/twelve-month-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, industry, location,
          strategyDiagnosis: strategyDiagnosis || undefined,
          sitemapPages: lead?.sitemapPages || [],
          crawledPages: lead?.crawledPages || [],
          crawledCompetitors: crawledCompetitors.length > 0 ? crawledCompetitors : undefined,
          reviewCount: reviewCount ?? null,
          rating: rating ?? null,
          gbpLink,
          facebookUrl: lead?.facebookUrl || null,
          instagramUrl: lead?.instagramUrl || null,
          linkedinUrl: lead?.linkedinUrl || null,
          competitors,
          conversationNotes: lead?.notes || null,
          conversationInsights: lead?.aiConversationInsights || null,
          objections: lead?.aiObjectionResponses?.map((o: any) => o.objection) || [],
          dealStage: lead?.stage || null,
          mrr: lead?.mrr || null,
          adSpend: lead?.marketingActivity?.[0] || null,
          ahrefsData: lead?.ahrefsData || null,
          strategyIntelligence: lead?.strategyIntelligence || null,
        }),
      });
      if (!stratRes.ok) throw new Error('Strategy generation failed');
      const strategy = await stratRes.json();

      // Save as a strategy report (public landing page)
      const reportData = {
        businessName,
        industry: industry || '',
        location: location || '',
        websiteUrl: websiteUrl || '',
        orgId,
        leadId: lead.id,
        preparedBy: user.displayName || 'Momentum Agent',
        preparedByEmail: user.email || '',
        strategyDiagnosis: strategyDiagnosis || null,
        strategy,
      };

      const saveRes = await fetch('/api/strategy-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(reportData),
      });
      if (!saveRes.ok) throw new Error('Failed to save strategy report');
      const { id, publicSlug } = await saveRes.json();
      const fullUrl = `${window.location.origin}/strategy/${publicSlug || id}`;
      setGeneratedUrl(fullUrl);
      setShareModal({ reportId: id, publicSlug: publicSlug || '', strategy });
    } catch (err: any) {
      toast({ title: 'Failed to generate strategy page', description: err.message, variant: 'destructive' });
    } finally { setUrlLoading(false); }
  };

  const copyReportUrl = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).catch(() => {
      const ta = document.createElement('textarea'); ta.value = generatedUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    });
    setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000);
  };

  const tools = [
    { key: 'xray' as const, label: 'Run Website X-Ray', icon: Globe, action: runXRay, hasResult: !!xrayResult, needsWebsite: true },
    { key: 'serp' as const, label: 'Visualise Search Results', icon: Search, action: () => { if (activeTool === 'serp' || serpResult) { runSerp(); } else { setActiveTool('serp'); } }, hasResult: !!serpResult },
    { key: 'competitor' as const, label: 'Analyse Competitor Gap', icon: BarChart3, action: runCompetitorGap, hasResult: !!competitorResult },
    { key: 'forecast' as const, label: 'Forecast Traffic & Revenue', icon: TrendingUp, action: runForecast, hasResult: !!forecastResult },
  ];

  return (
    <>
    <div className="space-y-3" data-testid="growth-plan-section">

      {/* ── AI Strategy Engine ─────────────────────────────────── */}
      {!strategyDiagnosis && !diagnosisLoading && (
        <div className="border border-dashed rounded-lg p-4 text-center space-y-2 bg-muted/10">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm font-medium">Generate AI Strategy Analysis</p>
          </div>
          <p className="text-xs text-muted-foreground">
            AI will analyse the website structure, service/location signals, GBP, reviews, and competitors to show where {businessName || 'this business'} is today and where it could be.
          </p>
          <Button onClick={runStrategyDiagnosis} disabled={!businessName} className="gap-2 h-8 text-sm" data-testid="button-generate-strategy">
            <Sparkles className="h-3.5 w-3.5" /> Analyse Growth Position
          </Button>
          {diagnosisError && <InlineError error={diagnosisError} onRetry={runStrategyDiagnosis} />}
        </div>
      )}

      {diagnosisLoading && (
        <div className="border rounded-lg p-6 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Analysing growth position...</p>
            <p className="text-xs text-muted-foreground mt-1">Classifying website structure, scoring visibility signals, identifying gaps</p>
          </div>
        </div>
      )}

      {strategyDiagnosis && !diagnosisLoading && (
        <StrategyDiagnosisView diagnosis={strategyDiagnosis} onRegenerate={runStrategyDiagnosis} loading={diagnosisLoading} />
      )}

      {diagnosisError && strategyDiagnosis && <InlineError error={diagnosisError} onRetry={runStrategyDiagnosis} />}

      <Separator />

      {/* ── Supporting Analysis Tools ──────────────────────────── */}
      <button
        onClick={() => setToolsExpanded(p => !p)}
        className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        data-testid="button-toggle-tools"
      >
        {toolsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">Supporting Analysis Tools</span>
        <span className="ml-auto text-[10px]">{tools.filter(t => t.hasResult).length}/{tools.length} run</span>
      </button>

      {toolsExpanded && (
        <div className="space-y-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isLoading = loading[tool.key];
            const isActive = activeTool === tool.key;
            const disabled = isLoading || (tool.needsWebsite && !websiteUrl);
            return (
              <div key={tool.key}>
                <Button
                  variant={tool.hasResult ? 'default' : 'outline'}
                  onClick={() => { if (tool.hasResult && activeTool !== tool.key) { setActiveTool(tool.key); } else { tool.action(); } }}
                  disabled={disabled}
                  className="w-full h-9 text-sm gap-2 justify-start"
                  data-testid={`button-${tool.key}`}
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  {isLoading ? 'Analysing...' : tool.label}
                  {tool.hasResult && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-green-500" />}
                </Button>

                {tool.key === 'serp' && isActive && !serpResult && !isLoading && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-xs">Search Keyword</Label>
                      <Input value={serpKeyword} onChange={e => setSerpKeyword(e.target.value)} placeholder={`e.g. ${industry || 'plumber'} ${location || 'near me'}`} className="h-8 text-sm" data-testid="input-serp-keyword" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for AI-suggested keywords</p>
                    </div>
                    <Button onClick={runSerp} size="sm" className="w-full h-8 text-sm gap-2" data-testid="button-run-serp">
                      <Search className="h-3.5 w-3.5" /> Run Analysis
                    </Button>
                  </div>
                )}

                <InlineError error={errors[tool.key] || null} onRetry={tool.action} />
                {isActive && tool.key === 'xray' && xrayResult && <div className="mt-3"><WebsiteXRayView result={xrayResult} /></div>}
                {isActive && tool.key === 'serp' && serpResult && <div className="mt-3"><SerpAnalysisView result={serpResult} /></div>}
                {isActive && tool.key === 'competitor' && competitorResult && <div className="mt-3"><CompetitorGapView result={competitorResult} /></div>}
                {isActive && tool.key === 'forecast' && forecastResult && <div className="mt-3"><TrafficForecastView result={forecastResult} /></div>}
              </div>
            );
          })}
        </div>
      )}

      <Separator />

      {/* ── PDF + Report URL ───────────────────────────────────── */}
      <div className="space-y-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-3 w-3" /> Competitor websites
            {lead?.competitorDomains?.length ? (
              <span className="ml-auto text-[10px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" /> {lead.competitorDomains.length} saved to lead
              </span>
            ) : null}
          </Label>
          <div className="flex gap-1.5">
            <Input
              value={competitorInput}
              onChange={e => setCompetitorInput(e.target.value)}
              onBlur={() => {
                const domains = competitorInput.split(/[\n,]+/).map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean);
                if (domains.length > 0) onSaveCompetitorDomains?.(domains);
              }}
              placeholder="e.g. besa.au, lindonhomes.com.au"
              className="h-8 text-xs flex-1"
              data-testid="input-competitors"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={analyseCompetitors}
              disabled={competitorAnalysisLoading || !competitorInput.trim()}
              className="h-8 px-2.5 text-xs gap-1 shrink-0"
              data-testid="button-analyse-competitors"
            >
              {competitorAnalysisLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analysing…</>
                : <><ScanLine className="h-3 w-3" /> Analyse</>}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Domains are saved to this lead. Click Analyse to deep-crawl and extract SEO signals for gap comparison.</p>

          {/* Competitor analysis results */}
          {crawledCompetitors.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {crawledCompetitors.map((comp, idx) => {
                const isOpen = expandedCompetitor === idx;
                const okPages = comp.crawledPages.filter(p => !p.error);
                const servicePages = okPages.filter(p => {
                  const path = (() => { try { return new URL(p.url).pathname.toLowerCase(); } catch { return p.url.toLowerCase(); } })();
                  return /service|solution|offer/i.test(path);
                });
                const locationPages = okPages.filter(p => {
                  const path = (() => { try { return new URL(p.url).pathname.toLowerCase(); } catch { return p.url.toLowerCase(); } })();
                  return /location|area|suburb|city/i.test(path);
                });
                const schemas = Array.from(new Set(okPages.flatMap(p => p.schemaTypes || [])));
                return (
                  <div key={idx} className="rounded border bg-muted/30 overflow-hidden">
                    <button
                      onClick={() => setExpandedCompetitor(isOpen ? null : idx)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${comp.error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      <span className="text-xs font-medium flex-1 truncate">{comp.domain}</span>
                      {!comp.error && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {comp.totalPages} pages · {okPages.length} crawled
                        </span>
                      )}
                      {isOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-2.5 pb-2.5 space-y-2 text-[10px]">
                        {comp.error ? (
                          <p className="text-red-500">{comp.error}</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div className="bg-background rounded p-1.5 text-center">
                                <p className="font-semibold text-sm">{comp.totalPages}</p>
                                <p className="text-muted-foreground">Total pages</p>
                              </div>
                              <div className="bg-background rounded p-1.5 text-center">
                                <p className="font-semibold text-sm">{servicePages.length}</p>
                                <p className="text-muted-foreground">Service pages</p>
                              </div>
                              <div className="bg-background rounded p-1.5 text-center">
                                <p className="font-semibold text-sm">{locationPages.length}</p>
                                <p className="text-muted-foreground">Location pages</p>
                              </div>
                            </div>
                            {schemas.length > 0 && (
                              <div>
                                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Schema markup</p>
                                <div className="flex flex-wrap gap-1">
                                  {schemas.map((s, i) => <span key={i} className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded px-1 py-0.5">{s}</span>)}
                                </div>
                              </div>
                            )}
                            {okPages.slice(0, 8).map((p, pi) => {
                              const path = (() => { try { return new URL(p.url).pathname || '/'; } catch { return p.url; } })();
                              return (
                                <div key={pi} className="border-t pt-1.5">
                                  <p className="font-medium text-foreground/80 truncate">{path}</p>
                                  {p.title && <p className="text-muted-foreground truncate">Title: {p.title}</p>}
                                  {p.h1 && <p className="text-foreground/70 truncate">H1: {p.h1}</p>}
                                  {p.h2s?.length ? <p className="text-muted-foreground truncate">H2s: {p.h2s.slice(0, 2).join(' · ')}</p> : null}
                                </div>
                              );
                            })}
                            {okPages.length > 8 && <p className="text-muted-foreground">+{okPages.length - 8} more pages analysed</p>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Generate a professional 12-month strategy document to send after your call.</p>
        <Button onClick={generatePdf} disabled={pdfLoading || !businessName} className="w-full h-9 text-sm gap-2" data-testid="button-generate-pdf">
          {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          {pdfLoading ? 'Building strategy...' : 'Generate 12-Month Strategy PDF'}
        </Button>
        <Button onClick={generateReportUrl} disabled={urlLoading || !businessName} variant="outline" className="w-full h-9 text-sm gap-2" data-testid="button-generate-report-url">
          {urlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
          {urlLoading ? 'Building strategy page...' : 'Generate Prospect Strategy Page'}
        </Button>
        {generatedUrl && shareModal && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Prospect strategy page — ready to share</p>
            <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/40">
              <p className="text-xs text-muted-foreground truncate flex-1">{generatedUrl}</p>
              <Button size="sm" variant="ghost" onClick={copyReportUrl} className="h-7 shrink-0 gap-1 text-xs" data-testid="button-copy-report-url">
                {urlCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {urlCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <Button size="sm" variant="default" onClick={() => setShareModal(shareModal)} className="w-full h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-open-share-modal">
              <Sparkles className="h-3 w-3" /> Share with AI Email
            </Button>
          </div>
        )}
      </div>
    </div>

    {shareModal && (
      <ShareStrategyModal
        reportId={shareModal.reportId}
        publicSlug={shareModal.publicSlug}
        orgId={orgId || ''}
        businessName={businessName || ''}
        industry={industry}
        location={location}
        website={websiteUrl}
        strategyDiagnosis={strategyDiagnosis}
        strategy={shareModal.strategy}
        conversationNotes={lead?.notes}
        servicesDiscussed={lead?.industry}
        onClose={() => setShareModal(null)}
      />
    )}
    </>
  );
}
