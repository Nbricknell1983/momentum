import { useState, useCallback } from 'react';
import {
  BarChart3, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Zap, Target, TrendingUp, DollarSign,
  Search as SearchIcon, MapPin, RotateCcw, ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import { Client, AdsEngineReport, AdsCampaign } from '@/lib/types';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return ''; }
}

const READINESS_COLOR = (score: number) =>
  score >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
  score >= 40 ? 'text-amber-600 dark:text-amber-400' :
  'text-red-600 dark:text-red-400';

const RISK_CONFIG: Record<AdsEngineReport['riskLevel'], { label: string; cls: string }> = {
  low:    { label: 'Low Risk',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  medium: { label: 'Medium Risk', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  high:   { label: 'High Risk',   cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
};

const CAMPAIGN_TYPE_CONFIG: Record<AdsCampaign['type'], { label: string; icon: typeof SearchIcon; color: string }> = {
  search:      { label: 'Search',      icon: SearchIcon,  color: 'text-blue-600 dark:text-blue-400' },
  local:       { label: 'Local',       icon: MapPin,      color: 'text-emerald-600 dark:text-emerald-400' },
  remarketing: { label: 'Remarketing', icon: RotateCcw,   color: 'text-violet-600 dark:text-violet-400' },
};

// ─── Budget bar ───────────────────────────────────────────────────────────────

function BudgetBar({ label, amount, percentage }: { label: string; amount: number; percentage: number }) {
  const color = label.toLowerCase().includes('search') ? 'bg-blue-500' :
                label.toLowerCase().includes('local') ? 'bg-emerald-500' :
                label.toLowerCase().includes('remark') ? 'bg-violet-500' : 'bg-slate-400';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">${amount.toLocaleString()}/mo</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: AdsCampaign }) {
  const [open, setOpen] = useState(false);
  const cfg = CAMPAIGN_TYPE_CONFIG[campaign.type];
  const CIcon = cfg.icon;
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        data-testid={`ads-campaign-${campaign.name.slice(0, 20).replace(/\s/g, '-')}`}
      >
        <CIcon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        <span className="flex-1 text-xs font-medium truncate">{campaign.name}</span>
        <span className="text-xs font-semibold text-foreground">${campaign.monthlyBudget.toLocaleString()}/mo</span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center py-1.5 rounded bg-background border">
              <p className="text-xs font-bold">{campaign.expectedClicks}</p>
              <p className="text-[10px] text-muted-foreground">Est. Clicks/mo</p>
            </div>
            <div className="text-center py-1.5 rounded bg-background border">
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{campaign.expectedLeads}</p>
              <p className="text-[10px] text-muted-foreground">Est. Leads/mo</p>
            </div>
          </div>
          {campaign.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {campaign.keywords.map((kw, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { client: Client }

export default function AdsEnginePanel({ client }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();

  const report = client.adsEngine;
  const onboarding = client.clientOnboarding;
  const bp = client.businessProfile;

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        businessName: client.businessName,
        industry: bp?.industry || '',
        location: client.address || '',
        websiteUrl: client.website || '',
        hasWebsite: !!(client.website || onboarding?.currentWebsiteUrl),
        websitePageCount: onboarding?.websitePageCount ?? null,
        reviewCount: bp?.reviewCount ?? null,
        rating: bp?.rating ?? null,
        businessOverview: onboarding?.businessOverview || '',
        targetCustomers: onboarding?.targetCustomers || '',
        keyServices: onboarding?.keyServices || '',
        businessGoals: onboarding?.businessGoals || '',
        locations: onboarding?.locations || '',
        adsServices: onboarding?.adsServices || '',
        monthlyBudget: onboarding?.monthlyBudget || '',
        fastestWinService: onboarding?.fastestWinService || '',
        retargetingGoal: onboarding?.retargetingGoal || '',
        pricingNotes: onboarding?.pricingNotes || '',
        selectedProducts: onboarding?.selectedProducts || [],
        existingSEOEngine: client.seoEngine ? {
          keywordTargets: client.seoEngine.keywordTargets,
        } : null,
      };
      const res = await fetch('/api/ai/client/ads-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate Ads plan');
      const data = await res.json();
      const newReport: AdsEngineReport = { ...data, generatedAt: new Date() };
      const updates = { adsEngine: newReport };
      if (orgId && authReady) {
        await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
      }
      dispatch(updateClient({ id: client.id, updates }));
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Ads plan failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [client, bp, onboarding, orgId, authReady, dispatch, toast]);

  const handleCopyKeywords = useCallback(() => {
    if (!report?.targetKeywords?.length) return;
    navigator.clipboard.writeText(report.targetKeywords.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-ads-engine">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        data-testid="toggle-ads-engine"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">Ads Engine</span>
          {report && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${READINESS_COLOR(report.readinessScore)} bg-muted/40`}>
              {report.readinessScore}/100 · {report.readinessLabel}
            </span>
          )}
          {!report && <span className="text-xs text-muted-foreground italic">Not generated</span>}
        </div>
        <div className="flex items-center gap-2">
          {report && <span className="text-[10px] text-muted-foreground">{fmtDate(report.generatedAt)}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              {report ? 'Ads readiness, budget framework, campaign structure, and lead forecast' : 'Generate an AI Google Ads intelligence plan for this client'}
            </p>
            <div className="flex items-center gap-1.5">
              {report && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopyKeywords} data-testid="btn-copy-ads-keywords">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Keywords'}
                </Button>
              )}
              <Button
                variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
                onClick={handleGenerate} disabled={loading}
                data-testid="btn-run-ads-engine"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {loading ? 'Generating…' : report ? 'Regenerate' : 'Generate Plan'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Building Ads intelligence plan…
            </div>
          )}

          {!loading && !report && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No Ads plan yet</p>
              <p className="text-xs text-muted-foreground">Generate a plan to surface readiness score, budget framework, campaign structure, and lead forecast.</p>
            </div>
          )}

          {!loading && report && (
            <div className="p-3 space-y-4">
              {/* Summary + risk */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">{report.summary}</p>
                <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">Risk Assessment</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${RISK_CONFIG[report.riskLevel].cls}`}>
                        {RISK_CONFIG[report.riskLevel].label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{report.riskNote}</p>
                  </div>
                </div>
              </div>

              {/* Forecast summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center py-2 rounded-lg border bg-muted/20">
                  <DollarSign className="h-4 w-4 mx-auto mb-0.5 text-orange-500" />
                  <p className="text-sm font-bold">${report.recommendedMonthlyBudget.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Rec. Budget/mo</p>
                </div>
                <div className="text-center py-2 rounded-lg border bg-muted/20">
                  <TrendingUp className="h-4 w-4 mx-auto mb-0.5 text-blue-500" />
                  <p className="text-sm font-bold">{report.expectedMonthlyLeads}</p>
                  <p className="text-[10px] text-muted-foreground">Est. Leads/mo</p>
                </div>
                <div className="text-center py-2 rounded-lg border bg-muted/20">
                  <Target className="h-4 w-4 mx-auto mb-0.5 text-emerald-500" />
                  <p className="text-sm font-bold">{report.expectedCPL}</p>
                  <p className="text-[10px] text-muted-foreground">Est. CPL</p>
                </div>
              </div>

              {/* Budget breakdown */}
              {report.budgetBreakdown?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <DollarSign className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold">Budget Breakdown</span>
                  </div>
                  <div className="space-y-2">
                    {report.budgetBreakdown.map((b, i) => (
                      <BudgetBar key={i} label={b.label} amount={b.amount} percentage={b.percentage} />
                    ))}
                  </div>
                </div>
              )}

              {/* Target keywords */}
              {report.targetKeywords?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <SearchIcon className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold">Target Keywords</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.targetKeywords.map((kw, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Campaign structure */}
              {report.campaigns?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold">Campaign Structure</span>
                  </div>
                  <div className="space-y-1.5">
                    {report.campaigns.map((c, i) => <CampaignCard key={i} campaign={c} />)}
                  </div>
                </div>
              )}

              {/* Quick wins */}
              {report.quickWins?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold">Quick Wins</span>
                  </div>
                  <div className="space-y-1.5">
                    {report.quickWins.map((win, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 h-4 w-4 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                        <span className="text-muted-foreground">{win}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
