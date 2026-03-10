import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, updateLead } from '@/store';
import { X, Sparkles, Loader2, Copy, Check, RotateCcw, Pin, ChevronDown, Phone, Shield, Mail, Users, Search, MessageSquare, FileText, TrendingUp } from 'lucide-react';
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
import { Lead, Stage } from '@/lib/types';

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
  objection: { title: 'Control the Call', subtitle: 'Prepared reps don\'t freeze', icon: Shield },
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

  const [openSection, setOpenSection] = useState<EngineSection>('pre_call');

  const [preCallLoading, setPreCallLoading] = useState(false);
  const [preCallResult, setPreCallResult] = useState<PreCallResult | null>(null);
  const [preCallError, setPreCallError] = useState<string | null>(null);
  const [preCallInputs, setPreCallInputs] = useState({
    businessName: '', location: '', website: '', industry: '', gbpLink: '',
    reviewCount: null as number | null, rating: null as number | null,
    facebookUrl: '', instagramUrl: '',
    gbpPhotoCount: null as number | null, gbpPostsLast30Days: null as number | null,
  });

  const [objectionLoading, setObjectionLoading] = useState(false);
  const [objectionResults, setObjectionResults] = useState<ObjectionResult[]>([]);
  const [objectionError, setObjectionError] = useState<string | null>(null);
  const [selectedObjections, setSelectedObjections] = useState<string[]>([]);
  const [customObjection, setCustomObjection] = useState('');

  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<FollowUpResult | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpInputs, setFollowUpInputs] = useState({ business: '', industry: '', location: '', meetingNotes: '', servicesDiscussed: '', nextStep: '' });

  const [prospectLoading, setProspectLoading] = useState(false);
  const [prospectResults, setProspectResults] = useState<ProspectResult[]>([]);
  const [prospectError, setProspectError] = useState<string | null>(null);
  const [prospectInputs, setProspectInputs] = useState({ businessType: '', suburb: '', nearbySuburbs: '' });

  useEffect(() => {
    if (selectedLead) {
      setPreCallInputs({
        businessName: selectedLead.companyName || '',
        location: selectedLead.territory || selectedLead.areaName || '',
        website: selectedLead.website || '',
        industry: selectedLead.sourceData?.category || '',
        gbpLink: selectedLead.sourceData?.googleMapsUrl || '',
        reviewCount: selectedLead.sourceData?.googleReviewCount ?? null,
        rating: selectedLead.sourceData?.googleRating ?? null,
        facebookUrl: selectedLead.facebookUrl || '',
        instagramUrl: selectedLead.instagramUrl || '',
        gbpPhotoCount: null,
        gbpPostsLast30Days: null,
      });
      setFollowUpInputs(prev => ({
        ...prev,
        business: selectedLead.companyName || '',
        industry: selectedLead.sourceData?.category || '',
        location: selectedLead.territory || selectedLead.areaName || '',
        meetingNotes: selectedLead.notes || '',
      }));
      setProspectInputs(prev => ({
        ...prev,
        businessType: selectedLead.sourceData?.category || '',
        suburb: selectedLead.areaName || selectedLead.territory || '',
      }));
    }
  }, [selectedLead]);

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
        industry: preCallInputs.industry,
      };
      const res = await fetch('/api/ai/sales-engine/pre-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate call prep');
      const data = await res.json();
      setPreCallResult(data);
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
      setObjectionResults(data.responses || []);
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
      const res = await fetch('/api/ai/sales-engine/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpInputs),
      });
      if (!res.ok) throw new Error('Failed to generate follow-up');
      const data = await res.json();
      setFollowUpResult({
        email: data.email ? `Subject: ${data.email.subject}\n\n${data.email.body}` : 'Unable to generate email',
        sms: data.sms?.message || 'Unable to generate SMS',
        proposalIntro: data.proposalIntro?.opening || 'Unable to generate proposal intro',
      });
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
      setProspectResults(data.prospects || []);
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
    dispatch(updateLead({ ...selectedLead, notes: updatedNotes, updatedAt: new Date() }));
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
              onClick={() => setOpenSection(sectionKey)}
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
                    setInputs={setPreCallInputs}
                    loading={preCallLoading}
                    result={preCallResult}
                    error={preCallError}
                    onGenerate={handlePreCall}
                    onSaveToNotes={saveToNotes}
                    hasLead={!!selectedLead}
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
                  />
                )}
                {sectionKey === 'growth_plan' && (
                  <GrowthPlanSection
                    lead={selectedLead}
                    onSaveToNotes={saveToNotes}
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

function PreCallSection({ inputs, setInputs, loading, result, error, onGenerate, onSaveToNotes, hasLead }: {
  inputs: { businessName: string; location: string; website: string; industry: string; gbpLink: string };
  setInputs: (fn: (prev: any) => any) => void;
  loading: boolean;
  result: PreCallResult | null;
  error: string | null;
  onGenerate: () => void;
  onSaveToNotes: (text: string) => void;
  hasLead: boolean;
}) {
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
      <Button onClick={onGenerate} disabled={loading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-precall">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : 'Generate Call Prep'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {result && (
        <div className="space-y-3 pt-1">
          <FactsPanel facts={result.facts} />
          <ResultCard title="What they do and who they serve" content={result.whatTheyDo} onSave={hasLead ? onSaveToNotes : undefined} />
          <ResultCard title="3 strengths in their online presence" content={result.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')} onSave={hasLead ? onSaveToNotes : undefined} />
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">AI Insights — Gaps</p>
            {result.gaps.map((gap, i) => (
              <GapCard key={i} gap={gap} index={i} onSave={hasLead ? onSaveToNotes : undefined} />
            ))}
          </div>
          <ResultCard title="Sales Hook" content={result.salesHook} onSave={hasLead ? onSaveToNotes : undefined} highlight />
          <Button variant="outline" size="sm" onClick={onGenerate} className="w-full gap-1 text-xs" data-testid="button-regenerate-precall">
            <RotateCcw className="h-3 w-3" /> Regenerate
          </Button>
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
                  <p className="text-[11px] font-medium text-muted-foreground">Real Concern</p>
                  <p className="text-sm">{r.realConcern}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">What to Say</p>
                  <p className="text-sm">{r.response}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Regain Control</p>
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

function FollowUpSection({ inputs, setInputs, loading, result, error, onGenerate, onSaveToNotes, hasLead }: {
  inputs: { business: string; industry: string; location: string; meetingNotes: string; servicesDiscussed: string; nextStep: string };
  setInputs: (fn: (prev: typeof inputs) => typeof inputs) => void;
  loading: boolean;
  result: FollowUpResult | null;
  error: string | null;
  onGenerate: () => void;
  onSaveToNotes: (text: string) => void;
  hasLead: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Business *</Label>
            <Input value={inputs.business} onChange={e => setInputs(p => ({ ...p, business: e.target.value }))} placeholder="Business name" className="h-8 text-sm" data-testid="input-followup-business" />
          </div>
          <div>
            <Label className="text-xs">Industry</Label>
            <Input value={inputs.industry} onChange={e => setInputs(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Plumbing" className="h-8 text-sm" data-testid="input-followup-industry" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Location</Label>
          <Input value={inputs.location} onChange={e => setInputs(p => ({ ...p, location: e.target.value }))} placeholder="Suburb / area" className="h-8 text-sm" data-testid="input-followup-location" />
        </div>
        <div>
          <Label className="text-xs">Meeting Notes</Label>
          <Textarea value={inputs.meetingNotes} onChange={e => setInputs(p => ({ ...p, meetingNotes: e.target.value }))} placeholder="What was discussed on the call..." className="text-sm min-h-[60px]" data-testid="input-followup-notes" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Services Discussed</Label>
            <Input value={inputs.servicesDiscussed} onChange={e => setInputs(p => ({ ...p, servicesDiscussed: e.target.value }))} placeholder="SEO, Ads..." className="h-8 text-sm" data-testid="input-followup-services" />
          </div>
          <div>
            <Label className="text-xs">Next Step</Label>
            <Input value={inputs.nextStep} onChange={e => setInputs(p => ({ ...p, nextStep: e.target.value }))} placeholder="Send proposal..." className="h-8 text-sm" data-testid="input-followup-nextstep" />
          </div>
        </div>
      </div>
      <Button onClick={onGenerate} disabled={loading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-followup">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : 'Generate Follow-Up'}
      </Button>

      <InlineError error={error} onRetry={onGenerate} />

      {result && (
        <div className="space-y-2 pt-1">
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="email" className="text-xs flex-1" data-testid="tab-followup-email">Email</TabsTrigger>
              <TabsTrigger value="sms" className="text-xs flex-1" data-testid="tab-followup-sms">SMS</TabsTrigger>
              <TabsTrigger value="proposal" className="text-xs flex-1" data-testid="tab-followup-proposal">Proposal Intro</TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-sm whitespace-pre-wrap">{result.email}</p>
                <div className="flex gap-1 pt-2">
                  <CopyButton text={result.email} label="email" />
                  {hasLead && (
                    <Button variant="ghost" size="sm" onClick={() => onSaveToNotes(`Follow-up Email:\n${result.email}`)} className="h-7 text-xs gap-1" data-testid="button-save-email">
                      <Pin className="h-3 w-3" /> Save
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sms">
              <div className="border rounded-lg p-3 bg-muted/20">
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
          <Button variant="outline" size="sm" onClick={onGenerate} className="w-full gap-1 text-xs" data-testid="button-regenerate-followup">
            <RotateCcw className="h-3 w-3" /> Regenerate
          </Button>
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
