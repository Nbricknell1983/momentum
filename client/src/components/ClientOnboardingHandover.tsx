import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Client, ClientOnboarding } from '@/lib/types';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronDown, ChevronRight, Sparkles, Copy, Check, RefreshCw,
  Upload, FileText, Zap, Globe, Search, Target, Share2, BarChart2,
  MapPin, Loader2, ClipboardList, Mic, MicOff, Wand2
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: 'website', label: 'Website', icon: Globe },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'google_ads', label: 'Google Ads', icon: Target },
  { id: 'performance_boost', label: 'Perf. Boost', icon: Zap },
  { id: 'local_seo', label: 'Local SEO', icon: MapPin },
  { id: 'gbp', label: 'GBP Optimisation', icon: Share2 },
];

type TabId = 'context' | 'products' | 'seo' | 'outputs' | 'handover';

const TABS: { id: TabId; label: string }[] = [
  { id: 'context', label: '1. Business Context' },
  { id: 'products', label: '2. Products & Commercials' },
  { id: 'seo', label: '3. SEO Inputs' },
  { id: 'outputs', label: '4. AI Outputs' },
  { id: 'handover', label: '5. Final Handover' },
];

function SuggestButton({ fieldLabel, fieldHint, context, onSuggest }: {
  fieldLabel: string;
  fieldHint?: string;
  context: Record<string, string>;
  onSuggest: (s: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  if (!context.businessOverview?.trim()) return null;
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/clients/ai/suggest-field', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fieldLabel, fieldHint, context }),
          });
          const { suggestion } = await res.json();
          if (suggestion) onSuggest(suggestion);
        } catch {}
        setLoading(false);
      }}
      className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {loading ? 'Suggesting…' : 'AI suggest'}
    </button>
  );
}

function Field({ label, children, onSuggest, fieldHint, context }: {
  label: string;
  children: React.ReactNode;
  onSuggest?: (s: string) => void;
  fieldHint?: string;
  context?: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {onSuggest && context && (
          <SuggestButton fieldLabel={label} fieldHint={fieldHint} context={context} onSuggest={onSuggest} />
        )}
      </div>
      {children}
    </div>
  );
}

const SR_SUPPORTED = typeof window !== 'undefined' && !!(
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
);

