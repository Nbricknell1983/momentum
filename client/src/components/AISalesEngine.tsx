import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, patchLead } from '@/store';
import { X, Sparkles, Loader2, Copy, Check, RotateCcw, Pin, ChevronDown, Phone, Shield, Mail, Users, Search, MessageSquare, FileText, TrendingUp, Mic, MicOff, Upload, AlertTriangle, Clock } from 'lucide-react';
import GrowthPlanSection from '@/components/GrowthPlanSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { Lead, Stage, AiCallPrepOutput, AiObjectionOutput, AiFollowUpOutput, AiConversationInsightsOutput, AiProspectOutput } from '@/lib/types';

type EngineSection = 'pre_call' | 'objection' | 'follow_up' | 'growth_plan' | 'prospect';

interface AISalesEngineProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection?: EngineSection | null;
  selectedLeadOverride?: Lead | null;
  embedded?: boolean;
}

interface PreCallFacts {
  website: string;
  gbp: string;
  reviews: string;
  rating: string;
  gbpPhotos: string;
  gbpPosts30Days: string;
  socialProfiles: string;
}

interface PreCallGap {
  title: string;
  evidence: string;
  impact: string;
}

interface PreCallResult {
  whatTheyDo: string;
  strengths: string[];
  facts: PreCallFacts;
  gaps: PreCallGap[];
  salesHook: string;
}

interface ObjectionResult {
  objection: string;
  realConcern: string;
  response: string;
  regainControlQuestion: string;
}

interface ConversationInsights {
  summary: string;
  painPoints: string[];
  servicesDiscussed: string[];
  opportunities: string[];
  objections: string[];
  nextSteps: string[];
  sentiment: string;
  keyQuotes: string[];
}

interface FollowUpResult {
  email: string;
  sms: string;
  proposalIntro: string;
}

interface ProspectResult {
  businessName: string;
  suburb: string;
  painPoint: string;
  whyStrongProspect: string;
  openingLine: string;
}

const PRESET_OBJECTIONS = [
  'We tried SEO before and it didn\'t work',
  'We already have someone doing marketing',
  'We don\'t have the budget',
  'Digital doesn\'t work for our industry',
  'Just send me some info',
];

function getDefaultSection(stage?: Stage): EngineSection {
  if (!stage) return 'pre_call';
  if (['suspect', 'contacted', 'engaged'].includes(stage)) return 'pre_call';
  if (['qualified', 'discovery'].includes(stage)) return 'objection';
  if (['proposal'].includes(stage)) return 'follow_up';
  return 'pre_call';
}

