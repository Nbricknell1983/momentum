import { useState, useRef } from 'react';
import {
  Search, Upload, X, Cpu, ChevronDown, ChevronRight, TrendingUp,
  MapPin, Zap, Target, Calendar, CheckCircle, ArrowRight, Globe, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

interface Keyword {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  parentKeyword: string | null;
}

interface Props {
  client: any;
}

const PRIORITY_CLS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  LOW: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const WEEK_CLS: Record<string, string> = {
  week1: 'bg-red-100 text-red-700',
  week2: 'bg-orange-100 text-orange-700',
  month1: 'bg-amber-100 text-amber-700',
  month2: 'bg-blue-100 text-blue-700',
  month3: 'bg-gray-100 text-gray-600',
};

function diffBadge(diff: number | null) {
  if (diff === null || diff === undefined) return <span className="text-[10px] text-gray-400">–</span>;
  const cls = diff === 0 ? 'bg-emerald-100 text-emerald-700' : diff <= 10 ? 'bg-green-100 text-green-700' : diff <= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{diff}</span>;
}

export function KeywordStrategyPanel({ client }: Props) {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rawCsv, setRawCsv] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<'seo' | 'gbp' | 'plan'>('seo');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getToken = async () => auth.currentUser?.getIdToken() ?? null;

  const storedKeywords: Keyword[] = client.keywords || [];
  const strategy = client.keywordStrategy;
  const hasKeywords = storedKeywords.length > 0;
  const hasStrategy = !!strategy;

  // Parse UTF-16 LE CSV (Ahrefs export format)
  const parseAhrefsCsv = (raw: ArrayBuffer | string): Keyword[] => {
    let text = '';
    if (typeof raw === 'string') {
      text = raw;
    } else {
      const buf = new Uint8Array(raw);
      // Check for UTF-16 LE BOM (FF FE)
      if (buf[0] === 0xFF && buf[1] === 0xFE) {
        const u16 = new Uint16Array(raw.slice(2));
        text = String.fromCharCode(...Array.from(u16));
      } else {
        text = new TextDecoder('utf-8').decode(raw);
      }
    }

    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split('\t').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const kwIdx = header.findIndex(h => h === 'keyword');
    const volIdx = header.findIndex(h => h === 'volume');
    const diffIdx = header.findIndex(h => h === 'difficulty');
    const cpcIdx = header.findIndex(h => h === 'cpc');
    const parentIdx = header.findIndex(h => h === 'parent keyword');
    const countryIdx = header.findIndex(h => h === 'country');

    if (kwIdx === -1) return [];

    return lines.slice(1).map(line => {
      const cols = line.split('\t').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      const kw = cols[kwIdx]?.toLowerCase().trim() || '';
      if (!kw) return null;
      const vol = parseInt(cols[volIdx] || '0', 10) || 0;
      const diffStr = cols[diffIdx]?.trim();
      const diff = diffStr && diffStr !== '' ? parseInt(diffStr, 10) : null;
      const cpcStr = cols[cpcIdx]?.trim();
      const cpc = cpcStr && cpcStr !== '' ? parseFloat(cpcStr) : null;
      const parent = cols[parentIdx]?.toLowerCase().trim() || null;
      return { keyword: kw, volume: vol, difficulty: isNaN(diff!) ? null : diff, cpc: isNaN(cpc!) ? null : cpc, parentKeyword: parent, country: cols[countryIdx] || 'au' };
    }).filter(Boolean) as Keyword[];
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result;
      if (!result) return;
      const keywords = parseAhrefsCsv(result as ArrayBuffer);
      if (keywords.length === 0) {
        toast({ title: 'No keywords found', description: 'Check the CSV format — expected Ahrefs export with Keyword and Volume columns.', variant: 'destructive' });
        return;
      }
      await doImport(keywords);
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePasteParse = () => {
    if (!rawCsv.trim()) return;
    const keywords = parseAhrefsCsv(rawCsv);
    if (keywords.length === 0) {
      toast({ title: 'Could not parse keywords', description: 'Expected format: Keyword\tVolume\tDifficulty (tab-separated)', variant: 'destructive' });
      return;
    }
    doImport(keywords);
  };

  const doImport = async (keywords: Keyword[]) => {
    if (!orgId) return;
    setImporting(true);
    const token = await getToken();
    try {
      const res = await fetch(`/api/clients/${client.id}/import-keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orgId, keywords }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Import failed'); }
      const data = await res.json();
      toast({ title: `${data.count} keywords imported`, description: 'Now generate the strategy to turn these into a ranking plan.' });
      setShowImport(false);
      setRawCsv('');
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateStrategy = async () => {
    if (!orgId) return;
    setGenerating(true);
    const token = await getToken();
    try {
      const res = await fetch(`/api/clients/${client.id}/keyword-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Generation failed'); }
      const data = await res.json();
      toast({ title: 'Strategy generated', description: `${data.clusters?.length || 0} keyword clusters · ${data.seoStrategy?.priorityPages?.length || 0} target pages` });
    } catch (e: any) {
      toast({ title: 'Strategy failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const totalVolume = storedKeywords.reduce((sum, k) => sum + (k.volume || 0), 0);
  const quickWinKws = storedKeywords.filter(k => k.difficulty !== null && k.difficulty <= 5 && k.volume >= 50);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Search className="h-4 w-4 text-violet-500" />
            Keyword Strategy Engine
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Import keywords, build clusters, generate SEO + GBP ranking strategy, and execute.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasKeywords && (
            <Badge className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              {storedKeywords.length} kws
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setShowImport(p => !p)}
            data-testid="btn-toggle-import"
          >
            <Upload className="h-3 w-3" />
            {hasKeywords ? 'Re-import' : 'Import Keywords'}
          </Button>
        </div>
      </div>

      {/* Import Section */}
      {showImport && (
        <div className="border border-violet-200 dark:border-violet-800 rounded-xl p-4 bg-violet-50 dark:bg-violet-950/10 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">Import from Ahrefs CSV</p>
            <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* File upload */}
          <div
            className="border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-lg p-5 text-center cursor-pointer hover:border-violet-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
            data-testid="drop-keyword-csv"
          >
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
            <Upload className="h-7 w-7 text-violet-400 mx-auto mb-2" />
            <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">Drop Ahrefs CSV here or click to browse</p>
            <p className="text-[11px] text-gray-500 mt-1">Ahrefs → Keywords Explorer or Site Explorer → Export</p>
          </div>

          <p className="text-[11px] text-center text-gray-500">— or paste tab-separated data —</p>

          <textarea
            value={rawCsv}
            onChange={e => setRawCsv(e.target.value)}
            rows={5}
            placeholder="Paste Ahrefs CSV rows here (Keyword, Volume, Difficulty, CPC columns)..."
            className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
            data-testid="input-keyword-paste"
          />
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={handlePasteParse} disabled={importing || !rawCsv.trim()} data-testid="btn-parse-paste">
              {importing ? <Cpu className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Parse & Import
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowImport(false); setRawCsv(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* No keywords yet */}
      {!hasKeywords && !showImport && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center space-y-3">
          <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto" />
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No keywords imported yet</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Import an Ahrefs keyword export to build a data-driven SEO + GBP ranking strategy.</p>
          </div>
          <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setShowImport(true)}>
            <Upload className="h-3 w-3" /> Import Keywords
          </Button>
        </div>
      )}

      {/* Keywords overview */}
      {hasKeywords && (
        <div className="space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Total keywords', value: storedKeywords.length, color: 'text-violet-600 dark:text-violet-400' },
              { label: 'Total volume', value: totalVolume.toLocaleString(), color: 'text-gray-700 dark:text-gray-300' },
              { label: 'Quick wins', value: quickWinKws.length, color: quickWinKws.length > 0 ? 'text-emerald-600' : 'text-gray-400' },
              { label: 'Avg difficulty', value: (() => { const kws = storedKeywords.filter(k => k.difficulty !== null); return kws.length > 0 ? Math.round(kws.reduce((s, k) => s + k.difficulty!, 0) / kws.length) : '–'; })(), color: 'text-gray-700 dark:text-gray-300' },
            ].map(s => (
              <div key={s.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-center">
                <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Quick wins callout */}
          {quickWinKws.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
              <Zap className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">{quickWinKws.length} quick win keyword{quickWinKws.length !== 1 ? 's' : ''} — low difficulty, real volume</p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">{quickWinKws.slice(0, 4).map(k => k.keyword).join(', ')}{quickWinKws.length > 4 ? ` +${quickWinKws.length - 4} more` : ''}</p>
              </div>
            </div>
          )}

          {/* Keyword table */}
          <details className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors bg-gray-50 dark:bg-gray-800/40">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">All keywords ({storedKeywords.length})</p>
              <span className="text-[11px] text-gray-400">click to expand</span>
            </summary>
            <div className="max-h-64 overflow-y-auto">
              <div className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-white dark:bg-gray-900 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <span>Keyword</span><span>Volume</span><span>Diff</span><span>CPC</span>
              </div>
              {[...storedKeywords].sort((a, b) => (b.volume || 0) - (a.volume || 0)).map((kw, i) => (
                <div key={i} className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-2 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20" data-testid={`kw-row-${i}`}>
                  <span className="text-xs text-gray-800 dark:text-gray-200 truncate">{kw.keyword}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{kw.volume > 0 ? kw.volume.toLocaleString() : '–'}</span>
                  <span>{diffBadge(kw.difficulty)}</span>
                  <span className="text-[11px] text-gray-500">{kw.cpc != null ? `$${kw.cpc.toFixed(2)}` : '–'}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Generate Strategy button */}
          <div className="flex items-center gap-3">
            <Button
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white flex-1"
              onClick={handleGenerateStrategy}
              disabled={generating}
              data-testid="btn-generate-keyword-strategy"
            >
              {generating
                ? <><Cpu className="h-4 w-4 animate-spin" /> Generating strategy… (30–60s)</>
                : <><TrendingUp className="h-4 w-4" /> {hasStrategy ? 'Regenerate Strategy' : 'Generate SEO + GBP Strategy'}</>
              }
            </Button>
          </div>
          {generating && (
            <p className="text-[11px] text-violet-600 dark:text-violet-400 text-center">AI is clustering keywords, mapping pages, and building your ranking plan…</p>
          )}
        </div>
      )}

      {/* Strategy output */}
      {hasStrategy && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Strategy Output</p>
            <p className="text-[11px] text-gray-400">
              Generated {format(new Date(strategy.generatedAt), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>

          {/* Cluster summary cards */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-violet-500" /> Keyword Clusters ({strategy.clusters?.length || 0})
            </p>
            {(strategy.clusters || []).map((cluster: any, i: number) => (
              <div
                key={i}
                className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden cursor-pointer"
                onClick={() => setActiveCluster(activeCluster === i ? null : i)}
                data-testid={`cluster-${i}`}
              >
                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge className={`text-[10px] shrink-0 ${PRIORITY_CLS[cluster.priority] || PRIORITY_CLS.LOW}`}>
                      {cluster.priority}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{cluster.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{cluster.keywords?.slice(0, 3).join(', ')}{cluster.keywords?.length > 3 ? ` +${cluster.keywords.length - 3}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{(cluster.totalVolume || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">vol/mo</p>
                    </div>
                    {activeCluster === i ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                  </div>
                </div>
                {activeCluster === i && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[11px] text-gray-500 mb-1">Target page</p>
                        <p className="font-mono text-blue-600 dark:text-blue-400">/{cluster.pageTarget}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-500 mb-1">Primary keyword</p>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{cluster.primaryKeyword}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">Suggested H1</p>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">"{cluster.pageTitle}"</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1">All keywords in this cluster</p>
                      <div className="flex flex-wrap gap-1">
                        {(cluster.keywords || []).map((kw: string, ki: number) => (
                          <span key={ki} className="text-[11px] bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 px-2 py-0.5 rounded">{kw}</span>
                        ))}
                      </div>
                    </div>
                    {cluster.rationale && (
                      <p className="text-[11px] text-gray-500 italic border-l-2 border-violet-300 pl-2">{cluster.rationale}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick wins */}
          {strategy.quickWins?.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Quick Wins — target these first
              </p>
              <div className="flex flex-wrap gap-1.5">
                {strategy.quickWins.map((kw: string, i: number) => (
                  <span key={i} className="text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded font-medium">{kw}</span>
                ))}
              </div>
            </div>
          )}

          {/* Strategy section tabs */}
          <div className="flex gap-1 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50 dark:bg-gray-900">
            {([
              { id: 'seo', label: '🔍 SEO Plan', icon: Globe },
              { id: 'gbp', label: '📍 GBP Plan', icon: MapPin },
              { id: 'plan', label: '📅 Execution', icon: Calendar },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex-1 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${activeSection === tab.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                data-testid={`tab-strategy-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* SEO Plan */}
          {activeSection === 'seo' && strategy.seoStrategy && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">SEO Strategy Summary</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{strategy.seoStrategy.summary}</p>
              </div>

              {/* Priority pages */}
              {strategy.seoStrategy.priorityPages?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Priority Pages to Build</p>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                      <span>Page</span><span>Target keyword</span><span>Vol</span><span>Diff</span><span>Timeline</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                      {strategy.seoStrategy.priorityPages.map((page: any, i: number) => (
                        <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-2 px-3 py-2.5 items-center" data-testid={`priority-page-${i}`}>
                          <div>
                            <p className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate">/{page.slug}</p>
                            <p className="text-[11px] text-gray-400 truncate">{page.title}</p>
                          </div>
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{page.targetKeyword}</span>
                          <span className="text-xs text-gray-600 dark:text-gray-400">{page.estimatedVolume > 0 ? page.estimatedVolume.toLocaleString() : '–'}</span>
                          <span>{diffBadge(page.difficulty)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${WEEK_CLS[page.contentPriority] || 'bg-gray-100 text-gray-600'}`}>{page.contentPriority}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Technical notes */}
              {strategy.seoStrategy.technicalNotes?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Technical Notes</p>
                  {strategy.seoStrategy.technicalNotes.map((note: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}

              {strategy.seoStrategy.linkBuildingFocus && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1">Link Building Focus</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{strategy.seoStrategy.linkBuildingFocus}</p>
                </div>
              )}
            </div>
          )}

          {/* GBP Plan */}
          {activeSection === 'gbp' && strategy.gbpStrategy && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-1">GBP Strategy Summary</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">{strategy.gbpStrategy.summary}</p>
              </div>

              {/* Category recommendations */}
              {(strategy.gbpStrategy.primaryCategory || strategy.gbpStrategy.additionalCategories?.length > 0) && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Category Recommendations</p>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                    {strategy.gbpStrategy.primaryCategory && (
                      <div className="flex items-center gap-2">
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Primary: {strategy.gbpStrategy.primaryCategory}</span>
                      </div>
                    )}
                    {strategy.gbpStrategy.additionalCategories?.map((cat: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services to add */}
              {strategy.gbpStrategy.servicesToAdd?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Services to Add to GBP</p>
                  <div className="flex flex-wrap gap-1.5">
                    {strategy.gbpStrategy.servicesToAdd.map((s: string, i: number) => (
                      <span key={i} className="text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Post schedule */}
              {strategy.gbpStrategy.postSchedule?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">8-Week Post Schedule</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {strategy.gbpStrategy.postSchedule.map((post: any, i: number) => (
                      <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1" data-testid={`gbp-post-${i}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${post.type === 'OFFER' ? 'bg-amber-100 text-amber-700' : post.type === 'EVENT' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              Week {post.week} · {post.type}
                            </Badge>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{post.topic}</p>
                          </div>
                          <span className="text-[10px] text-violet-600 dark:text-violet-400 shrink-0">#{post.targetKeyword}</span>
                        </div>
                        {post.suggestedText && (
                          <p className="text-[11px] text-gray-500 leading-relaxed">{post.suggestedText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review keywords */}
              {strategy.gbpStrategy.reviewKeywords?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Phrases to encourage in reviews</p>
                  <div className="flex flex-wrap gap-1.5">
                    {strategy.gbpStrategy.reviewKeywords.map((kw: string, i: number) => (
                      <span key={i} className="text-[11px] bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded italic">"{kw}"</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q&A */}
              {strategy.gbpStrategy.qAndAKeywords?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">GBP Q&A to seed</p>
                  {strategy.gbpStrategy.qAndAKeywords.map((qa: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-blue-500 shrink-0 font-bold">Q:</span>
                      <span className="text-gray-700 dark:text-gray-300">{qa.question}</span>
                      <Badge className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 shrink-0">{qa.keywordTarget}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Execution plan */}
          {activeSection === 'plan' && (
            <div className="space-y-3">
              {/* KPI targets */}
              {strategy.kpiTargets && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Month 3', value: strategy.kpiTargets.month3, color: 'text-amber-600 dark:text-amber-400' },
                    { label: 'Month 6', value: strategy.kpiTargets.month6, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Month 12', value: strategy.kpiTargets.month12, color: 'text-emerald-600 dark:text-emerald-400' },
                  ].map(t => (
                    <div key={t.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center space-y-1">
                      <div className="text-[11px] font-semibold text-gray-500">{t.label}</div>
                      <p className={`text-xs ${t.color} leading-snug`}>{t.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Weekly execution plan */}
              {strategy.executionPlan?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Weekly Execution Plan</p>
                  {strategy.executionPlan.map((week: any, i: number) => (
                    <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid={`exec-week-${i}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${week.channel === 'SEO' ? 'bg-blue-100 text-blue-700' : week.channel === 'GBP' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                          Week {week.week}
                        </Badge>
                        <Badge className={`text-[10px] ${week.channel === 'SEO' ? 'bg-blue-100 text-blue-700' : week.channel === 'GBP' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                          {week.channel}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {(week.actions || []).map((action: string, ai: number) => (
                          <div key={ai} className="flex items-start gap-1.5 text-xs">
                            <CheckCircle className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                            <span className="text-gray-700 dark:text-gray-300">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Updated at */}
          {strategy.generatedAt && (
            <p className="text-[11px] text-gray-400 text-center">Strategy generated {format(new Date(strategy.generatedAt), 'dd/MM/yyyy HH:mm')} · {strategy.keywordCount} keywords</p>
          )}
        </div>
      )}
    </div>
  );
}