function TA({ value, onChange, placeholder, rows = 3, testId, fieldLabel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  testId?: string;
  fieldLabel?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [tidying, setTidying] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startRecording = () => {
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;
    const rec = new SRClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-AU';

    let accumulated = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          accumulated += (accumulated ? ' ' : '') + t.trim();
        } else {
          interim += t;
        }
      }
      setFinalText(accumulated);
      setInterimText(interim);
    };
    rec.onend = () => { setRecording(false); setInterimText(''); };
    rec.onerror = () => { setRecording(false); setInterimText(''); };

    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
    setFinalText('');
    setInterimText('');
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
    setInterimText('');
  };

  const saveAndTidy = async () => {
    const raw = finalText.trim();
    if (!raw) { setFinalText(''); return; }
    stopRecording();
    setTidying(true);
    try {
      const combined = value ? `${value.trim()}\n\n${raw}` : raw;
      const res = await fetch('/api/clients/ai/tidy-dictation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combined, fieldLabel: fieldLabel || '' }),
      });
      const json = await res.json();
      onChange(json.tidied || combined);
    } catch {
      onChange(value ? `${value.trim()}\n\n${raw}` : raw);
    } finally {
      setTidying(false);
      setFinalText('');
    }
  };

  const discard = () => {
    stopRecording();
    setFinalText('');
    setInterimText('');
  };

  const hasTranscript = !!(finalText || interimText);

  return (
    <div className="space-y-1.5">
      <div className="relative group">
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={recording ? 'Listening…' : placeholder}
          rows={rows}
          className={`text-sm resize-none pr-9 transition-all ${recording ? 'ring-2 ring-red-400 border-red-300' : ''}`}
          data-testid={testId}
        />
        {SR_SUPPORTED && (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            title={recording ? 'Stop dictation' : 'Start dictation'}
            data-testid={testId ? `mic-${testId}` : undefined}
            className={`absolute top-2 right-2 p-1.5 rounded-md transition-all ${
              recording
                ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                : 'opacity-0 group-hover:opacity-100 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Live transcript preview */}
      {hasTranscript && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            {recording
              ? <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-red-600 uppercase tracking-wider"><Mic className="h-3 w-3 animate-pulse" /> Recording</span>
              : <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Transcript captured — ready to save</span>
            }
          </div>
          <p className="text-sm leading-relaxed">
            <span className="text-foreground">{finalText}</span>
            {interimText && <span className="text-muted-foreground italic"> {interimText}</span>}
          </p>
          {!recording && finalText && (
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={saveAndTidy}
                disabled={tidying}
                data-testid={testId ? `save-dictation-${testId}` : undefined}
              >
                {tidying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {tidying ? 'Tidying…' : 'Save & Tidy with AI'}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={discard}>
                Discard
              </Button>
            </div>
          )}
          {tidying && (
            <p className="text-[11px] text-muted-foreground">AI is cleaning up the transcript…</p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs gap-1.5"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function OutputBlock({ title, value, onChange }: {
  title: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!value) return null;
  return (
    <div className="space-y-2 rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        <CopyButton text={value} />
      </div>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={Math.max(6, value.split('\n').length + 1)}
        className="text-xs font-mono resize-none bg-muted/30 border-0 focus-visible:ring-0"
      />
    </div>
  );
}

// ─── Keyword file parser (simplified from DealIntelligencePanel) ──────────────

async function parseKeywordFile(file: File): Promise<string> {
  const xlsx = await import('xlsx');
  const xlsxRead = xlsx.read ?? (xlsx as any).default?.read;
  const xlsxUtils = xlsx.utils ?? (xlsx as any).default?.utils;
  if (!xlsxRead || !xlsxUtils) throw new Error('Spreadsheet library unavailable');

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  let wb: any;
  if (isCSV) {
    let text: string;
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      text = new TextDecoder('UTF-16LE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      text = new TextDecoder('UTF-16BE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      text = new TextDecoder('UTF-8').decode(buffer.slice(3));
    } else {
      text = new TextDecoder('UTF-8').decode(buffer);
    }
    text = text.replace(/^\uFEFF/, '');
    wb = xlsxRead(text, { type: 'string' });
  } else {
    wb = xlsxRead(bytes, { type: 'array' });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = xlsxUtils.sheet_to_json(ws, { defval: null });
  if (!rows.length) throw new Error('No data found');

  const norm = (s: string) => String(s ?? '').toLowerCase().trim();
  const firstRow = rows[0];
  const headers = Object.keys(firstRow).map(norm);
  const hasKeyword = headers.some(h => h.includes('keyword') && !h.includes('parent'));
  if (!hasKeyword) throw new Error('No keyword column found');

  const pick = (row: Record<string, any>, ...terms: string[]): any => {
    for (const key of Object.keys(row)) {
      const k = norm(key);
      if (terms.some(t => k.includes(t))) return row[key];
    }
    return null;
  };
  const num = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };

  const keywords = rows.map(row => ({
    keyword: String(pick(row, 'keyword') ?? '').trim(),
    volume: num(pick(row, 'volume', 'search volume', 'avg. monthly searches', 'monthly searches')),
    difficulty: num(pick(row, 'kd', 'keyword difficulty', 'difficulty')),
    cpc: num(pick(row, 'cpc')),
    position: num(pick(row, 'position', 'current position', 'rank')),
    traffic: num(pick(row, 'traffic potential', 'tp', 'traffic')),
  })).filter(k => k.keyword);

  keywords.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const top = keywords.slice(0, 50);

  const lines = [`Keywords extracted from ${file.name} (${keywords.length} total):\n`];
  lines.push('Keyword | Volume | KD | Position | CPC');
  lines.push('--------|---------|----|----------|----');
  top.forEach(k => {
    lines.push(`${k.keyword} | ${k.volume ?? '—'} | ${k.difficulty ?? '—'} | ${k.position ?? '—'} | ${k.cpc != null ? '$' + k.cpc.toFixed(2) : '—'}`);
  });
  return lines.join('\n');
}

// ─── Main Component ───────────────────────────────────────────────────────────

const EMPTY_DATA: ClientOnboarding = {
  businessOverview: '',
  targetCustomers: '',
  keyServices: '',
  businessGoals: '',
  locations: '',
  competitorNotes: '',
  keyDifferentiators: '',
  brandDirection: '',
  operationalNotes: '',
  selectedProducts: [],
  websitePageCount: undefined,
  websiteObjective: '',
  bookingCtaPreference: '',
  seoServices: '',
  seoLocations: '',
  adsServices: '',
  monthlyBudget: '',
  fastestWinService: '',
  retargetingGoal: '',
  pricingNotes: '',
  capacityNotes: '',
  revenueNotes: '',
  seoObjective: '',
  manualKeywordNotes: '',
  competitorKeywordNotes: '',
  currentWebsiteUrl: '',
  currentSitemapUrl: '',
  keywordSummary: '',
  aiStrategyOutput: '',
  aiSitemapOutput: '',
  aiMarketingOutput: '',
  aiHandoverOutput: '',
  finalHandoverNotes: '',
  lastGeneratedAt: undefined,
};

export default function ClientOnboardingHandover({ client }: { client: Client }) {
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [tab, setTab] = useState<TabId>('context');
  const [data, setData] = useState<ClientOnboarding>(() => ({ ...EMPTY_DATA, ...client.clientOnboarding }));
  const [generating, setGenerating] = useState(false);
  const [uploadingKeywords, setUploadingKeywords] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave
  const scheduleAutosave = useCallback((newData: ClientOnboarding) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!orgId || !authReady) return;
      try {
        await updateClientInFirestore(orgId, client.id, { clientOnboarding: newData } as any, authReady);
      } catch (_) {}
    }, 1500);
  }, [orgId, authReady, client.id]);

  const update = useCallback(<K extends keyof ClientOnboarding>(key: K, value: ClientOnboarding[K]) => {
    setData(prev => {
      const next = { ...prev, [key]: value };
      scheduleAutosave(next);
      return next;
    });
  }, [scheduleAutosave]);

  const toggleProduct = useCallback((id: string) => {
    setData(prev => {
      const selected = prev.selectedProducts ?? [];
      const next = { ...prev, selectedProducts: selected.includes(id) ? selected.filter(p => p !== id) : [...selected, id] };
      scheduleAutosave(next);
      return next;
    });
  }, [scheduleAutosave]);

  const hasProd = (id: string) => (data.selectedProducts ?? []).includes(id);

  // Keyword file upload
  const handleKeywordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKeywords(true);
    try {
      const summary = await parseKeywordFile(file);
      update('keywordSummary', summary);
      toast({ title: 'Keywords imported', description: `${file.name}` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingKeywords(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // AI Generation
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/clients/ai/onboarding-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.businessName,
          location: client.address || client.regionName || '',
          data,
        }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const result = await res.json();
      const now = new Date().toISOString();
      const handoverText = result.handover || '';
      setData(prev => {
        const next = {
          ...prev,
          aiStrategyOutput: result.strategy || '',
          aiSitemapOutput: result.sitemap || '',
          aiMarketingOutput: result.marketing || '',
          aiHandoverOutput: handoverText,
          finalHandoverNotes: handoverText,
          lastGeneratedAt: now,
        };
        scheduleAutosave(next);
        return next;
      });
      setTab('outputs');
      toast({ title: 'AI outputs generated', description: 'Review and edit below.' });
    } catch (err) {
      toast({ title: 'Generation failed', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAll = () => {
    const text = [
      data.aiStrategyOutput,
      data.aiSitemapOutput,
      data.aiMarketingOutput,
      data.aiHandoverOutput,
    ].filter(Boolean).join('\n\n---\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: 'Full handover copied' });
  };

  const isComplete = !!(data.businessOverview || data.keyServices || data.businessGoals);

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(v => !v)}
        data-testid="button-toggle-onboarding"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <ClipboardList className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Onboarding & Team Handover</p>
            <p className="text-xs text-muted-foreground">
              {data.lastGeneratedAt
                ? `Last generated ${format(new Date(data.lastGeneratedAt), 'dd/MM/yyyy HH:mm')}`
                : isComplete ? 'Context entered — ready to generate' : 'Enter client context and generate handover notes'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isComplete && !data.lastGeneratedAt && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Ready</span>
          )}
          {data.lastGeneratedAt && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Generated</span>
          )}
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b bg-muted/20 px-1 pt-1 gap-0.5 scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`tab-onboarding-${t.id}`}
                className={`shrink-0 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">

            {/* ── TAB 1: BUSINESS CONTEXT ── */}
            {tab === 'context' && (() => {
              const ctx: Record<string, string> = {
                businessOverview: data.businessOverview ?? '',
                targetCustomers: data.targetCustomers ?? '',
                keyServices: data.keyServices ?? '',
                businessGoals: data.businessGoals ?? '',
                locations: data.locations ?? '',
                competitorNotes: data.competitorNotes ?? '',
                pricingNotes: data.pricingNotes ?? '',
                capacityNotes: data.capacityNotes ?? '',
              };
              return (
                <div className="space-y-4">
                  {data.businessOverview && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30">
                      <Sparkles className="h-3 w-3 text-violet-500 shrink-0" />
                      <p className="text-[11px] text-violet-700 dark:text-violet-400">Business Overview filled — click <strong>AI suggest</strong> next to any field to auto-fill from context.</p>
                    </div>
                  )}
                  {!data.businessOverview && (
                    <p className="text-xs text-muted-foreground">Start with Business Overview — once filled, AI can suggest the remaining fields.</p>
                  )}
                  <Field label="Business Overview">
                    <TA value={data.businessOverview ?? ''} onChange={v => update('businessOverview', v)} placeholder="What the business does, who they are, how long trading..." testId="ta-business-overview" fieldLabel="Business Overview" />
                  </Field>
                  <Field label="Target Customers"
                    onSuggest={v => update('targetCustomers', v)}
                    fieldHint="Who they want to attract — demographics, location, intent to buy"
                    context={ctx}>
                    <TA value={data.targetCustomers ?? ''} onChange={v => update('targetCustomers', v)} placeholder="Who they want to attract — demographics, location, intent..." testId="ta-target-customers" fieldLabel="Target Customers" />
                  </Field>
                  <Field label="Key Services"
                    onSuggest={v => update('keyServices', v)}
                    fieldHint="Their main services and which to prioritise for marketing"
                    context={ctx}>
                    <TA value={data.keyServices ?? ''} onChange={v => update('keyServices', v)} placeholder="List their main services, and which ones to prioritise..." testId="ta-key-services" fieldLabel="Key Services" />
                  </Field>
                  <Field label="Business Goals"
                    onSuggest={v => update('businessGoals', v)}
                    fieldHint="Specific, measurable goals — appointment volume, revenue, ranking, capacity"
                    context={ctx}>
                    <TA value={data.businessGoals ?? ''} onChange={v => update('businessGoals', v)} placeholder="e.g. Increase appointments from 5/day to 15/day. Rank locally for chiro. Fill morning slots." testId="ta-business-goals" fieldLabel="Business Goals" />
                  </Field>
                  <Field label="Locations / Service Areas"
                    onSuggest={v => update('locations', v)}
                    fieldHint="Specific suburbs, cities, or regions they serve or want to target"
                    context={ctx}>
                    <TA value={data.locations ?? ''} onChange={v => update('locations', v)} placeholder="Suburbs, cities, regions they target..." rows={2} testId="ta-locations" fieldLabel="Locations and Service Areas" />
                  </Field>
                  <Field label="Competitor Notes"
                    onSuggest={v => update('competitorNotes', v)}
                    fieldHint="Known competitors, how competitive the market is, their position"
                    context={ctx}>
                    <TA value={data.competitorNotes ?? ''} onChange={v => update('competitorNotes', v)} placeholder="Known competitors, competitive level, market position..." rows={2} testId="ta-competitor-notes" fieldLabel="Competitor Notes" />
                  </Field>
                  <Field label="Key Differentiators"
                    onSuggest={v => update('keyDifferentiators', v)}
                    fieldHint="Why customers choose them over competitors — unique strengths"
                    context={ctx}>
                    <TA value={data.keyDifferentiators ?? ''} onChange={v => update('keyDifferentiators', v)} placeholder="Why customers choose them over others..." rows={2} testId="ta-differentiators" fieldLabel="Key Differentiators" />
                  </Field>
                  <Field label="Brand / Theme Direction"
                    onSuggest={v => update('brandDirection', v)}
                    fieldHint="Visual style, tone, feel — colours, mood, professional vs approachable"
                    context={ctx}>
                    <TA value={data.brandDirection ?? ''} onChange={v => update('brandDirection', v)} placeholder="e.g. Clean, clinical, modern. Premium but approachable. Navy and white." rows={2} testId="ta-brand-direction" fieldLabel="Brand and Theme Direction" />
                  </Field>
                  <Field label="Operational Notes"
                    onSuggest={v => update('operationalNotes', v)}
                    fieldHint="Anything the delivery team needs to know — constraints, integrations, owner preferences"
                    context={ctx}>
                    <TA value={data.operationalNotes ?? ''} onChange={v => update('operationalNotes', v)} placeholder="Anything useful for the delivery team to know..." rows={2} testId="ta-operational-notes" fieldLabel="Operational Notes" />
                  </Field>
                  <div className="flex justify-end pt-2">
                    <Button size="sm" onClick={() => setTab('products')} className="gap-1.5 text-xs">
                      Next: Products & Commercials <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── TAB 2: PRODUCTS & COMMERCIALS ── */}
            {tab === 'products' && (() => {
              const ctx: Record<string, string> = {
                businessOverview: data.businessOverview ?? '',
                targetCustomers: data.targetCustomers ?? '',
                keyServices: data.keyServices ?? '',
                businessGoals: data.businessGoals ?? '',
                locations: data.locations ?? '',
                competitorNotes: data.competitorNotes ?? '',
                keyDifferentiators: data.keyDifferentiators ?? '',
                pricingNotes: data.pricingNotes ?? '',
                capacityNotes: data.capacityNotes ?? '',
                websiteObjective: data.websiteObjective ?? '',
                seoServices: data.seoServices ?? '',
                adsServices: data.adsServices ?? '',
              };
              return (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5">Products Sold</p>
                    <div className="flex flex-wrap gap-2">
                      {PRODUCTS.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => toggleProduct(id)}
                          data-testid={`toggle-product-${id}`}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                            hasProd(id)
                              ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-400'
                              : 'bg-background border-border text-muted-foreground hover:bg-muted/30'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product-specific fields */}
                  {hasProd('website') && (
                    <div className="space-y-3 rounded-lg border border-violet-100 dark:border-violet-900/30 p-3 bg-violet-50/30 dark:bg-violet-900/10">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Website Details</p>
                      <Field label="Page Count">
                        <Input
                          type="number"
                          value={data.websitePageCount ?? ''}
                          onChange={e => update('websitePageCount', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="e.g. 15"
                          className="h-8 text-sm"
                          data-testid="input-website-pages"
                        />
                      </Field>
                      <Field label="Website Objective"
                        onSuggest={v => update('websiteObjective', v)}
                        fieldHint="What the website needs to achieve — conversions, bookings, credibility, local presence"
                        context={ctx}>
                        <TA value={data.websiteObjective ?? ''} onChange={v => update('websiteObjective', v)} placeholder="What the website needs to achieve..." rows={2} testId="ta-website-objective" fieldLabel="Website Objective" />
                      </Field>
                      <Field label="Booking / Lead CTA Preference"
                        onSuggest={v => update('bookingCtaPreference', v)}
                        fieldHint="Best booking or contact mechanism given how this business operates"
                        context={ctx}>
                        <TA value={data.bookingCtaPreference ?? ''} onChange={v => update('bookingCtaPreference', v)} placeholder="e.g. Book online (Cliniko), call button, contact form..." rows={2} testId="ta-cta-preference" fieldLabel="Booking and CTA Preference" />
                      </Field>
                    </div>
                  )}

                  {hasProd('seo') && (
                    <div className="space-y-3 rounded-lg border border-violet-100 dark:border-violet-900/30 p-3 bg-violet-50/30 dark:bg-violet-900/10">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">SEO Details</p>
                      <Field label="Priority Services for SEO"
                        onSuggest={v => update('seoServices', v)}
                        fieldHint="Which services to rank for first — highest revenue, clearest intent, best conversion"
                        context={ctx}>
                        <TA value={data.seoServices ?? ''} onChange={v => update('seoServices', v)} placeholder="Which services to rank for first..." rows={2} testId="ta-seo-services" fieldLabel="Priority Services for SEO" />
                      </Field>
                      <Field label="Priority Locations for SEO"
                        onSuggest={v => update('seoLocations', v)}
                        fieldHint="Which suburbs or regions to target first based on their service area and goals"
                        context={ctx}>
                        <TA value={data.seoLocations ?? ''} onChange={v => update('seoLocations', v)} placeholder="Which suburbs / regions to target first..." rows={2} testId="ta-seo-locations" fieldLabel="Priority Locations for SEO" />
                      </Field>
                    </div>
                  )}

                  {hasProd('google_ads') && (
                    <div className="space-y-3 rounded-lg border border-violet-100 dark:border-violet-900/30 p-3 bg-violet-50/30 dark:bg-violet-900/10">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Google Ads Details</p>
                      <Field label="Ads Focus Services"
                        onSuggest={v => update('adsServices', v)}
                        fieldHint="Which services to run ads for — high margin, fast conversion, underserved demand"
                        context={ctx}>
                        <TA value={data.adsServices ?? ''} onChange={v => update('adsServices', v)} placeholder="Which services to run ads for..." rows={2} testId="ta-ads-services" fieldLabel="Google Ads Focus Services" />
                      </Field>
                      <Field label="Monthly Budget">
                        <Input
                          value={data.monthlyBudget ?? ''}
                          onChange={e => update('monthlyBudget', e.target.value)}
                          placeholder="e.g. $2,500/mo"
                          className="h-8 text-sm"
                          data-testid="input-monthly-budget"
                        />
                      </Field>
                      <Field label="Fastest Win Service"
                        onSuggest={v => update('fastestWinService', v)}
                        fieldHint="Which service will convert quickest from paid ads given their pricing and customer intent"
                        context={ctx}>
                        <TA value={data.fastestWinService ?? ''} onChange={v => update('fastestWinService', v)} placeholder="Which service will convert quickest from ads..." rows={2} testId="ta-fastest-win" fieldLabel="Fastest Win Service for Ads" />
                      </Field>
                    </div>
                  )}

                  {hasProd('performance_boost') && (
                    <div className="space-y-3 rounded-lg border border-violet-100 dark:border-violet-900/30 p-3 bg-violet-50/30 dark:bg-violet-900/10">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Performance Boost Details</p>
                      <Field label="Retargeting Goal"
                        onSuggest={v => update('retargetingGoal', v)}
                        fieldHint="Retargeting strategy — who to retarget and what action to drive based on the customer journey"
                        context={ctx}>
                        <TA value={data.retargetingGoal ?? ''} onChange={v => update('retargetingGoal', v)} placeholder="e.g. Retarget website visitors who didn't book..." rows={2} testId="ta-retargeting-goal" fieldLabel="Retargeting Goal" />
                      </Field>
                    </div>
                  )}

                  {/* Commercial fields — always visible */}
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground">Commercial Details</p>
                    <Field label="Pricing Notes"
                      onSuggest={v => update('pricingNotes', v)}
                      fieldHint="Service pricing, session rates, average job value — anything that affects margin or conversion"
                      context={ctx}>
                      <TA value={data.pricingNotes ?? ''} onChange={v => update('pricingNotes', v)} placeholder="Service pricing, average job value, session price, margins..." rows={3} testId="ta-pricing-notes" fieldLabel="Pricing and Job Value Notes" />
                    </Field>
                    <Field label="Capacity Notes"
                      onSuggest={v => update('capacityNotes', v)}
                      fieldHint="Current capacity vs target — appointments/day, staff, bottlenecks"
                      context={ctx}>
                      <TA value={data.capacityNotes ?? ''} onChange={v => update('capacityNotes', v)} placeholder="e.g. Currently 3–5 appointments/day, target 15–20/day..." rows={2} testId="ta-capacity-notes" fieldLabel="Capacity Notes" />
                    </Field>
                    <Field label="Revenue Opportunity Notes"
                      onSuggest={v => update('revenueNotes', v)}
                      fieldHint="Revenue upside if goals are hit — useful commercial context for the delivery team"
                      context={ctx}>
                      <TA value={data.revenueNotes ?? ''} onChange={v => update('revenueNotes', v)} placeholder="Internal commercial context useful for the team..." rows={2} testId="ta-revenue-notes" fieldLabel="Revenue Opportunity Notes" />
                    </Field>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button size="sm" variant="outline" onClick={() => setTab('context')} className="text-xs">Back</Button>
                    <Button size="sm" onClick={() => setTab('seo')} className="gap-1.5 text-xs">
                      Next: SEO Inputs <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── TAB 3: SEO INPUTS ── */}
            {tab === 'seo' && (() => {
              const ctx: Record<string, string> = {
                businessOverview: data.businessOverview ?? '',
                targetCustomers: data.targetCustomers ?? '',
                keyServices: data.keyServices ?? '',
                businessGoals: data.businessGoals ?? '',
                locations: data.locations ?? '',
                competitorNotes: data.competitorNotes ?? '',
                seoServices: data.seoServices ?? '',
                seoLocations: data.seoLocations ?? '',
                keyDifferentiators: data.keyDifferentiators ?? '',
                keywordSummary: data.keywordSummary ?? '',
              };
              return (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Upload keyword data or enter manually. AI will use this to recommend page structure and strategy.
                </p>

                {/* Keyword upload */}
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Keyword Data Upload</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Ahrefs CSV/Excel, Google Keyword Planner, or any keyword export</p>
                    </div>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      ref={fileInputRef}
                      onChange={handleKeywordFile}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingKeywords}
                      data-testid="button-upload-keywords"
                    >
                      {uploadingKeywords
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Upload className="h-3.5 w-3.5" />}
                      {uploadingKeywords ? 'Importing…' : 'Upload File'}
                    </Button>
                  </div>
                  {data.keywordSummary ? (
                    <div className="rounded bg-muted/40 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Keyword Data Loaded</p>
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => update('keywordSummary', '')}
                        >Clear</button>
                      </div>
                      <pre className="text-[10px] text-muted-foreground leading-relaxed overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {data.keywordSummary.slice(0, 600)}{data.keywordSummary.length > 600 ? '…' : ''}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 text-center">No file uploaded yet</p>
                  )}
                </div>

                <Field label="SEO Objective"
                  onSuggest={v => update('seoObjective', v)}
                  fieldHint="The main SEO goal — what rankings and pages will drive the most business impact for this client"
                  context={ctx}>
                  <TA
                    value={data.seoObjective ?? ''}
                    onChange={v => update('seoObjective', v)}
                    placeholder="e.g. Build the sitemap and page strategy that gives us the best chance of ranking locally for chiropractic and psychology services in Moreton Bay."
                    rows={3}
                    testId="ta-seo-objective" fieldLabel="SEO Objective"
                  />
                </Field>
                <Field label="Manual Keyword Notes"
                  onSuggest={v => update('manualKeywordNotes', v)}
                  fieldHint="Key keyword themes, search terms, and intent signals based on their services and location"
                  context={ctx}>
                  <TA value={data.manualKeywordNotes ?? ''} onChange={v => update('manualKeywordNotes', v)} placeholder="Key keyword themes, terms they need to rank for, search intent..." rows={3} testId="ta-manual-keywords" fieldLabel="Manual Keyword Notes" />
                </Field>
                <Field label="Competitor Keyword Notes"
                  onSuggest={v => update('competitorKeywordNotes', v)}
                  fieldHint="What competitors likely rank for, keyword gaps they can exploit, content opportunities"
                  context={ctx}>
                  <TA value={data.competitorKeywordNotes ?? ''} onChange={v => update('competitorKeywordNotes', v)} placeholder="What competitors rank for, keyword gaps, content opportunities..." rows={2} testId="ta-competitor-keywords" fieldLabel="Competitor Keyword Notes" />
                </Field>
                <Field label="Current Website URL">
                  <Input
                    value={data.currentWebsiteUrl ?? ''}
                    onChange={e => update('currentWebsiteUrl', e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-sm"
                    data-testid="input-website-url"
                  />
                </Field>
                <Field label="Current Sitemap URL (optional)">
                  <Input
                    value={data.currentSitemapUrl ?? ''}
                    onChange={e => update('currentSitemapUrl', e.target.value)}
                    placeholder="https://.../sitemap.xml"
                    className="h-8 text-sm"
                    data-testid="input-sitemap-url"
                  />
                </Field>

                <div className="flex justify-between pt-2">
                  <Button size="sm" variant="outline" onClick={() => setTab('products')} className="text-xs">Back</Button>
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={generating || !isComplete}
                    className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    data-testid="button-generate-outputs"
                  >
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generating ? 'Generating…' : 'Generate AI Outputs'}
                  </Button>
                </div>
              </div>
              );
            })()}

            {/* ── TAB 4: AI OUTPUTS ── */}
            {tab === 'outputs' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Review and edit outputs before sending to the team.</p>
                  <div className="flex items-center gap-2">
                    {data.lastGeneratedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        Generated {format(new Date(data.lastGeneratedAt), 'dd/MM HH:mm')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7"
                      onClick={handleGenerate}
                      disabled={generating || !isComplete}
                      data-testid="button-regenerate-outputs"
                    >
                      {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {generating ? 'Generating…' : 'Regenerate'}
                    </Button>
                    {(data.aiStrategyOutput || data.aiHandoverOutput) && (
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white"
                        onClick={handleCopyAll}
                        data-testid="button-copy-all-outputs"
                      >
                        <Copy className="h-3 w-3" /> Copy All
                      </Button>
                    )}
                  </div>
                </div>

                {!data.aiStrategyOutput && !data.aiHandoverOutput ? (
                  <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
                    <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">No outputs yet</p>
                    <p className="text-xs text-muted-foreground/70">Fill in Business Context then click Generate AI Outputs</p>
                    <Button
                      size="sm"
                      onClick={() => !isComplete ? setTab('context') : handleGenerate()}
                      disabled={generating}
                      className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {!isComplete ? 'Add context first' : generating ? 'Generating…' : 'Generate Now'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <OutputBlock
                      title="AI Strategy Summary"
                      value={data.aiStrategyOutput ?? ''}
                      onChange={v => update('aiStrategyOutput', v)}
                    />
                    <OutputBlock
                      title="SEO Sitemap Recommendation"
                      value={data.aiSitemapOutput ?? ''}
                      onChange={v => update('aiSitemapOutput', v)}
                    />
                    <OutputBlock
                      title="Marketing Strategy"
                      value={data.aiMarketingOutput ?? ''}
                      onChange={v => update('aiMarketingOutput', v)}
                    />
                    <OutputBlock
                      title="Team Handover Draft"
                      value={data.aiHandoverOutput ?? ''}
                      onChange={v => update('aiHandoverOutput', v)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: FINAL HANDOVER ── */}
            {tab === 'handover' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">CLIENT HANDOVER NOTES</p>
                    <p className="text-xs text-muted-foreground">{client.businessName} · {client.address || client.regionName || 'Location TBC'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CopyButton text={data.finalHandoverNotes || buildFinalHandover(client, data)} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7"
                      onClick={handleGenerate}
                      disabled={generating || !isComplete}
                    >
                      {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Regenerate
                    </Button>
                  </div>
                </div>

                {!data.finalHandoverNotes && !data.aiHandoverOutput ? (
                  <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">No handover generated yet</p>
                    <Button
                      size="sm"
                      onClick={() => !isComplete ? setTab('context') : handleGenerate()}
                      disabled={generating}
                      className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {!isComplete ? 'Add context first' : generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Sparkles className="h-3.5 w-3.5" /> Generate Handover</>}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field label="Edit Before Copying">
                      <Textarea
                        value={data.finalHandoverNotes || data.aiHandoverOutput || ''}
                        onChange={e => {
                          const v = e.target.value;
                          setData(prev => {
                            const next = { ...prev, finalHandoverNotes: v, lastEditedAt: new Date().toISOString() };
                            scheduleAutosave(next);
                            return next;
                          });
                        }}
                        rows={20}
                        className="text-xs font-mono resize-none"
                        data-testid="ta-final-handover"
                      />
                    </Field>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-muted-foreground/60">
                        {data.lastEditedAt ? `Edited ${format(new Date(data.lastEditedAt), 'dd/MM HH:mm')}` : 'Autosaved'}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <CopyButton text={data.finalHandoverNotes || data.aiHandoverOutput || ''} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7"
                          onClick={() => {
                            const combined = buildFinalHandover(client, data);
                            setData(prev => {
                              const next = { ...prev, finalHandoverNotes: combined };
                              scheduleAutosave(next);
                              return next;
                            });
                          }}
                        >
                          <BarChart2 className="h-3 w-3" />
                          Rebuild from AI
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer: quick generate CTA */}
          {tab !== 'outputs' && tab !== 'handover' && isComplete && (
            <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20">
              <p className="text-xs text-muted-foreground">Context ready — generate AI outputs when you're done.</p>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5 text-xs h-7 bg-violet-600 hover:bg-violet-700 text-white"
                data-testid="button-generate-footer"
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {generating ? 'Generating…' : 'Generate All'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fallback builder for Final Handover if AI outputs were edited separately ──

function buildFinalHandover(client: Client, data: ClientOnboarding): string {
  const parts: string[] = [];
  parts.push(`CLIENT HANDOVER NOTES\n${'='.repeat(40)}`);
  parts.push(`Client: ${client.businessName}`);
  parts.push(`Location: ${client.address || client.regionName || 'TBC'}`);
  parts.push(`Primary Contact: ${client.primaryContactName || 'TBC'}`);
  parts.push(`Products Sold: ${(data.selectedProducts || []).join(', ') || 'TBC'}`);
  if (data.businessOverview) parts.push(`\nBusiness Overview:\n${data.businessOverview}`);
  if (data.targetCustomers) parts.push(`\nTarget Customers:\n${data.targetCustomers}`);
  if (data.businessGoals) parts.push(`\nBusiness Goals:\n${data.businessGoals}`);
  if (data.keyServices) parts.push(`\nKey Services:\n${data.keyServices}`);
  if (data.pricingNotes) parts.push(`\nCommercial / Pricing Notes:\n${data.pricingNotes}`);
  if (data.capacityNotes) parts.push(`\nCapacity Notes:\n${data.capacityNotes}`);
  if (data.competitorNotes) parts.push(`\nCompetitor Landscape:\n${data.competitorNotes}`);
  if (data.keyDifferentiators) parts.push(`\nKey Differentiators:\n${data.keyDifferentiators}`);
  if (data.brandDirection) parts.push(`\nBrand / Theme Direction:\n${data.brandDirection}`);
  if (data.operationalNotes) parts.push(`\nOperational Notes:\n${data.operationalNotes}`);
  if (data.aiStrategyOutput) parts.push(`\n${'-'.repeat(40)}\n${data.aiStrategyOutput}`);
  if (data.aiSitemapOutput) parts.push(`\n${'-'.repeat(40)}\n${data.aiSitemapOutput}`);
  if (data.aiMarketingOutput) parts.push(`\n${'-'.repeat(40)}\n${data.aiMarketingOutput}`);
  return parts.join('\n');
}
