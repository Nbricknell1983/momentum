import { useState, useCallback, useEffect } from 'react';
import { Globe, Search, BarChart3, TrendingUp, FileDown, Loader2, RotateCcw, Copy, Check, Pin, ChevronDown, AlertTriangle, CheckCircle2, XCircle, Minus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Lead } from '@/lib/types';

interface CrawlData {
  url: string;
  success: boolean;
  error?: string;
  title?: string;
  metaDescription?: string;
  h1s: string[];
  headingHierarchy: { tag: string; text: string }[];
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  navLabels: string[];
  hasHttps: boolean;
  hasSitemap: boolean;
  serviceKeywords: string[];
  locationKeywords: string[];
  images: { total: number; withAlt: number; withoutAlt: number };
  hasSchema: boolean;
  canonicalUrl?: string;
  ogTags: Record<string, string>;
}

interface XRayCallout {
  id: number;
  issue: string;
  detail: string;
  fix: string;
  severity: 'high' | 'medium' | 'low';
}

interface XRayResult {
  crawlData: CrawlData;
  callouts: XRayCallout[];
  summary: string;
}

interface SerpResult {
  keyword: string;
  prospectPosition: {
    mapsPresence: string;
    organicPresence: string;
    bestMatchingPage: string;
    relevanceScore: number;
  };
  competitors: { name: string; domain: string; position: number; strength: string }[];
  opportunities: { keyword: string; difficulty: string; volume: string; recommendation: string }[];
  serpSnapshot: { position: number; title: string; domain: string; snippet: string; type: string }[];
}

interface CompetitorGapResult {
  prospect: Record<string, string | number>;
  competitorAverage: Record<string, string | number>;
  competitors: { name: string; servicePages: number; locationPages: number; contentDepth: string; strengths: string[] }[];
  insights: string[];
}

