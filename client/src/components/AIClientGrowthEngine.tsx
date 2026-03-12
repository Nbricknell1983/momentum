import { useState, useCallback, useEffect } from 'react';
import { Users, Shield, Mail, TrendingUp, Sparkles, Loader2, Copy, Check, RotateCcw, ChevronDown, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/lib/types';

type GrowthSection = 'account_intel' | 'conversation' | 'follow_up' | 'growth_plan' | 'referral';

interface AccountIntelResult {
  accountSummary: string;
  strengths: string[];
  growthGaps: { title: string; description: string; opportunity: string }[];
  retentionRisks: string[];
  conversationStarter: string;
}

interface ConversationResult {
  clientGoalHypothesis: string;
  smartQuestions: string[];
  upsellAngle: string;
  expansionOpportunities: { service: string; rationale: string; estimatedValue: string }[];
}

interface FollowUpResult {
  email: { subject: string; body: string };
  sms: string;
  keyTakeaway: string;
}

interface GrowthPlanResult {
  thirtyDay: { action: string; why: string; impact: string }[];
  ninetyDay: { action: string; why: string; impact: string }[];
  twelveMonth: { quarter: string; focus: string; goal: string }[];
  accountGrowthTarget: string;
}

interface ReferralResult {
  referralPartners: { partnerType: string; why: string; introScript: string }[];
  referralAsk: string;
  incentiveIdea: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(() => {
    try { navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <Button variant="ghost" size="sm" onClick={handle} className="h-7 text-xs gap-1">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

const SECTION_CONFIG: Record<GrowthSection, { title: string; subtitle: string; icon: typeof Phone }> = {
  account_intel: { title: 'Win Before You Dial', subtitle: 'Understand your client in 60 seconds', icon: Sparkles },
  conversation: { title: 'Control the Call', subtitle: 'Expansion conversations that win', icon: Shield },
  follow_up: { title: 'Win the Follow-Up', subtitle: 'Value-first, every time', icon: Mail },
  growth_plan: { title: 'Growth Plan', subtitle: 'Retain. Expand. Upsell.', icon: TrendingUp },
  referral: { title: 'Multiply Your Pipeline', subtitle: 'Turn one client into ten', icon: Users },
};

export default function AIClientGrowthEngine({ client }: { client: Client }) {
  const { toast } = useToast();
  const [openSection, setOpenSection] = useState<GrowthSection | null>('account_intel');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  const [accountIntel, setAccountIntel] = useState<AccountIntelResult | null>(null);
  const [conversationResult, setConversationResult] = useState<ConversationResult | null>(null);
  const [followUpResult, setFollowUpResult] = useState<FollowUpResult | null>(null);
  const [growthPlanResult, setGrowthPlanResult] = useState<GrowthPlanResult | null>(null);
  const [referralResult, setReferralResult] = useState<ReferralResult | null>(null);

  useEffect(() => {
    setAccountIntel(null); setConversationResult(null); setFollowUpResult(null);
    setGrowthPlanResult(null); setReferralResult(null); setNotes('');
  }, [client.id]);

  const setLoad = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));

  const clientPayload = () => ({
    businessName: client.businessName,
    location: client.regionName || client.areaName || '',
    products: client.products || [],
    channelStatus: client.channelStatus,
    healthStatus: client.healthStatus,
    churnRiskScore: client.churnRiskScore,
    lastContactDate: client.lastContactDate,
    website: client.website,
    totalMRR: client.totalMRR,
    healthReasons: client.healthReasons,
    contactName: client.primaryContactName,
  });

  const generateAccountIntel = async () => {
    setLoad('account_intel', true);
    try {
      const res = await fetch('/api/ai/client-growth/account-intelligence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload()),
      });
      if (!res.ok) throw new Error('Failed');
      setAccountIntel(await res.json());
    } catch { toast({ title: 'Failed to generate account intelligence', variant: 'destructive' }); }
    finally { setLoad('account_intel', false); }
  };

  const generateConversation = async () => {
    setLoad('conversation', true);
    try {
      const res = await fetch('/api/ai/client-growth/conversation-builder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload()),
      });
      if (!res.ok) throw new Error('Failed');
      setConversationResult(await res.json());
    } catch { toast({ title: 'Failed to generate conversation guide', variant: 'destructive' }); }
    finally { setLoad('conversation', false); }
  };

  const generateFollowUp = async () => {
    setLoad('follow_up', true);
    try {
      const res = await fetch('/api/ai/client-growth/follow-up', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...clientPayload(), notes }),
      });
      if (!res.ok) throw new Error('Failed');
      setFollowUpResult(await res.json());
    } catch { toast({ title: 'Failed to generate follow-up', variant: 'destructive' }); }
    finally { setLoad('follow_up', false); }
  };

  const generateGrowthPlan = async () => {
    setLoad('growth_plan', true);
    try {
      const res = await fetch('/api/ai/client-growth/growth-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload()),
      });
      if (!res.ok) throw new Error('Failed');
      setGrowthPlanResult(await res.json());
    } catch { toast({ title: 'Failed to generate growth plan', variant: 'destructive' }); }
    finally { setLoad('growth_plan', false); }
  };

  const generateReferral = async () => {
    setLoad('referral', true);
    try {
      const res = await fetch('/api/ai/client-growth/referral-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload()),
      });
      if (!res.ok) throw new Error('Failed');
      setReferralResult(await res.json());
    } catch { toast({ title: 'Failed to generate referral engine', variant: 'destructive' }); }
    finally { setLoad('referral', false); }
  };

  const sections: GrowthSection[] = ['account_intel', 'conversation', 'follow_up', 'growth_plan', 'referral'];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 pb-1">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-sm font-semibold">AI Client Growth Engine</p>
            <p className="text-xs text-muted-foreground">Grow. Retain. Expand. Multiply.</p>
          </div>
        </div>

        {sections.map((sectionKey) => {
          const config = SECTION_CONFIG[sectionKey];
          const Icon = config.icon;
          const isOpen = openSection === sectionKey;
          const isLoading = loading[sectionKey];

          return (
            <div key={sectionKey} className="border rounded-lg overflow-hidden" data-testid={`section-${sectionKey}`}>
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setOpenSection(prev => prev === sectionKey ? null : sectionKey)}
                data-testid={`button-toggle-${sectionKey}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{config.title}</p>
                    <p className="text-xs text-muted-foreground">{config.subtitle}</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t bg-background/50 p-3 space-y-3">
                  {/* ── Account Intelligence ── */}
                  {sectionKey === 'account_intel' && (
                    <>
                      {!accountIntel ? (
                        <div className="text-center space-y-2 py-2">
                          <p className="text-xs text-muted-foreground">Get a full account snapshot — strengths, risks, and your opening line.</p>
                          <Button onClick={generateAccountIntel} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-account-intel">
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {isLoading ? 'Analysing...' : 'Generate Account Intelligence'}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setAccountIntel(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                            <CopyBtn text={[accountIntel.accountSummary, ...accountIntel.strengths, accountIntel.conversationStarter].join('\n')} />
                          </div>
                          <div className="bg-muted/40 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1 font-medium">Account Summary</p>
                            <p className="text-sm">{accountIntel.accountSummary}</p>
                          </div>
                          {accountIntel.strengths.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">Strengths</p>
                              <ul className="space-y-1">
                                {accountIntel.strengths.map((s, i) => (
                                  <li key={i} className="text-xs flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {accountIntel.growthGaps.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">Growth Opportunities</p>
                              <div className="space-y-2">
                                {accountIntel.growthGaps.map((g, i) => (
                                  <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                    <p className="font-medium">{g.title}</p>
                                    <p className="text-muted-foreground">{g.description}</p>
                                    <p className="text-blue-600 dark:text-blue-400">→ {g.opportunity}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {accountIntel.retentionRisks.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">Retention Risks</p>
                              <ul className="space-y-1">
                                {accountIntel.retentionRisks.map((r, i) => (
                                  <li key={i} className="text-xs flex gap-2"><span className="text-red-500 shrink-0">⚠</span>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Conversation Starter</p>
                            <p className="text-sm italic">"{accountIntel.conversationStarter}"</p>
                            <div className="flex justify-end mt-1"><CopyBtn text={accountIntel.conversationStarter} /></div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Conversation Builder ── */}
                  {sectionKey === 'conversation' && (
                    <>
                      {!conversationResult ? (
                        <div className="text-center space-y-2 py-2">
                          <p className="text-xs text-muted-foreground">Prepare smart questions and upsell angles for your next growth conversation.</p>
                          <Button onClick={generateConversation} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-conversation">
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                            {isLoading ? 'Building...' : 'Build Expansion Conversation'}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setConversationResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1 font-medium">Client Goal Hypothesis</p>
                            <p className="text-sm">{conversationResult.clientGoalHypothesis}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1.5">Smart Questions</p>
                            <div className="space-y-1.5">
                              {conversationResult.smartQuestions.map((q, i) => (
                                <div key={i} className="flex gap-2 text-xs p-2 bg-muted/30 rounded">
                                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                  <span>"{q}"</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Upsell Angle</p>
                            <p className="text-sm">{conversationResult.upsellAngle}</p>
                          </div>
                          {conversationResult.expansionOpportunities.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1.5">Expansion Opportunities</p>
                              <div className="space-y-2">
                                {conversationResult.expansionOpportunities.map((o, i) => (
                                  <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                    <div className="flex justify-between">
                                      <p className="font-medium">{o.service}</p>
                                      <Badge variant="outline" className="text-[10px]">{o.estimatedValue}</Badge>
                                    </div>
                                    <p className="text-muted-foreground">{o.rationale}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Follow-Up ── */}
                  {sectionKey === 'follow_up' && (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Meeting notes (optional)</p>
                        <Textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="What did you discuss? Key topics, decisions, next steps..."
                          className="text-xs min-h-[70px]"
                          data-testid="textarea-client-followup-notes"
                        />
                      </div>
                      {!followUpResult ? (
                        <Button onClick={generateFollowUp} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-followup">
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          {isLoading ? 'Writing...' : 'Generate Follow-Up'}
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setFollowUpResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                          </div>
                          <div className="space-y-2">
                            <div className="bg-muted/30 rounded p-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
                              <p className="text-xs font-medium">{followUpResult.email.subject}</p>
                            </div>
                            <div className="bg-muted/30 rounded p-2">
                              <p className="text-xs text-muted-foreground mb-1">Email</p>
                              <pre className="text-xs whitespace-pre-wrap font-sans">{followUpResult.email.body}</pre>
                              <div className="flex justify-end mt-1"><CopyBtn text={`Subject: ${followUpResult.email.subject}\n\n${followUpResult.email.body}`} /></div>
                            </div>
                            <div className="bg-muted/30 rounded p-2">
                              <p className="text-xs text-muted-foreground mb-0.5">SMS</p>
                              <p className="text-xs">{followUpResult.sms}</p>
                              <div className="flex justify-end mt-1"><CopyBtn text={followUpResult.sms} /></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Growth Plan ── */}
                  {sectionKey === 'growth_plan' && (
                    <>
                      {!growthPlanResult ? (
                        <div className="text-center space-y-2 py-2">
                          <p className="text-xs text-muted-foreground">Generate a structured 30 / 90 day and 12-month growth plan for this account.</p>
                          <Button onClick={generateGrowthPlan} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-growth-plan">
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                            {isLoading ? 'Planning...' : 'Generate Growth Plan'}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setGrowthPlanResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                          </div>
                          {growthPlanResult.accountGrowthTarget && (
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded p-2">
                              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Growth Target: {growthPlanResult.accountGrowthTarget}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium mb-1.5 text-amber-600 dark:text-amber-400">30-Day Actions</p>
                            <div className="space-y-1.5">
                              {growthPlanResult.thirtyDay.map((a, i) => (
                                <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                  <p className="font-medium">{a.action}</p>
                                  <p className="text-muted-foreground">{a.why}</p>
                                  <p className="text-emerald-600 dark:text-emerald-400">Impact: {a.impact}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1.5 text-blue-600 dark:text-blue-400">90-Day Actions</p>
                            <div className="space-y-1.5">
                              {growthPlanResult.ninetyDay.map((a, i) => (
                                <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                  <p className="font-medium">{a.action}</p>
                                  <p className="text-muted-foreground">{a.why}</p>
                                  <p className="text-emerald-600 dark:text-emerald-400">Impact: {a.impact}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1.5">12-Month Roadmap</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {growthPlanResult.twelveMonth.map((q, i) => (
                                <div key={i} className="border rounded p-2 text-xs">
                                  <p className="font-medium text-muted-foreground">{q.quarter}</p>
                                  <p className="font-medium mt-0.5">{q.focus}</p>
                                  <p className="text-muted-foreground">{q.goal}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Referral Engine ── */}
                  {sectionKey === 'referral' && (
                    <>
                      {!referralResult ? (
                        <div className="text-center space-y-2 py-2">
                          <p className="text-xs text-muted-foreground">Identify referral partners and the perfect ask to multiply your pipeline from this account.</p>
                          <Button onClick={generateReferral} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-referral">
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                            {isLoading ? 'Identifying...' : 'Find Referral Opportunities'}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setReferralResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                          </div>
                          {referralResult.referralPartners.map((p, i) => (
                            <div key={i} className="border rounded p-2 text-xs space-y-1.5">
                              <p className="font-medium">{p.partnerType}</p>
                              <p className="text-muted-foreground">{p.why}</p>
                              <div className="bg-muted/40 rounded p-1.5">
                                <p className="text-muted-foreground text-[10px] mb-0.5">Intro Script</p>
                                <p className="italic">"{p.introScript}"</p>
                                <div className="flex justify-end mt-1"><CopyBtn text={p.introScript} /></div>
                              </div>
                            </div>
                          ))}
                          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">The Ask</p>
                            <p className="text-xs italic">"{referralResult.referralAsk}"</p>
                            <div className="flex justify-end mt-1"><CopyBtn text={referralResult.referralAsk} /></div>
                          </div>
                          <div className="bg-muted/30 rounded p-2">
                            <p className="text-xs font-medium mb-0.5">Incentive Idea</p>
                            <p className="text-xs text-muted-foreground">{referralResult.incentiveIdea}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