const SECTION_CONFIG: Record<EngineSection, { title: string; subtitle: string; icon: typeof Phone }> = {
  pre_call: { title: 'Win Before You Dial', subtitle: '60 seconds of prep changes everything', icon: Phone },
  objection: { title: 'Control the Call', subtitle: 'NEPQ objection handling — ask, don\'t defend', icon: Shield },
  follow_up: { title: 'Win the Follow-Up', subtitle: 'Speed wins deals', icon: Mail },
  growth_plan: { title: 'Growth Plan', subtitle: 'Turn insight into a 12-month strategy', icon: TrendingUp },
  prospect: { title: 'Multiply Your Pipeline', subtitle: 'Turn one call into ten prospects', icon: Users },
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs gap-1" data-testid={`button-copy-${label || 'text'}`}>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export default function AISalesEngine({ isOpen, onClose, activeSection: externalSection, selectedLeadOverride, embedded }: AISalesEngineProps) {
  const leads = useSelector((state: RootState) => state.app.leads);
  const selectedLeadId = useSelector((state: RootState) => state.app.selectedLeadId);
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { orgId, authReady } = useAuth();

  const selectedLead = selectedLeadOverride || leads.find(l => l.id === selectedLeadId) || null;

  const [openSection, setOpenSection] = useState<EngineSection | null>('pre_call');

  const [preCallLoading, setPreCallLoading] = useState(false);
  const [preCallResult, setPreCallResult] = useState<PreCallResult | null>(null);
  const [preCallError, setPreCallError] = useState<string | null>(null);
  const [preCallInputs, setPreCallInputs] = useState({
    businessName: '', location: '', website: '', industry: '', gbpLink: '',
    reviewCount: null as number | null, rating: null as number | null,
    facebookUrl: '', instagramUrl: '', linkedinUrl: '',
    gbpPhotoCount: null as number | null, gbpPostsLast30Days: null as number | null,
  });
  const preCallSaveRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handlePreCallInputChange = useCallback((updater: (prev: any) => any) => {
    setPreCallInputs(prev => {
      const next = updater(prev);
      if (!selectedLead || !orgId || !authReady) return next;
      const FIELD_MAP: Record<string, keyof Lead> = {
        industry: 'industry',
        website: 'website',
      };
      for (const [inputKey, leadField] of Object.entries(FIELD_MAP)) {
        if ((next as any)[inputKey] !== (prev as any)[inputKey]) {
          const value = (next as any)[inputKey];
          dispatch(patchLead({ id: selectedLead.id, updates: { [leadField]: value || undefined } }));
          if (preCallSaveRef.current[inputKey]) clearTimeout(preCallSaveRef.current[inputKey]);
          preCallSaveRef.current[inputKey] = setTimeout(() => {
            updateLeadInFirestore(orgId, selectedLead.id, { [leadField]: value || null, updatedAt: new Date() }, authReady)
              .catch(err => console.error(`[AISalesEngine] Failed to save ${leadField}:`, err));
            delete preCallSaveRef.current[inputKey];
          }, 800);
        }
      }
      return next;
    });
  }, [selectedLead, orgId, authReady, dispatch]);

  const [objectionLoading, setObjectionLoading] = useState(false);
  const [objectionResults, setObjectionResults] = useState<ObjectionResult[]>([]);
  const [objectionError, setObjectionError] = useState<string | null>(null);
  const [selectedObjections, setSelectedObjections] = useState<string[]>([]);
  const [customObjection, setCustomObjection] = useState('');

  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<FollowUpResult | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpInputs, setFollowUpInputs] = useState({ business: '', industry: '', location: '', meetingNotes: '', servicesDiscussed: '', nextStep: '' });
  const [conversationInsights, setConversationInsights] = useState<ConversationInsights | null>(null);

  const [prospectLoading, setProspectLoading] = useState(false);
  const [prospectResults, setProspectResults] = useState<ProspectResult[]>([]);
  const [prospectError, setProspectError] = useState<string | null>(null);
  const [prospectInputs, setProspectInputs] = useState({ businessType: '', suburb: '', nearbySuburbs: '' });

  // Sync form inputs whenever relevant lead data changes (GBP link, reviews, social, industry, website)
  useEffect(() => {
    if (selectedLead) {
      const sd = selectedLead.sourceData;
      setPreCallInputs(prev => ({
        ...prev,
        businessName: selectedLead.companyName || prev.businessName,
        location: selectedLead.territory || selectedLead.areaName || prev.location,
        website: selectedLead.website || prev.website,
        industry: selectedLead.industry || (sd as any)?.category || prev.industry,
        gbpLink: (sd as any)?.googleMapsUrl || prev.gbpLink,
        reviewCount: sd?.googleReviewCount ?? prev.reviewCount,
        rating: sd?.googleRating ?? prev.rating,
        facebookUrl: selectedLead.facebookUrl || prev.facebookUrl,
        instagramUrl: selectedLead.instagramUrl || prev.instagramUrl,
        linkedinUrl: selectedLead.linkedinUrl || prev.linkedinUrl,
      }));
      setFollowUpInputs(prev => ({
        ...prev,
        business: selectedLead.companyName || prev.business,
        industry: selectedLead.industry || (sd as any)?.category || (sd as any)?.googleTypes?.[0] || prev.industry,
        location: selectedLead.territory || selectedLead.areaName || prev.location,
        meetingNotes: selectedLead.notes || prev.meetingNotes,
      }));
      setProspectInputs(prev => ({
        ...prev,
        businessType: selectedLead.industry || (sd as any)?.category || (sd as any)?.googleTypes?.[0] || prev.businessType,
        suburb: selectedLead.areaName || selectedLead.territory || prev.suburb,
      }));
    }
  }, [
    selectedLead?.companyName, selectedLead?.territory, selectedLead?.areaName,
    selectedLead?.website, selectedLead?.industry,
    selectedLead?.sourceData?.googleMapsUrl, selectedLead?.sourceData?.googleReviewCount, selectedLead?.sourceData?.googleRating,
    selectedLead?.facebookUrl, selectedLead?.instagramUrl, selectedLead?.linkedinUrl,
    selectedLead?.notes,
  ]);

  // Reset AI results when switching to a different lead
  useEffect(() => {
    if (selectedLead) {
      setPreCallInputs({
        businessName: selectedLead.companyName || '',
        location: selectedLead.territory || selectedLead.areaName || '',
        website: selectedLead.website || '',
        industry: selectedLead.industry || (selectedLead.sourceData as any)?.category || '',
        gbpLink: (selectedLead.sourceData as any)?.googleMapsUrl || '',
        reviewCount: selectedLead.sourceData?.googleReviewCount ?? null,
        rating: selectedLead.sourceData?.googleRating ?? null,
        facebookUrl: selectedLead.facebookUrl || '',
        instagramUrl: selectedLead.instagramUrl || '',
        linkedinUrl: selectedLead.linkedinUrl || '',
        gbpPhotoCount: null,
        gbpPostsLast30Days: null,
      });
      if (selectedLead.aiCallPrep) {
        setPreCallResult(selectedLead.aiCallPrep as unknown as PreCallResult);
      } else {
        setPreCallResult(null);
      }
      if (selectedLead.aiObjectionResponses?.length) {
        setObjectionResults(selectedLead.aiObjectionResponses);
      } else {
        setObjectionResults([]);
      }
      if (selectedLead.aiFollowUp) {
        setFollowUpResult({ email: selectedLead.aiFollowUp.email, sms: selectedLead.aiFollowUp.sms, proposalIntro: selectedLead.aiFollowUp.proposalIntro });
      } else {
        setFollowUpResult(null);
      }
      if (selectedLead.aiConversationInsights) {
        setConversationInsights(selectedLead.aiConversationInsights);
      } else {
        setConversationInsights(null);
      }
      if (selectedLead.aiProspects?.length) {
        setProspectResults(selectedLead.aiProspects);
      } else {
        setProspectResults([]);
      }
      setPreCallError(null);
      setObjectionError(null);
      setFollowUpError(null);
      setProspectError(null);
    }
  }, [selectedLead?.id]);

  useEffect(() => {
    if (externalSection) {
      setOpenSection(externalSection);
    } else if (selectedLead) {
      setOpenSection(getDefaultSection(selectedLead.stage));
    }
  }, [externalSection, selectedLead]);

  const handlePreCall = async () => {
    if (!preCallInputs.businessName.trim()) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setPreCallLoading(true);
    setPreCallResult(null);
    setPreCallError(null);
    try {
      // Build sitemap section summary from lead data
      const sitemapPages = selectedLead?.sitemapPages || [];
      const sitemapSections = sitemapPages.reduce<Record<string, number>>((acc, p) => {
        try {
          const parts = new URL(p.url).pathname.split('/').filter(Boolean);
          const section = parts.length > 0 ? parts[0] : '/';
          acc[section] = (acc[section] || 0) + 1;
        } catch { /* skip */ }
        return acc;
      }, {});

      const payload = {
        businessName: preCallInputs.businessName,
        location: preCallInputs.location,
        websiteUrl: preCallInputs.website,
        hasWebsite: !!preCallInputs.website.trim(),
        googleMapsUrl: preCallInputs.gbpLink,
        hasGBP: !!preCallInputs.gbpLink.trim(),
        reviewCount: preCallInputs.reviewCount,
        rating: preCallInputs.rating,
        gbpPhotoCount: preCallInputs.gbpPhotoCount,
        gbpPostsLast30Days: preCallInputs.gbpPostsLast30Days,
        facebookUrl: preCallInputs.facebookUrl || null,
        instagramUrl: preCallInputs.instagramUrl || null,
        linkedinUrl: preCallInputs.linkedinUrl || null,
        industry: preCallInputs.industry,
        sitemapPageCount: sitemapPages.length || null,
        sitemapSections: Object.keys(sitemapSections).length > 0 ? sitemapSections : null,
      };
      const res = await fetch('/api/ai/sales-engine/pre-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate call prep');
      const data = await res.json();
      setPreCallResult(data);
      if (selectedLead && orgId && authReady) {
        const aiCallPrep: AiCallPrepOutput = { ...data, generatedAt: new Date() };
        updateLeadInFirestore(orgId, selectedLead.id, { aiCallPrep } as Partial<Lead>, authReady).catch(console.error);
        dispatch(patchLead({ id: selectedLead.id, updates: { aiCallPrep } }));
      }
    } catch (err) {
      setPreCallError('Failed to generate call prep. Please try again.');
    } finally {
      setPreCallLoading(false);
    }
  };

  const handleObjection = async () => {
    const objections = [...selectedObjections];
    if (customObjection.trim()) objections.push(customObjection.trim());
    if (objections.length === 0) {
      toast({ title: 'Select or enter at least one objection', variant: 'destructive' });
      return;
    }
    setObjectionLoading(true);
    setObjectionResults([]);
    setObjectionError(null);
    try {
      const res = await fetch('/api/ai/sales-engine/objection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objections,
          leadContext: selectedLead ? {
            businessName: selectedLead.companyName,
            industry: selectedLead.sourceData?.category,
            stage: selectedLead.stage,
          } : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate objection responses');
      const data = await res.json();
      const responses = data.responses || [];
      setObjectionResults(responses);
      if (selectedLead && orgId && authReady && responses.length > 0) {
        const aiObjectionResponses: AiObjectionOutput[] = responses;
        updateLeadInFirestore(orgId, selectedLead.id, { aiObjectionResponses } as Partial<Lead>, authReady).catch(console.error);
        dispatch(patchLead({ id: selectedLead.id, updates: { aiObjectionResponses } }));
      }
    } catch (err) {
      setObjectionError('Failed to generate responses. Please try again.');
    } finally {
      setObjectionLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpInputs.business.trim()) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setFollowUpLoading(true);
    setFollowUpResult(null);
    setFollowUpError(null);
    try {
      const strategyDiagnosis = selectedLead?.aiGrowthPlan?.strategyDiagnosis;
      const res = await fetch('/api/ai/sales-engine/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...followUpInputs,
          conversationInsights: conversationInsights || undefined,
          strategyDiagnosis: strategyDiagnosis || undefined,
          hasGrowthPlan: !!(strategyDiagnosis),
        }),
      });
      if (!res.ok) throw new Error('Failed to generate follow-up');
      const data = await res.json();
      const result = {
        email: data.email ? `Subject: ${data.email.subject}\n\n${data.email.body}` : 'Unable to generate email',
        sms: data.sms?.message || 'Unable to generate SMS',
        proposalIntro: data.proposalIntro?.opening || 'Unable to generate proposal intro',
      };
      setFollowUpResult(result);
      if (selectedLead && orgId && authReady) {
        const aiFollowUp: AiFollowUpOutput = { ...result, generatedAt: new Date() };
        updateLeadInFirestore(orgId, selectedLead.id, { aiFollowUp } as Partial<Lead>, authReady).catch(console.error);
        dispatch(patchLead({ id: selectedLead.id, updates: { aiFollowUp } }));
      }
    } catch (err) {
      setFollowUpError('Failed to generate follow-up. Please try again.');
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handleProspect = async () => {
    if (!prospectInputs.businessType.trim() || !prospectInputs.suburb.trim()) {
      toast({ title: 'Business type and suburb required', variant: 'destructive' });
      return;
    }
    setProspectLoading(true);
    setProspectResults([]);
    setProspectError(null);
    try {
      const res = await fetch('/api/ai/sales-engine/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prospectInputs),
      });
      if (!res.ok) throw new Error('Failed to find prospects');
      const data = await res.json();
      const prospects: AiProspectOutput[] = data.prospects || [];
      setProspectResults(prospects);
      if (selectedLead && orgId && authReady && prospects.length > 0) {
        updateLeadInFirestore(orgId, selectedLead.id, { aiProspects: prospects } as Partial<Lead>, authReady).catch(console.error);
        dispatch(patchLead({ id: selectedLead.id, updates: { aiProspects: prospects } }));
      }
    } catch (err) {
      setProspectError('Failed to find prospects. Please try again.');
    } finally {
      setProspectLoading(false);
    }
  };

  const saveToNotes = (text: string) => {
    if (!selectedLead) {
      toast({ title: 'No lead selected' });
      return;
    }
    const existingNotes = selectedLead.notes || '';
    const separator = existingNotes ? '\n\n---\n\n' : '';
    const timestamp = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const updatedNotes = existingNotes + separator + `[AI Sales Engine - ${timestamp}]\n${text}`;
    dispatch(patchLead({ id: selectedLead.id, updates: { notes: updatedNotes } }));
    if (orgId && authReady) {
      updateLeadInFirestore(orgId, selectedLead.id, { notes: updatedNotes, updatedAt: new Date() }, authReady)
        .catch(err => console.error('[AISalesEngine] Failed to save notes:', err));
    }
    toast({ title: 'Saved to notes' });
  };

  if (!isOpen) return null;

  const sections: EngineSection[] = ['pre_call', 'objection', 'follow_up', 'growth_plan', 'prospect'];

  const sectionContent = (
    <div className={embedded ? "space-y-1" : "p-3 space-y-1"}>
      {sections.map((sectionKey) => {
        const config = SECTION_CONFIG[sectionKey];
        const Icon = config.icon;
        const isSectionOpen = openSection === sectionKey;

        return (
          <div key={sectionKey} className="border rounded-lg overflow-hidden" data-testid={`section-${sectionKey}`}>
            <button
              onClick={() => setOpenSection(prev => prev === sectionKey ? null : sectionKey)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${isSectionOpen ? 'bg-muted/30' : ''}`}
              data-testid={`button-toggle-${sectionKey}`}
            >
              <Icon className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{config.title}</p>
                <p className="text-[11px] text-muted-foreground">{config.subtitle}</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isSectionOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSectionOpen && (
              <div className="px-3 pb-3 space-y-3">
                <Separator />
                {sectionKey === 'pre_call' && (
                  <PreCallSection
                    inputs={preCallInputs}
                    setInputs={handlePreCallInputChange}
                    loading={preCallLoading}
                    result={preCallResult}
                    error={preCallError}
                    onGenerate={handlePreCall}
                    onSaveToNotes={saveToNotes}
                    hasLead={!!selectedLead}
                    generatedAt={selectedLead?.aiCallPrep?.generatedAt}
                  />
                )}
                {sectionKey === 'objection' && (
                  <ObjectionSection
                    selectedObjections={selectedObjections}
                    setSelectedObjections={setSelectedObjections}
                    customObjection={customObjection}
                    setCustomObjection={setCustomObjection}
                    loading={objectionLoading}
                    results={objectionResults}
                    error={objectionError}
                    onGenerate={handleObjection}
                    onSaveToNotes={saveToNotes}
                    hasLead={!!selectedLead}
                  />
                )}
                {sectionKey === 'follow_up' && (
                  <FollowUpSection
                    inputs={followUpInputs}
                    setInputs={setFollowUpInputs}
                    loading={followUpLoading}
                    result={followUpResult}
                    error={followUpError}
                    onGenerate={handleFollowUp}
                    onSaveToNotes={saveToNotes}
                    hasLead={!!selectedLead}
                    conversationInsights={conversationInsights}
                    onInsightsChange={(insights) => {
                      setConversationInsights(insights);
                      if (insights && selectedLead && orgId && authReady) {
                        const now = new Date();
                        const aiConversationInsights: AiConversationInsightsOutput = { ...insights, generatedAt: now };
                        updateLeadInFirestore(orgId, selectedLead.id, {
                          aiConversationInsights,
                          lastConversationAt: now,
                        } as Partial<Lead>, authReady).catch(console.error);
                        dispatch(patchLead({ id: selectedLead.id, updates: { aiConversationInsights, lastConversationAt: now } }));
                      }
                    }}
                  />
                )}
                {sectionKey === 'growth_plan' && (
                  <GrowthPlanSection
                    lead={selectedLead}
                    onSaveToNotes={saveToNotes}
                    onSaveGrowthPlan={(growthPlanData) => {
                      if (selectedLead && orgId && authReady) {
                        const aiGrowthPlan = { ...growthPlanData, generatedAt: new Date() };
                        updateLeadInFirestore(orgId, selectedLead.id, { aiGrowthPlan } as Partial<Lead>, authReady).catch(console.error);
                        dispatch(patchLead({ id: selectedLead.id, updates: { aiGrowthPlan } }));
                      }
                    }}
                  />
                )}
                {sectionKey === 'prospect' && (
                  <ProspectSection
                    inputs={prospectInputs}
                    setInputs={setProspectInputs}
                    loading={prospectLoading}
                    results={prospectResults}
                    error={prospectError}
                    onGenerate={handleProspect}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full" data-testid="panel-ai-sales-engine-embedded">
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="font-semibold text-sm">AI Sales Engine</h3>
            <p className="text-[11px] text-muted-foreground">Prep. Handle. Follow up. Multiply.</p>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            {sectionContent}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="fixed top-0 right-0 h-full w-[420px] bg-background border-l shadow-xl z-50 flex flex-col" data-testid="panel-ai-sales-engine">
      <div className="flex items-center justify-between gap-2 p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <div>
            <h3 className="font-semibold text-sm">AI Sales Engine</h3>
            <p className="text-[11px] text-muted-foreground">Prep. Handle. Follow up. Multiply.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" data-testid="button-close-ai-engine">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {selectedLead && (
        <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-xs text-muted-foreground">Active Lead</p>
          <p className="text-sm font-medium truncate" data-testid="text-active-lead">{selectedLead.companyName}</p>
        </div>
      )}

      <ScrollArea className="flex-1">
        {sectionContent}
      </ScrollArea>
    </div>
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

function FactsPanel({ facts }: { facts: PreCallFacts }) {
  const rows = [
    { label: 'Website', value: facts.website },
    { label: 'Google Business Profile', value: facts.gbp },
    { label: 'Reviews', value: facts.reviews },
    { label: 'Rating', value: facts.rating },
    { label: 'GBP Photos', value: facts.gbpPhotos },
    { label: 'GBP Posts (30 days)', value: facts.gbpPosts30Days },
    { label: 'Social Profiles', value: facts.socialProfiles },
  ];
  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1" data-testid="facts-panel">
      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Facts</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">{r.label}</span>
          <span className="text-xs font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function GapCard({ gap, index, onSave }: { gap: PreCallGap; index: number; onSave?: (text: string) => void }) {
  return (
    <div className="border rounded-lg p-2.5 space-y-1 bg-muted/20" data-testid={`gap-card-${index}`}>
      <p className="text-sm font-medium">{index + 1}. {gap.title}</p>
      <p className="text-xs text-muted-foreground">{gap.evidence}</p>
      <p className="text-xs text-amber-700 dark:text-amber-400">{gap.impact}</p>
      <div className="flex gap-1 pt-0.5">
        <CopyButton text={`${gap.title}\n${gap.evidence}\n${gap.impact}`} label={`gap-${index}`} />
        {onSave && (
          <Button variant="ghost" size="sm" onClick={() => onSave(`Gap: ${gap.title}\nEvidence: ${gap.evidence}\nImpact: ${gap.impact}`)} className="h-7 text-xs gap-1">
            <Pin className="h-3 w-3" /> Save
          </Button>
        )}
      </div>
    </div>
  );
}

function PreCallSection({ inputs, setInputs, loading, result, error, onGenerate, onSaveToNotes, hasLead, generatedAt }: {
  inputs: { businessName: string; location: string; website: string; industry: string; gbpLink: string; reviewCount?: number | null; rating?: number | null; facebookUrl?: string; instagramUrl?: string; linkedinUrl?: string; gbpPhotoCount?: number | null; gbpPostsLast30Days?: number | null };
  setInputs: (fn: (prev: any) => any) => void;
  loading: boolean;
  result: PreCallResult | null;
  error: string | null;
  onGenerate: () => void;
  onSaveToNotes: (text: string) => void;
  hasLead: boolean;
  generatedAt?: Date;
}) {
  // Always compute facts live from current inputs so they never go stale
  const liveFacts: PreCallFacts = {
    website: inputs.website?.trim() ? 'yes' : 'no',
    gbp: inputs.gbpLink?.trim() ? 'yes' : 'no',
    reviews: inputs.reviewCount != null ? String(inputs.reviewCount) : 'unknown',
    rating: inputs.rating != null ? String(inputs.rating) : 'unknown',
    gbpPhotos: inputs.gbpPhotoCount != null ? String(inputs.gbpPhotoCount) : 'unknown',
    gbpPosts30Days: inputs.gbpPostsLast30Days != null ? String(inputs.gbpPostsLast30Days) : 'unknown',
    socialProfiles: (inputs.facebookUrl || inputs.instagramUrl || inputs.linkedinUrl) ? 'detected' : 'not detected',
  };

  const genDate = generatedAt ? new Date(generatedAt) : null;
  const genLabel = genDate
    ? genDate.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + genDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Business Name *</Label>
          <Input value={inputs.businessName} onChange={e => setInputs(p => ({ ...p, businessName: e.target.value }))} placeholder="e.g. Smith's Plumbing" className="h-8 text-sm" data-testid="input-precall-business" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Location</Label>
            <Input value={inputs.location} onChange={e => setInputs(p => ({ ...p, location: e.target.value }))} placeholder="Suburb" className="h-8 text-sm" data-testid="input-precall-location" />
          </div>
          <div>
            <Label className="text-xs">Industry</Label>
            <Input value={inputs.industry} onChange={e => setInputs(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Plumbing" className="h-8 text-sm" data-testid="input-precall-industry" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Website</Label>
          <Input value={inputs.website} onChange={e => setInputs(p => ({ ...p, website: e.target.value }))} placeholder="https://..." className="h-8 text-sm" data-testid="input-precall-website" />
        </div>
      </div>

      <FactsPanel facts={liveFacts} />

      <Button onClick={onGenerate} disabled={loading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-precall">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : result ? 'Regenerate Call Prep' : 'Generate Call Prep'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {result && (
        <div className="space-y-3 pt-1">
          {genLabel && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>Last generated {genLabel} — click Regenerate for fresh analysis</span>
            </div>
          )}
          <ResultCard title="What they do and who they serve" content={result.whatTheyDo} onSave={hasLead ? onSaveToNotes : undefined} />
          <ResultCard title="3 strengths in their online presence" content={result.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')} onSave={hasLead ? onSaveToNotes : undefined} />
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">AI Insights — Gaps</p>
            {result.gaps.map((gap, i) => (
              <GapCard key={i} gap={gap} index={i} onSave={hasLead ? onSaveToNotes : undefined} />
            ))}
          </div>
          <ResultCard title="Sales Hook" content={result.salesHook} onSave={hasLead ? onSaveToNotes : undefined} highlight />
        </div>
      )}
    </div>
  );
}

function ObjectionSection({ selectedObjections, setSelectedObjections, customObjection, setCustomObjection, loading, results, error, onGenerate, onSaveToNotes, hasLead }: {
  selectedObjections: string[];
  setSelectedObjections: (v: string[]) => void;
  customObjection: string;
  setCustomObjection: (v: string) => void;
  loading: boolean;
  results: ObjectionResult[];
  error: string | null;
  onGenerate: () => void;
  onSaveToNotes: (text: string) => void;
  hasLead: boolean;
}) {
  const toggleObjection = (obj: string) => {
    setSelectedObjections(
      selectedObjections.includes(obj)
        ? selectedObjections.filter(o => o !== obj)
        : [...selectedObjections, obj]
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Common Objections</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_OBJECTIONS.map((obj) => (
            <Badge
              key={obj}
              variant={selectedObjections.includes(obj) ? 'default' : 'outline'}
              className="cursor-pointer text-[11px] py-0.5"
              onClick={() => toggleObjection(obj)}
              data-testid={`badge-objection-${obj.slice(0, 20).replace(/\s/g, '-')}`}
            >
              {obj}
            </Badge>
          ))}
        </div>
        <div>
          <Label className="text-xs">Custom Objection</Label>
          <Input value={customObjection} onChange={e => setCustomObjection(e.target.value)} placeholder="Type a specific objection..." className="h-8 text-sm" data-testid="input-custom-objection" />
        </div>
      </div>
      <Button onClick={onGenerate} disabled={loading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-objection">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : 'Generate Responses'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {results.length > 0 && (
        <div className="space-y-3 pt-1">
          {results.map((r, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20" data-testid={`objection-result-${i}`}>
              <p className="text-xs font-medium text-amber-600">"{r.objection}"</p>
              <div className="space-y-1.5">
                <div>
                  <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wide">What's Really Going On</p>
                  <p className="text-sm">{r.realConcern}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wide">NEPQ Response</p>
                  <p className="text-sm">{r.response}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-violet-500 uppercase tracking-wide">Consequence Question</p>
                  <p className="text-sm italic">{r.regainControlQuestion}</p>
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                <CopyButton text={r.response} label={`response-${i}`} />
                <CopyButton text={r.regainControlQuestion} label={`question-${i}`} />
                {hasLead && (
                  <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(`Objection: ${r.objection}\nResponse: ${r.response}\nRegain: ${r.regainControlQuestion}`)} className="h-7 text-xs gap-1" data-testid={`button-save-objection-${i}`}>
                    <Pin className="h-3 w-3" /> Save
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ insights, onSaveToNotes, hasLead }: { insights: ConversationInsights; onSaveToNotes: (text: string) => void; hasLead: boolean }) {
  const sentimentColors: Record<string, string> = {
    positive: 'text-green-600 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    neutral: 'text-muted-foreground',
  };
  const sections = [
    { key: 'painPoints', label: 'Pain Points', icon: '🔴', items: insights.painPoints },
    { key: 'servicesDiscussed', label: 'Services Discussed', icon: '🔧', items: insights.servicesDiscussed },
    { key: 'opportunities', label: 'Opportunities', icon: '💡', items: insights.opportunities },
    { key: 'objections', label: 'Objections', icon: '⚠️', items: insights.objections },
    { key: 'nextSteps', label: 'Next Steps', icon: '➡️', items: insights.nextSteps },
  ];

  const fullText = `Conversation Summary: ${insights.summary}\n\n${sections.filter(s => s.items.length > 0).map(s => `${s.label}:\n${s.items.map(i => `- ${i}`).join('\n')}`).join('\n\n')}`;

  return (
    <div className="space-y-2 border rounded-lg p-3 bg-muted/20" data-testid="insights-panel">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">Conversation Intelligence</p>
        <span className={`text-[10px] font-medium ${sentimentColors[insights.sentiment] || sentimentColors.neutral}`}>
          {insights.sentiment}
        </span>
      </div>
      <p className="text-sm">{insights.summary}</p>

      {sections.map(section => section.items.length > 0 && (
        <div key={section.key}>
          <p className="text-[10px] font-medium text-muted-foreground mt-1">{section.icon} {section.label}</p>
          <ul className="space-y-0.5 mt-0.5">
            {section.items.map((item, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <span className="text-muted-foreground mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {insights.keyQuotes.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mt-1">💬 Key Quotes</p>
          {insights.keyQuotes.map((q, i) => (
            <p key={i} className="text-xs italic text-muted-foreground pl-2 border-l-2 border-muted mt-1">"{q}"</p>
          ))}
        </div>
      )}

      <div className="flex gap-1 pt-1">
        <CopyButton text={fullText} label="insights" />
        {hasLead && (
          <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(fullText)} className="h-7 text-xs gap-1" data-testid="button-save-insights">
            <Pin className="h-3 w-3" /> Save
          </Button>
        )}
      </div>
    </div>
  );
}

function FollowUpSection({ inputs, setInputs, loading, result, error, onGenerate, onSaveToNotes, hasLead, conversationInsights, onInsightsChange }: {
  inputs: { business: string; industry: string; location: string; meetingNotes: string; servicesDiscussed: string; nextStep: string };
  setInputs: (fn: (prev: typeof inputs) => typeof inputs) => void;
  loading: boolean;
  result: FollowUpResult | null;
  error: string | null;
  onGenerate: () => void;
  onSaveToNotes: (text: string) => void;
  hasLead: boolean;
  conversationInsights: ConversationInsights | null;
  onInsightsChange: (insights: ConversationInsights | null) => void;
}) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const speechRecognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const processAudio = async (blob: Blob, liveText: string) => {
    setTranscribing(true);
    setLiveTranscript('');
    try {
      // Try Whisper first for high-quality transcription
      const formData = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('audio', blob, `recording.${ext}`);
      const res = await fetch('/api/ai/sales-engine/transcribe-meeting', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Transcription failed');
      }
      const data = await res.json();

      const finalTranscript = data.transcript || liveText;
      if (finalTranscript) {
        setInputs(p => ({
          ...p,
          meetingNotes: p.meetingNotes ? `${p.meetingNotes}\n\n${finalTranscript}` : finalTranscript,
        }));
      }
      if (data.insights) {
        // Merge rawTranscript into insights so it persists to Firestore
        const insightsWithTranscript = data.transcript
          ? { ...data.insights, rawTranscript: data.transcript }
          : data.insights;
        onInsightsChange(insightsWithTranscript);
        if (data.insights.servicesDiscussed?.length > 0) {
          setInputs(p => ({
            ...p,
            servicesDiscussed: p.servicesDiscussed || data.insights.servicesDiscussed.join(', '),
          }));
        }
        if (data.insights.nextSteps?.length > 0) {
          setInputs(p => ({
            ...p,
            nextStep: p.nextStep || data.insights.nextSteps[0],
          }));
        }
      }
      toast({ title: 'Transcript ready', description: data.transcript ? 'AI cleaned up your recording.' : 'Recording processed.' });
    } catch (err: any) {
      // Whisper failed — fall back to Web Speech live transcript if available
      if (liveText) {
        setInputs(p => ({
          ...p,
          meetingNotes: p.meetingNotes ? `${p.meetingNotes}\n\n${liveText}` : liveText,
        }));
        toast({ title: 'Using live transcript', description: 'Whisper unavailable — live text saved instead.' });
      } else {
        toast({ title: 'Processing failed', description: err.message, variant: 'destructive' });
      }
    } finally {
      setTranscribing(false);
    }
  };

  const startLiveSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-AU';

    let finalText = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + ' ';
        } else {
          interim = transcript;
        }
      }
      const combined = finalText + interim;
      liveTranscriptRef.current = finalText.trim();
      setLiveTranscript(combined.trim());
    };

    recognition.onerror = () => {};
    recognition.start();
    speechRecognitionRef.current = recognition;
  };

  const stopLiveSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
      speechRecognitionRef.current = null;
    }
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Recording not supported', description: 'Your browser does not support audio recording. Please use Chrome or Edge.', variant: 'destructive' });
      return;
    }
    try {
      liveTranscriptRef.current = '';
      setLiveTranscript('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        stopLiveSpeechRecognition();
        const blobType = mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: blobType });
        processAudio(blob, liveTranscriptRef.current);
      };
      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);
      startLiveSpeechRecognition();
    } catch (err) {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access to record.', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecording(false);
    setMediaRecorder(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: 'File too large', description: 'Maximum file size is 25MB', variant: 'destructive' });
      return;
    }
    await processAudio(file, '');
    e.target.value = '';
  };

  // Parse email into subject + body for display
  const parsedEmail = result?.email
    ? (() => {
        const raw = result.email;
        if (raw.startsWith('Subject:')) {
          const newlineIdx = raw.indexOf('\n\n');
          if (newlineIdx !== -1) {
            return { subject: raw.slice('Subject:'.length, newlineIdx).trim(), body: raw.slice(newlineIdx + 2) };
          }
        }
        return { subject: '', body: raw };
      })()
    : null;

  // Context sources indicator
  const contextSources: string[] = [];
  if (conversationInsights) contextSources.push('Conversation recording');
  if (inputs.meetingNotes?.trim()) contextSources.push('Meeting notes');
  if (inputs.servicesDiscussed?.trim()) contextSources.push('Services discussed');

  return (
    <div className="space-y-3" data-testid="followup-section">

      {/* ── Context bar ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30 border">
        {inputs.business && <span className="text-[10px] px-2 py-0.5 rounded-full bg-background border font-medium">{inputs.business}</span>}
        {inputs.industry && <span className="text-[10px] px-2 py-0.5 rounded-full bg-background border text-muted-foreground">{inputs.industry}</span>}
        {inputs.location && <span className="text-[10px] px-2 py-0.5 rounded-full bg-background border text-muted-foreground">{inputs.location}</span>}
        {!inputs.business && <span className="text-[10px] text-muted-foreground italic">Open a lead to auto-populate context</span>}
      </div>

      {/* ── Step 1: Capture conversation ─────────────────────── */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Capture the conversation</p>

        <div className="flex gap-2">
          {!isRecording ? (
            <Button variant="outline" size="sm" onClick={startRecording} disabled={transcribing}
              className="flex-1 h-9 text-xs gap-1.5 border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              data-testid="button-start-recording">
              <Mic className="h-3.5 w-3.5 text-violet-500" />
              Record Notes
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={stopRecording}
              className="flex-1 h-9 text-xs gap-1.5 animate-pulse"
              data-testid="button-stop-recording">
              <MicOff className="h-3.5 w-3.5" />
              Stop ({formatDuration(recordingDuration)})
            </Button>
          )}
          <label className="flex-1">
            <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload}
              disabled={transcribing || isRecording} data-testid="input-upload-audio" />
            <Button variant="outline" size="sm" asChild className="w-full h-9 text-xs gap-1.5 cursor-pointer"
              disabled={transcribing || isRecording}>
              <span><Upload className="h-3.5 w-3.5" />Upload Audio</span>
            </Button>
          </label>
        </div>

        {isRecording && (
          <div className="border border-violet-500/30 rounded-lg p-2.5 bg-violet-500/5 space-y-1" data-testid="live-transcript-preview">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-500 uppercase tracking-wide">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
              Listening live
            </div>
            {liveTranscript
              ? <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{liveTranscript}</p>
              : <p className="text-xs text-muted-foreground italic">Start speaking — transcript will appear here...</p>
            }
          </div>
        )}

        {transcribing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2.5 border rounded-lg bg-muted/20">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
            AI is extracting insights from your recording...
          </div>
        )}

        {conversationInsights && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Conversation insights extracted
            </div>
            <InsightsPanel insights={conversationInsights} onSaveToNotes={onSaveToNotes} hasLead={hasLead} />
          </div>
        )}
      </div>

      {/* ── Step 2: Add context ───────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Add context (optional)</p>
        <div>
          <Label className="text-xs">Meeting Notes</Label>
          <Textarea value={inputs.meetingNotes} onChange={e => setInputs(p => ({ ...p, meetingNotes: e.target.value }))}
            placeholder="What was discussed on the call..." className="text-sm min-h-[55px]"
            data-testid="input-followup-notes" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Services Discussed</Label>
            <Input value={inputs.servicesDiscussed} onChange={e => setInputs(p => ({ ...p, servicesDiscussed: e.target.value }))}
              placeholder="SEO, Local Ads..." className="h-8 text-sm" data-testid="input-followup-services" />
          </div>
          <div>
            <Label className="text-xs">Agreed Next Step</Label>
            <Input value={inputs.nextStep} onChange={e => setInputs(p => ({ ...p, nextStep: e.target.value }))}
              placeholder="Send proposal..." className="h-8 text-sm" data-testid="input-followup-nextstep" />
          </div>
        </div>
      </div>

      {/* ── Generate ─────────────────────────────────────────── */}
      {contextSources.length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />
          Using: {contextSources.join(' + ')}
        </p>
      )}

      <Button onClick={onGenerate} disabled={loading || !inputs.business.trim()} className="w-full h-9 text-sm gap-2" data-testid="button-generate-followup">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : result ? 'Regenerate Follow-Up' : 'Generate Follow-Up'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {/* ── Result ───────────────────────────────────────────── */}
      {result && (
        <div className="space-y-2 pt-1">
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="email" className="text-xs flex-1" data-testid="tab-followup-email">Email</TabsTrigger>
              <TabsTrigger value="sms" className="text-xs flex-1" data-testid="tab-followup-sms">SMS</TabsTrigger>
              <TabsTrigger value="proposal" className="text-xs flex-1" data-testid="tab-followup-proposal">Proposal Intro</TabsTrigger>
            </TabsList>

            <TabsContent value="email">
              <div className="border rounded-lg overflow-hidden bg-muted/20">
                {parsedEmail?.subject && (
                  <div className="px-3 py-2 bg-muted/40 border-b">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Subject</p>
                    <p className="text-sm font-medium">{parsedEmail.subject}</p>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{parsedEmail?.body || result.email}</p>
                  <div className="flex gap-1 pt-2">
                    <CopyButton text={result.email} label="email" />
                    {hasLead && (
                      <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(`Follow-up Email:\n${result.email}`)} className="h-7 text-xs gap-1" data-testid="button-save-email">
                        <Pin className="h-3 w-3" /> Save
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sms">
              <div className="border rounded-lg p-3 bg-muted/20">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SMS Message</p>
                  <p className={`text-[10px] ${result.sms.length > 140 ? 'text-amber-500' : 'text-muted-foreground'}`}>{result.sms.length}/160 chars</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{result.sms}</p>
                <div className="flex gap-1 pt-2">
                  <CopyButton text={result.sms} label="sms" />
                  {hasLead && (
                    <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(`Follow-up SMS:\n${result.sms}`)} className="h-7 text-xs gap-1" data-testid="button-save-sms">
                      <Pin className="h-3 w-3" /> Save
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="proposal">
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-sm whitespace-pre-wrap">{result.proposalIntro}</p>
                <div className="flex gap-1 pt-2">
                  <CopyButton text={result.proposalIntro} label="proposal" />
                  {hasLead && (
                    <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(`Proposal Intro:\n${result.proposalIntro}`)} className="h-7 text-xs gap-1" data-testid="button-save-proposal">
                      <Pin className="h-3 w-3" /> Save
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function ProspectSection({ inputs, setInputs, loading, results, error, onGenerate }: {
  inputs: { businessType: string; suburb: string; nearbySuburbs: string };
  setInputs: (fn: (prev: typeof inputs) => typeof inputs) => void;
  loading: boolean;
  results: ProspectResult[];
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Business Type *</Label>
          <Input value={inputs.businessType} onChange={e => setInputs(p => ({ ...p, businessType: e.target.value }))} placeholder="e.g. Plumber, Dentist" className="h-8 text-sm" data-testid="input-prospect-type" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Suburb *</Label>
            <Input value={inputs.suburb} onChange={e => setInputs(p => ({ ...p, suburb: e.target.value }))} placeholder="e.g. Parramatta" className="h-8 text-sm" data-testid="input-prospect-suburb" />
          </div>
          <div>
            <Label className="text-xs">Nearby Suburbs</Label>
            <Input value={inputs.nearbySuburbs} onChange={e => setInputs(p => ({ ...p, nearbySuburbs: e.target.value }))} placeholder="e.g. Auburn, Granville" className="h-8 text-sm" data-testid="input-prospect-nearby" />
          </div>
        </div>
      </div>
      <Button onClick={onGenerate} disabled={loading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-prospects">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {loading ? 'Finding Prospects...' : 'Find Similar Prospects'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {results.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">{results.length} prospects found</p>
          {results.map((prospect, i) => (
            <div key={i} className="border rounded-lg p-2.5 space-y-1 bg-muted/20" data-testid={`prospect-result-${i}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{prospect.businessName}</p>
                  <p className="text-[11px] text-muted-foreground">{prospect.suburb}</p>
                </div>
              </div>
              <p className="text-xs"><span className="font-medium">Pain:</span> {prospect.painPoint}</p>
              <p className="text-xs"><span className="font-medium">Why:</span> {prospect.whyStrongProspect}</p>
              <div className="flex gap-1 pt-1">
                <CopyButton text={prospect.openingLine} label={`opening-${i}`} />
                <CopyButton text={`${prospect.businessName} - ${prospect.suburb}`} label={`name-${i}`} />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={onGenerate} className="w-full gap-1 text-xs" data-testid="button-regenerate-prospects">
            <RotateCcw className="h-3 w-3" /> Find More
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultCard({ title, content, onSave, highlight }: { title: string; content: string; onSave?: (text: string) => void; highlight?: boolean }) {
  return (
    <div className={`border rounded-lg p-2.5 space-y-1 ${highlight ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-muted/20'}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      <p className="text-sm whitespace-pre-wrap">{content}</p>
      <div className="flex gap-1 pt-0.5">
        <CopyButton text={content} label={title.toLowerCase().replace(/\s/g, '-')} />
        {onSave && (
          <Button variant="ghost" size="sm" onClick={() => onSave(`${title}: ${content}`)} className="h-7 text-xs gap-1">
            <Pin className="h-3 w-3" /> Save
          </Button>
        )}
      </div>
    </div>
  );
}
