import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Globe, Search, BarChart3, Star, Zap, ChevronRight, MapPin, RefreshCw,
  Loader2, Link2, X, ExternalLink, Play, MessageSquare, ChevronDown,
  ThumbsUp, Building2, Unlink, Target, Radio, Image as ImageIcon,
} from 'lucide-react';
import GrowthOperatorPanel from './GrowthOperatorPanel';
import ClientActivationPanel from './ClientActivationPanel';
import ClientExecutionIntelligence from './ClientExecutionIntelligence';
import ClientOverviewStrip from './ClientOverviewStrip';
import WebsiteEnginePanel from './WebsiteEnginePanel';
import SEOEnginePanel from './SEOEnginePanel';
import GBPEnginePanel from './GBPEnginePanel';
import AdsEnginePanel from './AdsEnginePanel';
import PlaybookPanel from './PlaybookPanel';
import LearningInsightsPanel from './LearningInsightsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Client, HealthStatus, ChannelStatus, HEALTH_STATUS_LABELS,
  HEALTH_CONTRIBUTOR_LABELS,
} from '@/lib/types';
import ClientOnboardingHandover from '@/components/ClientOnboardingHandover';
import GBPPlaybookPanel from '@/components/GBPPlaybookPanel';
import GBPMapsEnginePanel from '@/components/GBPMapsEnginePanel';
import { useAuth } from '@/contexts/AuthContext';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { useDispatch } from 'react-redux';
import { updateClient } from '@/store/index';
import { useToast } from '@/hooks/use-toast';

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

// ── ARP rank colour helper ────────────────────────────────────────────────────
function arpColor(arp: number | null) {
  if (arp === null) return 'text-muted-foreground';
  if (arp <= 3) return 'text-emerald-600 dark:text-emerald-400';
  if (arp <= 7) return 'text-lime-600 dark:text-lime-400';
  if (arp <= 13) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
function arpBg(arp: number | null) {
  if (arp === null) return 'bg-muted/40 text-muted-foreground';
  if (arp <= 3) return 'bg-emerald-500 text-white';
  if (arp <= 7) return 'bg-lime-500 text-white';
  if (arp <= 13) return 'bg-amber-400 text-white';
  if (arp <= 20) return 'bg-red-400 text-white';
  return 'bg-zinc-400 text-white';
}

interface LFLocation {
  id: string;
  place_id: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  rating: string;
  reviews: string;
  url?: string;
  phone?: string;
}

interface LFReport {
  id: string;
  report_key: string;
  date: string;
  keyword: string;
  grid_size: string;
  radius: string;
  measurement: string;
  arp: string;
  atrp: string;
  solv: string;
  image: string;
  heatmap: string;
  pdf: string;
  public_url: string;
  place_id: string;
}

const GRID_SIZES = ['3', '5', '7', '9', '11', '13'];

// ── Parse keywords from the onboarding keyword summary text ───────────────────
function parseKeywordsFromSummary(summary: string): Array<{ keyword: string; volume: number | null; difficulty: number | null }> {
  if (!summary) return [];
  const lines = summary.split('\n');
  const results: Array<{ keyword: string; volume: number | null; difficulty: number | null }> = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().startsWith('keyword') && trimmed.includes('|')) { inTable = true; continue; }
    if (inTable && /^[-|]+$/.test(trimmed.replace(/\s/g, ''))) continue;
    if (inTable && trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      const keyword = parts[0];
      if (!keyword || keyword.startsWith('---')) continue;
      const vol = parts[1] ? Number(parts[1].replace(/[,\s]/g, '')) : null;
      const kd = parts[2] ? Number(parts[2]) : null;
      if (keyword) results.push({ keyword, volume: isNaN(vol!) ? null : vol, difficulty: isNaN(kd!) ? null : kd });
    } else if (inTable && !trimmed.includes('|')) {
      inTable = false;
    }
  }
  return results.slice(0, 25);
}


