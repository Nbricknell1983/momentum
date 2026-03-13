import { useState, useCallback, useEffect } from 'react';
import { Globe, Search, BarChart3, TrendingUp, FileDown, Loader2, RotateCcw, Copy, Check, Pin, AlertTriangle, CheckCircle2, XCircle, Minus, ExternalLink, Link, Sparkles, ChevronDown, ChevronRight, Target, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { Lead, StrategyDiagnosis, StrategyDiagnosisGap, StrategyDiagnosisPriority } from '@/lib/types';

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
  prospect: Record<string, string | number>; competitorAverage: Record<string, string | number>;
  competitors: { name: string; servicePages: number; locationPages: number; contentDepth: string; strengths: string[] }[];
  insights: string[];
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
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
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
    <div className="border rounded-lg p-3 bg-muted/20 space-y-3" data-testid="readiness-score-card">
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={scoreRingColor(score)} strokeWidth="5"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${scoreColor(score)}`}>{score}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold">Growth Readiness Score</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{confidenceLabel(diagnosis.confidence)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground italic leading-relaxed">"{diagnosis.insightSentence}"</p>
          {genLabel && (
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Last analysed {genLabel}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {subScoreItems.map(s => (
          <div key={s.label} className="text-center" data-testid={`subscore-${s.label.toLowerCase().replace(/\s/g, '-')}`}>
            <p className={`text-base font-bold ${scoreColor(s.value)}`}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{s.label}</p>
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
    <div className="border rounded-lg p-2.5 space-y-1 bg-muted/20" data-testid={`strategy-gap-${index}`}>
      <div className="flex items-center gap-2">
        <SeverityIcon severity={gap.severity} />
        <p className="text-xs font-semibold flex-1">{gap.title}</p>
        <SeverityBadge severity={gap.severity} />
      </div>
      <p className="text-xs text-muted-foreground pl-5">{gap.evidence}</p>
      <p className="text-xs text-amber-700 dark:text-amber-400 pl-5">{gap.impact}</p>
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
  return (
    <div className="space-y-3" data-testid="strategy-diagnosis-view">
      <ReadinessScoreCard diagnosis={diagnosis} />
      <CurrentPositionCard diagnosis={diagnosis} />
      <GrowthPotentialCard diagnosis={diagnosis} />

      {diagnosis.gaps?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Biggest Gaps ({diagnosis.gaps.length})</p>
          {diagnosis.gaps.map((gap, i) => <GapCard key={i} gap={gap} index={i} />)}
        </div>
      )}

      {diagnosis.priorities?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Recommended Priorities</p>
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
        <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">Key Insights</p>
          {result.insights.map((insight, i) => <p key={i} className="text-sm">• {insight}</p>)}
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

export default function GrowthPlanSection({ lead, onSaveToNotes, onSaveGrowthPlan }: {
  lead: Lead | null;
  onSaveToNotes: (text: string) => void;
  onSaveGrowthPlan?: (data: { xray?: any; serp?: any; competitor?: any; forecast?: any; strategyDiagnosis?: any }) => void;
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
      const res = await fetch('/api/ai/growth-plan/strategy-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, industry, location,
          sitemapPages: lead?.sitemapPages || [],
          hasGBP: !!(lead?.sourceData as any)?.googleMapsUrl,
          gbpLink: (lead?.sourceData as any)?.googleMapsUrl || null,
          reviewCount: reviewCount ?? null,
          rating: rating ?? null,
          facebookUrl: lead?.facebookUrl || null,
          instagramUrl: lead?.instagramUrl || null,
          linkedinUrl: lead?.linkedinUrl || null,
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
      const res = await fetch('/api/ai/growth-plan/competitor-gap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName, websiteUrl, location, industry, serpData: serpResult, xrayData: xrayResult?.crawlData }) });
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
    setPdfLoading(true);
    try {
      const res = await fetch('/api/ai/growth-plan/strategy-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, websiteUrl, location, industry, reviewCount, rating, xrayData: xrayResult, serpData: serpResult, competitorData: competitorResult, forecastData: forecastResult }),
      });
      if (!res.ok) throw new Error('Failed to generate strategy data');
      const strategyData = await res.json();
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20; const contentWidth = pageWidth - margin * 2; let y = 0;
      const addPage = () => { doc.addPage(); y = margin; };
      const checkPageBreak = (needed: number) => { if (y + needed > 270) addPage(); };

      doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 297, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(28);
      doc.text('12-Month Growth Strategy', pageWidth / 2, 100, { align: 'center' });
      doc.setFontSize(16); doc.text(businessName || 'Business', pageWidth / 2, 120, { align: 'center' });
      doc.setFontSize(11); doc.setTextColor(148, 163, 184);
      doc.text(`Prepared ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageWidth / 2, 140, { align: 'center' });
      doc.text(location || '', pageWidth / 2, 150, { align: 'center' });
      doc.setFontSize(9); doc.text('Confidential — Prepared by Momentum Agent', pageWidth / 2, 280, { align: 'center' });

      const addSection = (title: string, content: string) => {
        checkPageBreak(30); doc.setTextColor(15, 23, 42); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text(title, margin, y); y += 3; doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 40, y); y += 8; doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(content, contentWidth);
        for (const line of lines) { checkPageBreak(6); doc.text(line, margin, y); y += 5; }
        y += 8;
      };

      addPage();

      // Include strategy diagnosis in PDF if available
      if (strategyDiagnosis) {
        addSection('Growth Readiness Score', `Overall Score: ${strategyDiagnosis.readinessScore}/100\n\nService Clarity: ${strategyDiagnosis.subscores.serviceClarityScore}/100\nLocation Signals: ${strategyDiagnosis.subscores.locationRelevanceScore}/100\nContent Coverage: ${strategyDiagnosis.subscores.contentCoverageScore}/100\nGBP Alignment: ${strategyDiagnosis.subscores.gbpAlignmentScore}/100\nAuthority: ${strategyDiagnosis.subscores.authorityScore}/100\n\n${strategyDiagnosis.insightSentence}`);
        addSection('Current Position', strategyDiagnosis.currentPosition.summary);
        addSection('Growth Potential', `${strategyDiagnosis.growthPotential.summary}\n\nOpportunities:\n${strategyDiagnosis.growthPotential.opportunities.map(o => `• ${o}`).join('\n')}\n\nForecast:\n• Additional impressions: ${strategyDiagnosis.growthPotential.forecastBand.additionalImpressions}\n• Additional visitors: ${strategyDiagnosis.growthPotential.forecastBand.additionalVisitors}\n• Additional enquiries: ${strategyDiagnosis.growthPotential.forecastBand.additionalEnquiries}`);
        addSection('Biggest Gaps', strategyDiagnosis.gaps.map(g => `[${g.severity.toUpperCase()}] ${g.title}\nEvidence: ${g.evidence}\nImpact: ${g.impact}`).join('\n\n'));
        addSection('Recommended Priorities', strategyDiagnosis.priorities.map(p => `${p.rank}. ${p.action}\n${p.description}${p.examples?.length ? '\nExamples: ' + p.examples.join(', ') : ''}`).join('\n\n'));
      }

      addSection('How Google Ranks Local Businesses', 'Google ranks local businesses based on two fundamental signals:\n\n1. What you do — Does your website clearly communicate your services?\n2. Where you do it — Does your website clearly communicate your service areas?\n\nIf a website does not clearly communicate both of these signals, Google has less confidence ranking it for relevant local searches.');
      if (strategyData.websiteAnalysis) addSection('Website X-Ray Analysis', strategyData.websiteAnalysis);
      if (strategyData.searchVisibility) addSection('Search Visibility Analysis', strategyData.searchVisibility);
      if (strategyData.competitorAnalysis) addSection('Competitor Gap Analysis', strategyData.competitorAnalysis);
      if (strategyData.keywordOpportunities) addSection('Keyword Opportunity Map', strategyData.keywordOpportunities);
      if (strategyData.trafficForecast) addSection('Traffic & Revenue Forecast', strategyData.trafficForecast);
      if (strategyData.mapsOptimisation) addSection('Google Maps Optimisation Plan', strategyData.mapsOptimisation);
      if (strategyData.growthRoadmap) addSection('12-Month Growth Roadmap', strategyData.growthRoadmap);
      if (strategyData.expectedImpact) addSection('Expected Business Impact', strategyData.expectedImpact);

      const fileName = `${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Growth_Strategy.pdf`;
      doc.save(fileName);
      toast({ title: 'Strategy PDF downloaded' });
    } catch (err: any) {
      toast({ title: 'Failed to generate PDF', description: err.message, variant: 'destructive' });
    } finally { setPdfLoading(false); }
  };

  const generateReportUrl = async () => {
    if (!lead || !orgId) { toast({ title: 'Cannot generate report — missing lead or org data', variant: 'destructive' }); return; }
    const user = auth.currentUser;
    if (!user) { toast({ title: 'Not authenticated', variant: 'destructive' }); return; }
    setUrlLoading(true);
    try {
      const token = await user.getIdToken();
      const now = new Date();
      const monthYear = now.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
      const monthlyData = forecastResult?.growthTimeline?.slice(0, 6).map((m: any) => ({ month: m.month, clicks: m.traffic, impressions: Math.round(m.traffic * 8), rankingKeywords: Math.round(m.traffic * 0.4) })) || [];
      const nextSteps = forecastResult?.keyDrivers?.slice(0, 3).map((d: string) => ({ title: d, description: '', whyItMatters: 'Directly impacts your traffic and lead generation.' })) || xrayResult?.callouts?.filter((c: any) => c.severity === 'high').slice(0, 3).map((c: any) => ({ title: c.issue, description: c.fix, whyItMatters: c.detail })) || strategyDiagnosis?.priorities?.slice(0, 3).map(p => ({ title: p.action, description: p.description, whyItMatters: 'High-priority growth lever identified in strategy analysis.' })) || [];
      const opportunities = serpResult?.opportunities?.slice(0, 3).map((o: any) => ({ title: o.keyword, description: `${o.difficulty} difficulty, ${o.volume} volume — ${o.recommendation}` })) || strategyDiagnosis?.gaps?.slice(0, 3).map(g => ({ title: g.title, description: g.impact })) || [];
      const performanceMetrics = forecastResult ? { totalClicks: { value: forecastResult.currentEstimate.monthlyTraffic, change: 0, trend: 'up' as const }, totalImpressions: { value: forecastResult.currentEstimate.monthlyTraffic * 8, change: 0, trend: 'up' as const }, avgPosition: { value: 0, change: 0, trend: 'neutral' as const }, avgCtr: { value: 0, change: 0, trend: 'neutral' as const } } : undefined;
      const reportData = {
        orgId, clientId: lead.id, clientName: lead.companyName || 'Unknown', location: lead.territory || lead.areaName || '',
        period: monthYear, statusPills: [lead.stage || 'Prospect', 'Strategy Report'], performanceMetrics, monthlyData,
        featuredKeyword: serpResult?.keyword ? { keyword: serpResult.keyword, notRankingPosition: null, currentPosition: serpResult?.prospectPosition?.relevanceScore ? Math.round(20 - serpResult.prospectPosition.relevanceScore / 5) : null, page1Goal: 3 } : undefined,
        completedWork: xrayResult ? [{ title: 'Website X-Ray Analysis', description: xrayResult.summary, date: now.toLocaleDateString('en-AU') }] : [],
        nextSteps, opportunities,
        summary: strategyDiagnosis
          ? `${strategyDiagnosis.insightSentence} Growth Readiness Score: ${strategyDiagnosis.readinessScore}/100. ${strategyDiagnosis.growthPotential.summary}`
          : forecastResult
            ? `Based on our growth analysis, ${lead.companyName} has strong potential to increase monthly traffic from ${forecastResult.currentEstimate.monthlyTraffic} to ${forecastResult.projectedEstimate.monthlyTraffic} visitors within 6 months.`
            : `Our analysis of ${lead.companyName} identifies clear opportunities for digital growth in ${lead.territory || 'your area'}.`,
      };
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(reportData) });
      if (!res.ok) throw new Error('Failed to create report');
      const { id } = await res.json();
      const fullUrl = `${window.location.origin}/report/${id}`;
      setGeneratedUrl(fullUrl);
      toast({ title: 'Report URL generated!', description: 'Ready to share with your prospect.' });
    } catch (err) {
      toast({ title: 'Failed to generate report URL', variant: 'destructive' });
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
      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">Generate a professional strategy document you can send after your call.</p>
        <Button onClick={generatePdf} disabled={pdfLoading} className="w-full h-9 text-sm gap-2" data-testid="button-generate-pdf">
          {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          {pdfLoading ? 'Generating...' : 'Generate 12-Month Strategy PDF'}
        </Button>
        <Button onClick={generateReportUrl} disabled={urlLoading} variant="outline" className="w-full h-9 text-sm gap-2" data-testid="button-generate-report-url">
          {urlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
          {urlLoading ? 'Generating...' : 'Generate Public Report URL'}
        </Button>
        {generatedUrl && (
          <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/40 text-left">
            <p className="text-xs text-muted-foreground truncate flex-1">{generatedUrl}</p>
            <Button size="sm" variant="ghost" onClick={copyReportUrl} className="h-7 shrink-0 gap-1 text-xs" data-testid="button-copy-report-url">
              {urlCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {urlCopied ? 'Copied!' : 'Copy'}
            </Button>
            <a href={generatedUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" data-testid="button-open-report-url">
                <ExternalLink className="h-3 w-3" /> Open
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
