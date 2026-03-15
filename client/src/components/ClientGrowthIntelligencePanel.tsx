import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle, Globe, Search, BarChart3, Star, Zap, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Client, HealthStatus, ChannelStatus, HEALTH_STATUS_LABELS,
  HEALTH_CONTRIBUTOR_LABELS,
} from '@/lib/types';
import ClientOnboardingHandover from '@/components/ClientOnboardingHandover';

function HealthBadge({ status }: { status: HealthStatus }) {
  const config = {
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200',
  }[status];
  const icon = status === 'green' ? <CheckCircle2 className="h-3 w-3" /> : status === 'amber' ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${config}`}>
      {icon} {HEALTH_STATUS_LABELS[status]}
    </span>
  );
}

function ChannelStatusBadge({ status }: { status: ChannelStatus }) {
  const config: Record<ChannelStatus, { label: string; cls: string }> = {
    not_started: { label: 'Not Started', cls: 'text-muted-foreground' },
    in_progress: { label: 'In Progress', cls: 'text-amber-600 dark:text-amber-400' },
    live: { label: 'Live', cls: 'text-emerald-600 dark:text-emerald-400' },
    paused: { label: 'Paused', cls: 'text-red-500' },
  };
  const { label, cls } = config[status] || config.not_started;
  const dot = status === 'live' ? 'bg-emerald-500' : status === 'in_progress' ? 'bg-amber-500' : status === 'paused' ? 'bg-red-500' : 'bg-muted-foreground/30';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const CHANNEL_ICONS: Record<string, typeof Globe> = {
  website: Globe, seo: Search, ppc: BarChart3, gbp: Star,
};
const CHANNEL_LABELS: Record<string, string> = {
  website: 'Website', seo: 'SEO', ppc: 'Google Ads', gbp: 'Google Business',
};

function healthScoreFromClient(client: Client): number {
  const base = 100 - (client.churnRiskScore || 0);
  return Math.max(0, Math.min(100, Math.round(base)));
}

function ScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'At Risk' : 'Critical';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
          <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
          <circle
            cx="40" cy="40" r="32" fill="none" strokeWidth="8"
            stroke={color}
            strokeDasharray={`${(score / 100) * 201} 201`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-center">
          <p className="text-xl font-bold leading-none" style={{ color }}>{score}</p>
          <p className="text-[9px] text-muted-foreground">/100</p>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

export default function ClientGrowthIntelligencePanel({ client }: { client: Client }) {
  const [expandedSection, setExpandedSection] = useState<string | null>('health');
  const healthScore = healthScoreFromClient(client);
  const activeProducts = client.products?.filter(p => p.status === 'active') || [];
  const totalMRR = activeProducts.reduce((sum, p) => sum + (p.monthlyValue || 0), 0);

  const channels = ['website', 'seo', 'ppc', 'gbp'] as const;
  const channelStatus = client.channelStatus || { website: 'not_started', seo: 'not_started', ppc: 'not_started', gbp: 'not_started' };

  const daysOverdue = client.nextContactDate
    ? Math.max(0, Math.floor((Date.now() - new Date(client.nextContactDate).getTime()) / 86400000))
    : null;

  const toggle = (key: string) => setExpandedSection(prev => prev === key ? null : key);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Account Intelligence</p>

          {/* Health Score */}
          <div className="border rounded-lg overflow-hidden mb-3">
            <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors" onClick={() => toggle('health')}>
              <p className="text-sm font-medium">Client Health Score</p>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'health' ? 'rotate-90' : ''}`} />
            </button>
            {expandedSection === 'health' && (
              <div className="border-t p-4">
                <div className="flex items-center gap-6">
                  <ScoreArc score={healthScore} />
                  <div className="flex-1 space-y-2">
                    {client.healthContributors && client.healthContributors.length > 0 ? (
                      client.healthContributors.slice(0, 4).map((c, i) => {
                        const dot = c.status === 'good' ? 'bg-emerald-500' : c.status === 'bad' ? 'bg-red-500' : 'bg-amber-500';
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                            <p className="text-xs text-muted-foreground">{c.label || HEALTH_CONTRIBUTOR_LABELS[c.type]}</p>
                          </div>
                        );
                      })
                    ) : (
                      client.healthReasons?.slice(0, 4).map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                          <p className="text-xs text-muted-foreground">{r}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Service Performance */}
          <div className="border rounded-lg overflow-hidden mb-3">
            <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors" onClick={() => toggle('services')}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Service Performance</p>
                {totalMRR > 0 && <Badge variant="outline" className="text-xs">${totalMRR.toLocaleString()}/mo</Badge>}
              </div>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'services' ? 'rotate-90' : ''}`} />
            </button>
            {expandedSection === 'services' && (
              <div className="border-t divide-y">
                {channels.map(ch => {
                  const Icon = CHANNEL_ICONS[ch] || Globe;
                  const status = channelStatus[ch] || 'not_started';
                  const matchingProduct = activeProducts.find(p =>
                    p.productType.toLowerCase().includes(ch === 'ppc' ? 'ads' : ch === 'gbp' ? 'google business' : ch)
                  );
                  return (
                    <div key={ch} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-sm">{CHANNEL_LABELS[ch]}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {matchingProduct && <span className="text-xs text-muted-foreground">${matchingProduct.monthlyValue}/mo</span>}
                        <ChannelStatusBadge status={status} />
                      </div>
                    </div>
                  );
                })}
                {activeProducts.filter(p => !channels.some(ch =>
                  p.productType.toLowerCase().includes(ch === 'ppc' ? 'ads' : ch === 'gbp' ? 'google business' : ch)
                )).map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <p className="text-sm">{p.productType}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">${p.monthlyValue}/mo</span>
                      <ChannelStatusBadge status={p.status === 'active' ? 'live' : p.status === 'paused' ? 'paused' : 'not_started'} />
                    </div>
                  </div>
                ))}
                {activeProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No active services</p>
                )}
              </div>
            )}
          </div>

          {/* Retention Signals */}
          <div className="border rounded-lg overflow-hidden mb-3">
            <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors" onClick={() => toggle('retention')}>
              <p className="text-sm font-medium">Retention Signals</p>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'retention' ? 'rotate-90' : ''}`} />
            </button>
            {expandedSection === 'retention' && (
              <div className="border-t p-3 space-y-2">
                {/* Contact Status */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Last Contact</p>
                  <div className="flex items-center gap-1.5">
                    {client.lastContactDate ? (
                      <span className="text-xs">
                        {new Date(client.lastContactDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not recorded</span>
                    )}
                  </div>
                </div>
                {daysOverdue !== null && daysOverdue > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">Follow-up overdue by {daysOverdue} days</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Health Status</p>
                  <HealthBadge status={client.healthStatus} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Strategy Status</p>
                  <span className="text-xs capitalize">{client.strategyStatus?.replace(/_/g, ' ') || 'Not started'}</span>
                </div>
                {client.healthReasons && client.healthReasons.length > 0 && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-1.5">Risk Factors</p>
                    <div className="space-y-1">
                      {client.healthReasons.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="text-muted-foreground">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expansion Opportunities */}
          <div className="border rounded-lg overflow-hidden mb-3">
            <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors" onClick={() => toggle('expansion')}>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-medium">Expansion Opportunities</p>
              </div>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'expansion' ? 'rotate-90' : ''}`} />
            </button>
            {expandedSection === 'expansion' && (
              <div className="border-t p-3 space-y-2">
                {(() => {
                  const gaps: { title: string; desc: string }[] = [];
                  if (channelStatus.seo === 'not_started') gaps.push({ title: 'Start SEO', desc: 'No SEO service active — strong upsell opportunity' });
                  if (channelStatus.ppc === 'not_started') gaps.push({ title: 'Launch Google Ads', desc: 'PPC not active — immediate lead generation potential' });
                  if (channelStatus.gbp === 'not_started' || channelStatus.gbp === 'in_progress') gaps.push({ title: 'Google Business Optimisation', desc: 'GBP not fully live — impacts local search visibility' });
                  if (channelStatus.website === 'not_started') gaps.push({ title: 'Website Build', desc: 'No website service — foundational digital asset missing' });
                  if (client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') gaps.push({ title: 'Account Upsell', desc: 'Client shows strong upsell readiness signals' });
                  if (gaps.length === 0) {
                    return <p className="text-xs text-muted-foreground text-center py-2">All core services active — focus on performance expansion</p>;
                  }
                  return gaps.map((g, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded text-xs">
                      <Zap className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">{g.title}</p>
                        <p className="text-muted-foreground">{g.desc}</p>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Next Best Action */}
          {client.nextAction && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Next Best Action</p>
              </div>
              <p className="text-xs text-muted-foreground">{client.nextAction}</p>
            </div>
          )}

          {/* Pain Points */}
          {client.painPoints && client.painPoints.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors" onClick={() => toggle('pain')}>
                <p className="text-sm font-medium">Pain Points & Goals</p>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSection === 'pain' ? 'rotate-90' : ''}`} />
              </button>
              {expandedSection === 'pain' && (
                <div className="border-t p-3 space-y-2">
                  {client.painPoints.map((pp, i) => (
                    <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                      <div className="flex justify-between">
                        <p className="font-medium">{pp.description}</p>
                        <Badge variant="outline" className={`text-[10px] ${pp.priority === 'high' ? 'border-red-300 text-red-600' : pp.priority === 'medium' ? 'border-amber-300 text-amber-600' : 'border-blue-300 text-blue-600'}`}>{pp.priority}</Badge>
                      </div>
                      {pp.budget && <p className="text-muted-foreground">Budget: ${pp.budget.toLocaleString()}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Onboarding & Team Handover */}
          <ClientOnboardingHandover client={client} />
        </div>
      </div>
    </ScrollArea>
  );
}