// ── Local Falcon date helper ─────────────────────────────────────────────────
function fmtLFDate(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
}

function LocalPresenceSection({ client }: { client: Client }) {
  const { orgId, authReady } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'rankings' | 'playbook' | 'maps-engine'>('rankings');
  const [showPicker, setShowPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showRunScan, setShowRunScan] = useState(false);
  const [scanKeyword, setScanKeyword] = useState('');
  const [scanGridSize, setScanGridSize] = useState('5');
  const [selectedReport, setSelectedReport] = useState<LFReport | null>(null);

  const hasLinked = !!client.localFalconPlaceId;
  const loc = client.localFalconLocation;

  // Fetch LF locations for picker
  const { data: locationsData, isLoading: locationsLoading } = useQuery<{ data: { locations: LFLocation[] } }>({
    queryKey: ['/api/local-falcon/locations'],
    queryFn: async () => {
      const resp = await fetch('/api/local-falcon/locations');
      if (!resp.ok) throw new Error('Failed to fetch locations');
      return resp.json();
    },
    enabled: showPicker,
    staleTime: 60_000,
  });

  const locations = locationsData?.data?.locations || [];
  const filteredLocations = locationSearch
    ? locations.filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()) || l.address.toLowerCase().includes(locationSearch.toLowerCase()))
    : locations;

  // Fetch scan reports for linked location
  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useQuery<{ data: { reports: LFReport[]; count: number } }>({
    queryKey: ['/api/local-falcon/reports', client.localFalconPlaceId],
    queryFn: async () => {
      const resp = await fetch(`/api/local-falcon/reports?placeId=${encodeURIComponent(client.localFalconPlaceId!)}&limit=50`);
      if (!resp.ok) throw new Error('Failed to fetch reports');
      return resp.json();
    },
    enabled: !!client.localFalconPlaceId && isExpanded,
    staleTime: 120_000,
  });

  // Link a location to this client
  const linkMutation = useMutation({
    mutationFn: async (l: LFLocation) => {
      if (!orgId) throw new Error('No org');
      await updateClientInFirestore(orgId, client.id, {
        localFalconPlaceId: l.place_id,
        localFalconLocation: { name: l.name, address: l.address, lat: l.lat, lng: l.lng },
      }, authReady);
    },
    onSuccess: (_, l) => {
      dispatch(updateClient({ ...client, localFalconPlaceId: l.place_id, localFalconLocation: { name: l.name, address: l.address, lat: l.lat, lng: l.lng } }));
      setShowPicker(false);
      setLocationSearch('');
      queryClient.invalidateQueries({ queryKey: ['/api/local-falcon/reports', l.place_id] });
      toast({ title: 'Location linked', description: `${l.name} linked to this client.` });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to link location', variant: 'destructive' }),
  });

  // Unlink
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org');
      await updateClientInFirestore(orgId, client.id, { localFalconPlaceId: undefined, localFalconLocation: undefined }, authReady);
    },
    onSuccess: () => {
      dispatch(updateClient({ ...client, localFalconPlaceId: undefined, localFalconLocation: undefined }));
      toast({ title: 'Location unlinked' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to unlink location', variant: 'destructive' }),
  });

  // Run a new scan — uses the business's own coordinates
  const runScanMutation = useMutation({
    mutationFn: async () => {
      if (!loc || !client.localFalconPlaceId) throw new Error('No location linked');
      if (!scanKeyword.trim()) throw new Error('Keyword required');
      const resp = await fetch('/api/local-falcon/run-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: client.localFalconPlaceId,
          keyword: scanKeyword.trim(),
          lat: loc.lat,
          lng: loc.lng,
          gridSize: scanGridSize,
          radius: '3',
          measurement: 'km',
          businessName: loc.name || client.name,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Scan failed');
      }
      return resp.json();
    },
    onSuccess: () => {
      setShowRunScan(false);
      setScanKeyword('');
      refetchReports();
      toast({ title: 'Scan complete', description: 'New scan results are ready.' });
    },
    onError: (err: Error) => toast({ title: 'Scan failed', description: err.message, variant: 'destructive' }),
  });

  const reports = reportsData?.data?.reports || [];
  const latestReport = reports[0];
  const latestArp = latestReport ? parseFloat(latestReport.arp) : null;
  const latestSolv = latestReport ? parseFloat(latestReport.solv) : null;

  const inThreePack = useMemo(() => {
    const byKw = new Map<string, number>();
    reports.forEach(r => {
      const arp = parseFloat(r.arp);
      const existing = byKw.get(r.keyword);
      if (existing === undefined || arp < existing) byKw.set(r.keyword, arp);
    });
    return [...byKw.values()].filter(v => v <= 3).length;
  }, [reports]);

  return (
    <>
    <div className="border rounded-lg overflow-hidden mb-3" data-testid="local-gbp-section">
      {/* Section header */}
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(p => !p)}
        data-testid="toggle-local-presence"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-medium">Local GBP Rankings</p>
          {inThreePack > 0 && (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">
              {inThreePack} in 3-pack
            </Badge>
          )}
          {hasLinked && latestSolv !== null && (
            <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 dark:text-violet-400">
              {latestSolv.toFixed(0)}% SoLV
            </Badge>
          )}
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {isExpanded && (
        <div className="border-t space-y-0">
          {/* Tabs */}
          <div className="flex border-b">
            <button onClick={() => setActiveTab('rankings')} className={`flex-1 py-2 text-[11px] font-medium transition-colors ${activeTab === 'rankings' ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400' : 'text-muted-foreground hover:text-foreground'}`} data-testid="tab-gbp-rankings">Rank Tracking</button>
            {client.gbpLocationName && (
              <button onClick={() => setActiveTab('maps-engine')} className={`flex-1 py-2 text-[11px] font-medium transition-colors ${activeTab === 'maps-engine' ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400' : 'text-muted-foreground hover:text-foreground'}`} data-testid="tab-gbp-maps-engine">Maps Engine</button>
            )}
            <button onClick={() => setActiveTab('playbook')} className={`flex-1 py-2 text-[11px] font-medium transition-colors ${activeTab === 'playbook' ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400' : 'text-muted-foreground hover:text-foreground'}`} data-testid="tab-gbp-playbook">3-Pack Playbook</button>
          </div>

          {/* Maps Engine Tab */}
          {activeTab === 'maps-engine' && <div className="p-3"><GBPMapsEnginePanel client={client} /></div>}

          {/* 3-Pack Playbook Tab */}
          {activeTab === 'playbook' && (
            <div className="p-3">
              <GBPPlaybookPanel client={client} parsedKeywords={[]} onPlaybookUpdate={() => {}} />
            </div>
          )}

          {/* Rank Tracking Tab */}
          {activeTab === 'rankings' && <>

          {/* Location picker */}
          {showPicker && (
            <div className="p-3 border-b bg-muted/10 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">Select Local Falcon location</p>
                <button onClick={() => { setShowPicker(false); setLocationSearch(''); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder="Search locations…"
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                className="h-8 text-xs"
                data-testid="input-location-search"
                autoFocus
              />
              {locationsLoading ? (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : filteredLocations.length === 0 ? (
                <div className="py-3 space-y-2 text-center">
                  <p className="text-xs text-muted-foreground">No saved locations found in your Local Falcon account.</p>
                  <p className="text-[11px] text-muted-foreground">Add this business at <a href="https://localfalcon.com" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">localfalcon.com</a> first, then refresh.</p>
                  <button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/local-falcon/locations'] })} className="inline-flex items-center gap-1.5 text-[11px] border rounded px-3 py-1.5 hover:bg-muted/30 transition-colors">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {filteredLocations.map(l => (
                    <button key={l.id} className="w-full text-left p-2 rounded border hover:bg-muted/30 transition-colors" onClick={() => linkMutation.mutate(l)} disabled={linkMutation.isPending} data-testid={`location-option-${l.id}`}>
                      <p className="text-xs font-medium">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">{l.address}</p>
                      {(l.rating && l.rating !== '0.000') && <p className="text-[11px] text-amber-600">★ {parseFloat(l.rating).toFixed(1)} · {l.reviews} reviews</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Not linked state */}
          {!hasLinked && !showPicker && (
            <div className="p-4 text-center space-y-2.5">
              <div className="mx-auto w-10 h-10 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No location linked</p>
                <p className="text-xs text-muted-foreground mt-0.5">Link a saved Local Falcon location to view rank grids</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowPicker(true)} data-testid="btn-link-location">
                <Link2 className="h-3.5 w-3.5" /> Link Location
              </Button>
            </div>
          )}

          {/* Linked state */}
          {hasLinked && !showPicker && (
            <>
              {/* Location bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3 w-3 text-violet-500 shrink-0" />
                  <p className="text-xs font-medium truncate">{loc?.name || 'Linked Location'}</p>
                  {loc?.address && <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">· {loc.address}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button onClick={() => setShowPicker(true)} className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50" data-testid="btn-change-location">Change</button>
                  <button onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending} className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/50" data-testid="btn-unlink-location"><X className="h-3 w-3" /></button>
                </div>
              </div>

              {reportsLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {/* Metrics row */}
                  {latestReport && (
                    <div className="grid grid-cols-3 divide-x border-b">
                      {[
                        { label: 'Avg Rank', value: latestArp !== null ? `#${latestArp.toFixed(1)}` : '—', color: arpColor(latestArp) },
                        { label: 'SoLV', value: latestSolv !== null ? `${latestSolv.toFixed(0)}%` : '—', color: 'text-violet-600 dark:text-violet-400' },
                        { label: 'Scans', value: reports.length.toString(), color: 'text-foreground' },
                      ].map(m => (
                        <div key={m.label} className="py-2 px-2 text-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{m.label}</p>
                          <p className={`text-base font-bold leading-none ${m.color}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scan History header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/10">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scan History</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => refetchReports()} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50" data-testid="btn-refresh-reports"><RefreshCw className="h-3 w-3" /></button>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => setShowRunScan(v => !v)} data-testid="btn-show-run-scan">
                        <Radio className="h-3 w-3" /> New Scan
                      </Button>
                    </div>
                  </div>

                  {/* New scan form */}
                  {showRunScan && (
                    <div className="p-3 bg-muted/10 border-b space-y-2">
                      <Input placeholder="Keyword (e.g. crane truck hire brisbane)" value={scanKeyword} onChange={e => setScanKeyword(e.target.value)} className="h-8 text-xs" data-testid="input-scan-keyword" />
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-1">Grid Size</p>
                          <select value={scanGridSize} onChange={e => setScanGridSize(e.target.value)} className="w-full h-8 text-xs rounded border bg-background px-2" data-testid="select-grid-size">
                            {GRID_SIZES.map(s => <option key={s} value={s}>{s}×{s}</option>)}
                          </select>
                        </div>
                        <div className="flex items-end gap-1 flex-1">
                          <Button size="sm" className="flex-1 h-8 gap-1" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending || !scanKeyword.trim()} data-testid="btn-run-scan">
                            {runScanMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Scanning…</> : <><Radio className="h-3 w-3" /> Run Scan</>}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowRunScan(false); setScanKeyword(''); }} disabled={runScanMutation.isPending}>Cancel</Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Scans from the business address. Larger grids use more scan credits.</p>
                    </div>
                  )}

                  {/* Scan history cards */}
                  {reports.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                      <p className="text-xs text-muted-foreground">No scans yet — run your first scan to see local rankings</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {reports.map(r => {
                        const arp = parseFloat(r.arp);
                        const solv = parseFloat(r.solv);
                        const gridImg = r.heatmap || r.image || '';
                        return (
                          <div key={r.id} className="px-3 py-2.5 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`inline-flex items-center justify-center h-6 w-7 rounded text-[11px] font-bold shrink-0 ${arpBg(arp)}`}>
                                {isNaN(arp) ? '?' : arp <= 20 ? `#${arp.toFixed(0)}` : '20+'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{r.keyword}</p>
                                <p className="text-[11px] text-muted-foreground">{fmtLFDate(r.date)} · {isNaN(solv) ? '—' : `${solv.toFixed(0)}% SoLV`} · {r.grid_size}×{r.grid_size} grid</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {gridImg && (
                                  <button
                                    onClick={() => setSelectedReport(r)}
                                    className="text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 p-1 rounded hover:bg-muted/50"
                                    title="View heatmap grid"
                                    data-testid={`btn-view-heatmap-${r.id}`}
                                  >
                                    <ImageIcon className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {r.public_url && (
                                  <a href={r.public_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50" title="View full report">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                            {gridImg && (
                              <button
                                onClick={() => setSelectedReport(r)}
                                className="w-full rounded overflow-hidden border hover:opacity-90 transition-opacity"
                                data-testid={`btn-heatmap-thumb-${r.id}`}
                              >
                                <img src={gridImg} alt={`${r.keyword} heatmap`} className="w-full h-auto" loading="lazy" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          </>}
        </div>
      )}
    </div>

    {/* Heatmap full-screen modal */}
    {selectedReport && (
      <div
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={() => setSelectedReport(null)}
        data-testid="heatmap-modal"
      >
        <div className="relative max-w-2xl w-full bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-3 border-b">
            <div>
              <p className="text-sm font-semibold">{selectedReport.keyword}</p>
              <p className="text-xs text-muted-foreground">{fmtLFDate(selectedReport.date)} · ARP #{parseFloat(selectedReport.arp).toFixed(1)} · {parseFloat(selectedReport.solv).toFixed(0)}% SoLV · {selectedReport.grid_size}×{selectedReport.grid_size} grid</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedReport.public_url && (
                <a href={selectedReport.public_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Full report
                </a>
              )}
              <button onClick={() => setSelectedReport(null)} className="text-muted-foreground hover:text-foreground p-1 rounded" data-testid="btn-close-heatmap-modal"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <img src={selectedReport.heatmap || selectedReport.image} alt="Heatmap grid" className="w-full" />
        </div>
      </div>
    )}
    </>
  );
}


interface GBPReview {
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string; updateTime: string };
  name: string;
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function StarRating({ rating }: { rating: string }) {
  const n = STAR_MAP[rating] ?? 0;
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  );
}

function GBPReviewsSection({ client }: { client: Client }) {
  const { orgId } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const [pickerStep, setPickerStep] = useState<'account' | 'location'>('account');
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const hasLocation = !!client.gbpLocationName;

  // Check GBP org connection status
  const { data: gbpStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/gbp/status', orgId],
    queryFn: async () => {
      if (!orgId) return { connected: false };
      const r = await fetch(`/api/gbp/status?orgId=${orgId}`);
      return r.json();
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // Fetch GBP accounts for picker
  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: { name: string; accountName: string; type: string }[] }>({
    queryKey: ['/api/gbp/accounts', orgId],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/accounts?orgId=${encodeURIComponent(orgId!)}`);
      if (!r.ok) throw new Error('Failed to fetch accounts');
      return r.json();
    },
    enabled: !!orgId && gbpStatus?.connected && showPicker && pickerStep === 'account',
    staleTime: 60_000,
  });

  // Fetch GBP locations for selected account
  const { data: locationsData, isLoading: locationsLoading } = useQuery<{ locations: { name: string; title: string; storefrontAddress?: { addressLines?: string[] }; metadata?: { mapsUri?: string } }[] }>({
    queryKey: ['/api/gbp/locations', orgId, selectedAccount],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/locations?orgId=${encodeURIComponent(orgId!)}&accountName=${encodeURIComponent(selectedAccount!)}`);
      if (!r.ok) throw new Error('Failed to fetch locations');
      return r.json();
    },
    enabled: !!orgId && !!selectedAccount && pickerStep === 'location',
    staleTime: 60_000,
  });

  // Fetch GBP reviews for linked location
  const { data: reviewsData, isLoading: reviewsLoading, refetch: refetchReviews } = useQuery<{ reviews: GBPReview[]; averageRating: string; totalReviewCount: number }>({
    queryKey: ['/api/gbp/reviews', orgId, client.gbpLocationName],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/reviews?orgId=${encodeURIComponent(orgId!)}&locationName=${encodeURIComponent(client.gbpLocationName!)}`);
      if (!r.ok) throw new Error('Failed to fetch reviews');
      return r.json();
    },
    enabled: !!orgId && !!client.gbpLocationName && isExpanded,
    staleTime: 120_000,
  });

  // Link a GBP location to this client
  const linkMutation = useMutation({
    mutationFn: async (locationName: string) => {
      if (!orgId) throw new Error('No org');
      const r = await fetch(`/api/clients/${client.id}/gbp-location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, gbpLocationName: locationName }),
      });
      if (!r.ok) throw new Error('Failed to link');
    },
    onSuccess: (_, locationName) => {
      dispatch(updateClient({ ...client, gbpLocationName: locationName }));
      setShowPicker(false);
      setPickerStep('account');
      setSelectedAccount(null);
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/reviews', orgId, locationName] });
      toast({ title: 'GBP location linked', description: 'Reviews will now load for this client.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to link GBP location', variant: 'destructive' }),
  });

  // Unlink GBP location
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org');
      const r = await fetch(`/api/clients/${client.id}/gbp-location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, gbpLocationName: null }),
      });
      if (!r.ok) throw new Error('Failed to unlink');
    },
    onSuccess: () => {
      dispatch(updateClient({ ...client, gbpLocationName: undefined }));
      toast({ title: 'Unlinked', description: 'GBP location removed from this client.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to unlink', variant: 'destructive' }),
  });

  // Reply to a review
  const replyMutation = useMutation({
    mutationFn: async ({ reviewName, reply }: { reviewName: string; reply: string }) => {
      if (!orgId) throw new Error('No org');
      const encoded = encodeURIComponent(reviewName);
      const r = await fetch(`/api/gbp/reviews/${encoded}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, reply }),
      });
      if (!r.ok) throw new Error('Failed to post reply');
    },
    onSuccess: () => {
      setReplyingTo(null);
      setReplyText('');
      refetchReviews();
      toast({ title: 'Reply posted', description: 'Your reply has been posted to Google.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to post reply', variant: 'destructive' }),
  });

  const avgStars = reviewsData ? Number(reviewsData.averageRating) || 0 : 0;

  return (
    <div className="border-t pt-4 mt-4">
      <button
        className="w-full flex items-center justify-between text-sm font-medium hover:text-foreground/80 transition-colors"
        onClick={() => setIsExpanded(v => !v)}
        data-testid="button-toggle-gbp-reviews"
      >
        <span className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          Google Business Reviews
          {reviewsData && (
            <Badge variant="outline" className="text-[10px] ml-1">{reviewsData.totalReviewCount} reviews · {avgStars.toFixed(1)}★</Badge>
          )}
          {hasLocation && !reviewsData && (
            <Badge variant="outline" className="text-[10px] ml-1 text-muted-foreground">Linked</Badge>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {!gbpStatus?.connected ? (
            <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>Google Business Profile is not connected to your account yet.</span>
              </div>
              <button
                onClick={() => window.location.href = '/settings?tab=integrations'}
                className="ml-5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                data-testid="button-go-to-gbp-settings"
              >
                Go to Settings → Integrations
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          ) : !hasLocation ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Link a GBP location to pull live reviews for this client.</p>
              {!showPicker ? (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowPicker(true); setPickerStep('account'); }} data-testid="button-link-gbp-location">
                  <Link2 className="h-3.5 w-3.5 mr-1.5" /> Link GBP Location
                </Button>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-2 bg-muted/30 border-b flex items-center justify-between">
                    <span className="text-xs font-medium">{pickerStep === 'account' ? 'Select Account' : 'Select Location'}</span>
                    <button onClick={() => { setShowPicker(false); setPickerStep('account'); setSelectedAccount(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  {pickerStep === 'account' && (
                    <div className="divide-y max-h-48 overflow-y-auto">
                      {accountsLoading && <div className="p-3 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}
                      {!accountsLoading && (!accountsData?.accounts?.length) && <p className="p-3 text-xs text-muted-foreground text-center">No accounts found</p>}
                      {accountsData?.accounts?.map(acc => (
                        <button key={acc.name} className="w-full text-left p-2.5 text-xs hover:bg-muted/50 flex items-center gap-2" onClick={() => { setSelectedAccount(acc.name); setPickerStep('location'); }}>
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">{acc.accountName}</p>
                            <p className="text-muted-foreground">{acc.type}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                        </button>
                      ))}
                    </div>
                  )}
                  {pickerStep === 'location' && (
                    <div className="divide-y max-h-48 overflow-y-auto">
                      <button className="w-full text-left p-2 text-xs text-muted-foreground hover:bg-muted/50 flex items-center gap-1.5" onClick={() => { setPickerStep('account'); setSelectedAccount(null); }}>
                        ← Back to accounts
                      </button>
                      {locationsLoading && <div className="p-3 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}
                      {!locationsLoading && (!locationsData?.locations?.length) && <p className="p-3 text-xs text-muted-foreground text-center">No locations found</p>}
                      {locationsData?.locations?.map(loc => (
                        <button key={loc.name} className="w-full text-left p-2.5 text-xs hover:bg-muted/50 flex items-start gap-2" onClick={() => linkMutation.mutate(loc.name)} disabled={linkMutation.isPending}>
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{loc.title}</p>
                            {loc.storefrontAddress?.addressLines && <p className="text-muted-foreground">{loc.storefrontAddress.addressLines.join(', ')}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header row with avg rating + unlink */}
              <div className="flex items-center justify-between">
                {reviewsData && (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{avgStars.toFixed(1)}</span>
                    <div>
                      <span className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(avgStars) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                        ))}
                      </span>
                      <p className="text-[11px] text-muted-foreground">{reviewsData.totalReviewCount} review{reviewsData.totalReviewCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )}
                {reviewsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground" onClick={() => refetchReviews()}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-red-500" onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending} data-testid="button-unlink-gbp">
                    <Unlink className="h-3 w-3 mr-1" /> Unlink
                  </Button>
                </div>
              </div>

              {/* Reviews list */}
              {reviewsLoading && (
                <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
              )}
              {!reviewsLoading && reviewsData?.reviews && (
                <div className="space-y-3">
                  {reviewsData.reviews.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No reviews yet</p>}
                  {reviewsData.reviews.map(review => (
                    <div key={review.reviewId} className="border rounded-lg overflow-hidden">
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {review.reviewer.profilePhotoUrl ? (
                              <img src={review.reviewer.profilePhotoUrl} alt={review.reviewer.displayName} className="h-7 w-7 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                                {review.reviewer.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{review.reviewer.displayName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(review.createTime).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <StarRating rating={review.starRating} />
                        </div>
                        {review.comment && <p className="text-xs text-muted-foreground leading-relaxed">{review.comment}</p>}
                      </div>

                      {/* Existing reply */}
                      {review.reviewReply && (
                        <div className="bg-muted/30 border-t p-2.5">
                          <p className="text-[11px] font-medium text-muted-foreground mb-0.5 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Your reply</p>
                          <p className="text-xs text-muted-foreground">{review.reviewReply.comment}</p>
                        </div>
                      )}

                      {/* Reply section */}
                      {!review.reviewReply && (
                        <div className="border-t">
                          {replyingTo === review.reviewId ? (
                            <div className="p-2.5 space-y-2">
                              <Textarea
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                placeholder="Write a reply..."
                                className="text-xs min-h-[60px] resize-none"
                                data-testid="input-gbp-reply"
                              />
                              <div className="flex gap-1.5 flex-wrap">
                                <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => replyMutation.mutate({ reviewName: review.name, reply: replyText })} disabled={!replyText.trim() || replyMutation.isPending}>
                                  {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post Reply'}
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1 text-violet-600 border-violet-200 hover:bg-violet-50"
                                  disabled={suggestingFor === review.reviewId}
                                  data-testid={`button-ai-suggest-${review.reviewId}`}
                                  onClick={async () => {
                                    setSuggestingFor(review.reviewId);
                                    try {
                                      const r = await fetch('/api/gbp/suggest-reply', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          reviewerName: review.reviewer.displayName,
                                          starRating: review.starRating,
                                          reviewText: review.comment || '',
                                          businessName: client.businessName,
                                          businessCategory: client.gbpPlaybook?.categoryPrimary || client.industry || '',
                                          serviceAreaSummary: (client.gbpPlaybook?.serviceAreaSuburbs || []).slice(0, 5).join(', ') || client.city || '',
                                        }),
                                      });
                                      const data = await r.json();
                                      if (data.suggestion) setReplyText(data.suggestion);
                                    } catch { toast({ title: 'AI Suggest failed', variant: 'destructive' }); }
                                    finally { setSuggestingFor(null); }
                                  }}
                                >
                                  {suggestingFor === review.reviewId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                  AI Suggest
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => { setReplyingTo(null); setReplyText(''); setSuggestingFor(null); }}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <button className="w-full text-left p-2 text-[11px] text-muted-foreground hover:bg-muted/30 flex items-center gap-1.5 transition-colors" onClick={() => { setReplyingTo(review.reviewId); setReplyText(''); }} data-testid={`button-reply-review-${review.reviewId}`}>
                              <MessageSquare className="h-3 w-3" /> Reply
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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

        {/* Client Overview Strip — health, channels, key action — shown for ALL clients */}
        <ClientOverviewStrip client={client} />

        {/* Growth Execution Intelligence — shown for activated clients with sourceIntelligence */}
        {client.activationPlan && client.sourceIntelligence && (
          <ClientExecutionIntelligence client={client} />
        )}

        {/* Client Activation Plan — shown when lead was converted with scope */}
        {client.activationPlan && <ClientActivationPanel client={client} />}

        {/* AI Growth Operator — Phase 1 Panel */}
        <GrowthOperatorPanel client={client} />

        {/* Phase 3 — Website & SEO Engines */}
        <WebsiteEnginePanel client={client} />
        <SEOEnginePanel client={client} />

        {/* Phase 4 — GBP & Ads Engines */}
        <GBPEnginePanel client={client} />
        <AdsEnginePanel client={client} />

        {/* Phase 5 — Playbook & Learning */}
        <PlaybookPanel client={client} />
        <LearningInsightsPanel client={client} />

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

          {/* Local GBP Rankings */}
          <LocalPresenceSection client={client} />

          {/* GBP Reviews */}
          <GBPReviewsSection client={client} />

          {/* AI Onboarding & Team Handover */}
          <ClientOnboardingHandover client={client} />
        </div>
      </div>
    </ScrollArea>
  );
}