interface ForecastResult {
  currentEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  projectedEstimate: { monthlyTraffic: number; monthlyLeads: number; monthlyRevenue: number };
  growthTimeline: { month: string; traffic: number; leads: number; revenue: number }[];
  assumptions: string[];
  keyDrivers: string[];
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
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
      <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs gap-1">
        <RotateCcw className="h-3 w-3" /> Retry
      </Button>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'high') return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (severity === 'medium') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <Minus className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  };
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colors[severity as keyof typeof colors] || colors.low}`}>{severity}</Badge>;
}

function SignalRow({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const icon = status === 'good' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> :
    status === 'bad' ? <XCircle className="h-3.5 w-3.5 text-red-500" /> :
    status === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> :
    <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  return (
    <div className="flex items-start gap-2 py-1">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

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
          <div className="flex flex-wrap gap-1">
            {d.navLabels.map((label, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{label}</Badge>
            ))}
          </div>
        </div>
      )}

      {(d.serviceKeywords.length > 0 || d.locationKeywords.length > 0) && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Keywords Detected</p>
          {d.serviceKeywords.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Service Keywords</p>
              <div className="flex flex-wrap gap-1">
                {d.serviceKeywords.map((kw, i) => <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>)}
              </div>
            </div>
          )}
          {d.locationKeywords.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Location Keywords</p>
              <div className="flex flex-wrap gap-1">
                {d.locationKeywords.map((kw, i) => <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}

      {result.callouts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Issues & Recommendations</p>
          {result.callouts.map((c) => (
            <div key={c.id} className="border rounded-lg p-2.5 space-y-1 bg-muted/20" data-testid={`callout-${c.id}`}>
              <div className="flex items-center gap-2">
                <SeverityIcon severity={c.severity} />
                <p className="text-sm font-medium flex-1">{c.issue}</p>
                <SeverityBadge severity={c.severity} />
              </div>
              <p className="text-xs text-muted-foreground pl-5">{c.detail}</p>
              <p className="text-xs text-green-700 dark:text-green-400 pl-5">{c.fix}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
        <p className="text-sm">{result.summary}</p>
      </div>
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
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className="text-[9px] px-1 py-0">{item.type === 'maps' ? 'Map Pack' : item.type === 'ad' ? 'Ad' : `#${item.position}`}</Badge>
                <p className="text-xs text-muted-foreground truncate">{item.domain}</p>
              </div>
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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.domain}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{c.strength}</p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-2 mt-3">
          <p className="text-[11px] font-medium text-muted-foreground">Keyword Opportunities</p>
          {result.opportunities.map((o, i) => (
            <div key={i} className="border rounded-lg p-2.5 bg-muted/20" data-testid={`opportunity-${i}`}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium flex-1">{o.keyword}</p>
                <Badge variant="outline" className="text-[9px]">{o.difficulty}</Badge>
              </div>
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
  const signalLabels: Record<string, string> = {
    servicePages: 'Service Pages',
    locationPages: 'Location Pages',
    contentDepth: 'Content Depth',
    internalLinking: 'Internal Linking',
    reviewSignals: 'Review Signals',
  };

  return (
    <div className="space-y-3" data-testid="competitor-gap-results">
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium text-muted-foreground">Signal</th>
              <th className="text-center p-2 font-medium text-muted-foreground">Prospect</th>
              <th className="text-center p-2 font-medium text-muted-foreground">Competitor Avg</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal} className="border-t">
                <td className="p-2 text-muted-foreground">{signalLabels[signal]}</td>
                <td className="p-2 text-center font-medium">{String(result.prospect[signal])}</td>
                <td className="p-2 text-center font-medium">{String(result.competitorAverage[signal])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.insights.length > 0 && (
        <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">Key Insights</p>
          {result.insights.map((insight, i) => (
            <p key={i} className="text-sm">• {insight}</p>
          ))}
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
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (m.traffic / (result.projectedEstimate.monthlyTraffic || 1)) * 100)}%` }}
                  />
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
          {result.keyDrivers.map((d, i) => (
            <p key={i} className="text-sm">• {d}</p>
          ))}
        </div>
      )}

      <div className="border rounded-lg p-2.5 bg-muted/30">
        <p className="text-[10px] text-muted-foreground italic">Estimates based on: {result.assumptions.join('; ')}</p>
      </div>
    </div>
  );
}

type ActiveTool = null | 'xray' | 'serp' | 'competitor' | 'forecast';

export default function GrowthPlanSection({ lead, onSaveToNotes, onSaveGrowthPlan }: {
  lead: Lead | null;
  onSaveToNotes: (text: string) => void;
  onSaveGrowthPlan?: (data: { xray?: any; serp?: any; competitor?: any; forecast?: any }) => void;
}) {
  const { toast } = useToast();

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const [xrayResult, setXrayResult] = useState<XRayResult | null>(null);
  const [serpResult, setSerpResult] = useState<SerpResult | null>(null);
  const [competitorResult, setCompetitorResult] = useState<CompetitorGapResult | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [serpKeyword, setSerpKeyword] = useState('');

  useEffect(() => {
    if (lead?.aiGrowthPlan) {
      const gp = lead.aiGrowthPlan;
      if (gp.xray) setXrayResult(gp.xray);
      if (gp.serp) setSerpResult(gp.serp);
      if (gp.competitor) setCompetitorResult(gp.competitor);
      if (gp.forecast) setForecastResult(gp.forecast);
    } else {
      setXrayResult(null);
      setSerpResult(null);
      setCompetitorResult(null);
      setForecastResult(null);
    }
  }, [lead?.id]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const businessName = lead?.companyName || '';
  const websiteUrl = lead?.website || '';
  const location = lead?.territory || lead?.areaName || '';
  const industry = lead?.sourceData?.googleTypes?.[0] || '';
  const reviewCount = lead?.sourceData?.googleReviewCount;
  const rating = lead?.sourceData?.googleRating;

  const setToolLoading = (tool: string, val: boolean) => setLoading(p => ({ ...p, [tool]: val }));
  const setToolError = (tool: string, err: string | null) => setErrors(p => ({ ...p, [tool]: err }));

  const runXRay = async () => {
    if (!websiteUrl) {
      toast({ title: 'No website URL available for this lead', variant: 'destructive' });
      return;
    }
    setActiveTool('xray');
    setToolLoading('xray', true);
    setToolError('xray', null);
    try {
      const res = await fetch('/api/ai/growth-plan/website-xray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl, businessName, industry, location }),
      });
      if (!res.ok) throw new Error('Failed to run website x-ray');
      const data = await res.json();
      setXrayResult(data);
      onSaveGrowthPlan?.({ xray: data, serp: serpResult, competitor: competitorResult, forecast: forecastResult });
    } catch (err: any) {
      setToolError('xray', err.message);
    } finally {
      setToolLoading('xray', false);
    }
  };

  const runSerp = async () => {
    if (!businessName) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setActiveTool('serp');
    setToolLoading('serp', true);
    setToolError('serp', null);
    try {
      const res = await fetch('/api/ai/growth-plan/serp-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, websiteUrl, location, industry, keyword: serpKeyword }),
      });
      if (!res.ok) throw new Error('Failed to analyse search results');
      const data = await res.json();
      setSerpResult(data);
      onSaveGrowthPlan?.({ xray: xrayResult, serp: data, competitor: competitorResult, forecast: forecastResult });
    } catch (err: any) {
      setToolError('serp', err.message);
    } finally {
      setToolLoading('serp', false);
    }
  };

  const runCompetitorGap = async () => {
    if (!businessName) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setActiveTool('competitor');
    setToolLoading('competitor', true);
    setToolError('competitor', null);
    try {
      const res = await fetch('/api/ai/growth-plan/competitor-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, location, industry,
          serpData: serpResult, xrayData: xrayResult?.crawlData,
        }),
      });
      if (!res.ok) throw new Error('Failed to analyse competitor gap');
      const data = await res.json();
      setCompetitorResult(data);
      onSaveGrowthPlan?.({ xray: xrayResult, serp: serpResult, competitor: data, forecast: forecastResult });
    } catch (err: any) {
      setToolError('competitor', err.message);
    } finally {
      setToolLoading('competitor', false);
    }
  };

  const runForecast = async () => {
    if (!businessName) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setActiveTool('forecast');
    setToolLoading('forecast', true);
    setToolError('forecast', null);
    try {
      const res = await fetch('/api/ai/growth-plan/traffic-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, location, industry,
          reviewCount, rating,
          serpData: serpResult, xrayData: xrayResult?.crawlData,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate forecast');
      const data = await res.json();
      setForecastResult(data);
      onSaveGrowthPlan?.({ xray: xrayResult, serp: serpResult, competitor: competitorResult, forecast: data });
    } catch (err: any) {
      setToolError('forecast', err.message);
    } finally {
      setToolLoading('forecast', false);
    }
  };

  const generatePdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch('/api/ai/growth-plan/strategy-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, websiteUrl, location, industry,
          reviewCount, rating,
          xrayData: xrayResult, serpData: serpResult,
          competitorData: competitorResult, forecastData: forecastResult,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate strategy data');
      const strategyData = await res.json();

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 0;

      const addPage = () => { doc.addPage(); y = margin; };
      const checkPageBreak = (needed: number) => { if (y + needed > 270) addPage(); };

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 297, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.text('12-Month Growth Strategy', pageWidth / 2, 100, { align: 'center' });
      doc.setFontSize(16);
      doc.text(businessName || 'Business', pageWidth / 2, 120, { align: 'center' });
      doc.setFontSize(11);
      doc.setTextColor(148, 163, 184);
      doc.text(`Prepared ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageWidth / 2, 140, { align: 'center' });
      doc.text(location || '', pageWidth / 2, 150, { align: 'center' });
      doc.setFontSize(9);
      doc.text('Confidential — Prepared by Momentum Agent', pageWidth / 2, 280, { align: 'center' });

      const addSection = (title: string, content: string) => {
        checkPageBreak(30);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, y);
        y += 3;
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 40, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(content, contentWidth);
        for (const line of lines) {
          checkPageBreak(6);
          doc.text(line, margin, y);
          y += 5;
        }
        y += 8;
      };

      addPage();
      addSection('Executive Summary', strategyData.executiveSummary || `This strategy document outlines a 12-month growth plan for ${businessName}. Based on our analysis of the current online presence, competitive landscape, and market opportunity, we have identified key areas for improvement and growth.`);

      addSection('How Google Ranks Local Businesses', 'Google ranks local businesses based on two fundamental signals:\n\n1. What you do — Does your website clearly communicate your services?\n2. Where you do it — Does your website clearly communicate your service areas?\n\nIf a website does not clearly communicate both of these signals, Google has less confidence ranking it for relevant local searches. This directly impacts visibility in both Google Maps and organic search results.');

      if (strategyData.websiteAnalysis) {
        addSection('Website X-Ray Analysis', strategyData.websiteAnalysis);
      }
      if (strategyData.searchVisibility) {
        addSection('Search Visibility Analysis', strategyData.searchVisibility);
      }
      if (strategyData.competitorAnalysis) {
        addSection('Competitor Gap Analysis', strategyData.competitorAnalysis);
      }
      if (strategyData.keywordOpportunities) {
        addSection('Keyword Opportunity Map', strategyData.keywordOpportunities);
      }
      if (strategyData.trafficForecast) {
        addSection('Traffic & Revenue Forecast', strategyData.trafficForecast);
      }
      if (strategyData.mapsOptimisation) {
        addSection('Google Maps Optimisation Plan', strategyData.mapsOptimisation);
      }
      if (strategyData.growthRoadmap) {
        addSection('12-Month Growth Roadmap', strategyData.growthRoadmap);
      }
      if (strategyData.expectedImpact) {
        addSection('Expected Business Impact', strategyData.expectedImpact);
      }

      const fileName = `${businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Growth_Strategy.pdf`;
      doc.save(fileName);
      toast({ title: 'Strategy PDF downloaded' });
    } catch (err: any) {
      toast({ title: 'Failed to generate PDF', description: err.message, variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  };

  const tools = [
    { key: 'xray' as const, label: 'Run Website X-Ray', icon: Globe, action: runXRay, hasResult: !!xrayResult, needsWebsite: true },
    { key: 'serp' as const, label: 'Visualise Search Results', icon: Search, action: () => { if (activeTool === 'serp' || serpResult) { runSerp(); } else { setActiveTool('serp'); } }, hasResult: !!serpResult },
    { key: 'competitor' as const, label: 'Analyse Competitor Gap', icon: BarChart3, action: runCompetitorGap, hasResult: !!competitorResult },
    { key: 'forecast' as const, label: 'Forecast Traffic & Revenue', icon: TrendingUp, action: runForecast, hasResult: !!forecastResult },
  ];

  return (
    <div className="space-y-3" data-testid="growth-plan-section">
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
                onClick={() => {
                  if (tool.hasResult && activeTool !== tool.key) {
                    setActiveTool(tool.key);
                  } else {
                    tool.action();
                  }
                }}
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
                    <Input
                      value={serpKeyword}
                      onChange={e => setSerpKeyword(e.target.value)}
                      placeholder={`e.g. ${industry || 'plumber'} ${location || 'near me'}`}
                      className="h-8 text-sm"
                      data-testid="input-serp-keyword"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for AI-suggested keywords</p>
                  </div>
                  <Button
                    onClick={runSerp}
                    size="sm"
                    className="w-full h-8 text-sm gap-2"
                    data-testid="button-run-serp"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Run Analysis
                  </Button>
                </div>
              )}

              <InlineError error={errors[tool.key] || null} onRetry={tool.action} />

              {isActive && tool.key === 'xray' && xrayResult && (
                <div className="mt-3">
                  <WebsiteXRayView result={xrayResult} />
                </div>
              )}
              {isActive && tool.key === 'serp' && serpResult && (
                <div className="mt-3">
                  <SerpAnalysisView result={serpResult} />
                </div>
              )}
              {isActive && tool.key === 'competitor' && competitorResult && (
                <div className="mt-3">
                  <CompetitorGapView result={competitorResult} />
                </div>
              )}
              {isActive && tool.key === 'forecast' && forecastResult && (
                <div className="mt-3">
                  <TrafficForecastView result={forecastResult} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">Generate a professional strategy document you can send after your call.</p>
        <Button
          onClick={generatePdf}
          disabled={pdfLoading}
          className="w-full h-9 text-sm gap-2"
          data-testid="button-generate-pdf"
        >
          {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          {pdfLoading ? 'Generating...' : 'Generate 12-Month Strategy PDF'}
        </Button>
      </div>
    </div>
  );
}
