import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Globe, Search, BarChart3, Star, Zap, ChevronRight, MapPin, RefreshCw,
  Loader2, Link2, X, ExternalLink, Radio, Play, MessageSquare, ChevronDown,
  ThumbsUp, Building2, Unlink, Target, ScanSearch, Upload, FileText,
} from 'lucide-react';
import { parseKeywordFile } from '@/lib/parseKeywordFile';
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
const RADII = ['1', '2', '3', '5', '8', '10', '15', '20'];

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

// ── 3-pack status helpers ─────────────────────────────────────────────────────
function threePackStatus(arp: number | null): { label: string; color: string; dot: string } {
  if (arp === null) return { label: 'Not scanned', color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' };
  if (arp <= 3) return { label: 'In 3-pack', color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
  if (arp <= 7) return { label: 'Near top 3', color: 'text-lime-600 dark:text-lime-400', dot: 'bg-lime-500' };
  if (arp <= 15) return { label: 'Outside top 10', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400' };
  return { label: 'Not ranking', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
}

function threePackAction(keyword: string, arp: number | null): string {
  if (arp === null) return `Run a scan for "${keyword}" to see current local rank`;
  if (arp <= 3) return `Maintain position — post regular GBP updates for "${keyword}"`;
  if (arp <= 7) return `Boost "${keyword}" with more reviews + keyword in GBP description`;
  if (arp <= 15) return `Build local citations and GBP posts targeting "${keyword}"`;
  return `Low authority for "${keyword}" — complete GBP profile, photos, and reviews`;
}

function LocalPresenceSection({ client }: { client: Client }) {
  const { orgId, authReady } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showRunScan, setShowRunScan] = useState(false);
  const [scanKeyword, setScanKeyword] = useState('');
  const [scanGridSize, setScanGridSize] = useState('7');
  const [scanRadius, setScanRadius] = useState('3');
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [keywordUploading, setKeywordUploading] = useState(false);
  const keywordFileRef = useRef<HTMLInputElement>(null);

  const hasLinked = !!client.localFalconPlaceId;

  const handleKeywordFileUpload = async (file: File) => {
    setKeywordUploading(true);
    try {
      const summary = await parseKeywordFile(file);
      const updatedOnboarding = { ...(client.clientOnboarding || {}), keywordSummary: summary };
      await updateClientInFirestore(orgId, client.id, { clientOnboarding: updatedOnboarding }, authReady);
      dispatch(updateClient({ ...client, clientOnboarding: updatedOnboarding }));
      toast({ title: 'Keywords uploaded', description: `${summary.match(/\d+ total/)?.[0] || 'Keywords'} imported from ${file.name}` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setKeywordUploading(false);
      if (keywordFileRef.current) keywordFileRef.current.value = '';
    }
  };

  // Parse keywords from onboarding
  const parsedKeywords = useMemo(
    () => parseKeywordsFromSummary(client.clientOnboarding?.keywordSummary || ''),
    [client.clientOnboarding?.keywordSummary]
  );

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
  const hasNoLFLocations = !locationsLoading && locations.length === 0;

  // Google Places search fallback — used when LF account has no configured locations
  const { data: placesData, isLoading: placesLoading } = useQuery<{ places: LFLocation[] }>({
    queryKey: ['/api/local-falcon/search-place', locationSearch],
    queryFn: async () => {
      const resp = await fetch(`/api/local-falcon/search-place?query=${encodeURIComponent(locationSearch)}`);
      if (!resp.ok) throw new Error('Failed to search places');
      return resp.json();
    },
    enabled: showPicker && hasNoLFLocations && locationSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  // Fetch all scan reports for linked location (fetch more to match keywords)
  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useQuery<{ data: { reports: LFReport[]; count: number } }>({
    queryKey: ['/api/local-falcon/reports', client.localFalconPlaceId],
    queryFn: async () => {
      const resp = await fetch(`/api/local-falcon/reports?placeId=${encodeURIComponent(client.localFalconPlaceId!)}&limit=100`);
      if (!resp.ok) throw new Error('Failed to fetch reports');
      return resp.json();
    },
    enabled: !!client.localFalconPlaceId && isExpanded,
    staleTime: 120_000,
  });

  // Link a location to this client
  const linkMutation = useMutation({
    mutationFn: async (loc: LFLocation) => {
      if (!orgId) throw new Error('No org');
      await updateClientInFirestore(orgId, client.id, {
        localFalconPlaceId: loc.place_id,
        localFalconLocation: { name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng },
      }, authReady);
    },
    onSuccess: (_, loc) => {
      dispatch(updateClient({ ...client, localFalconPlaceId: loc.place_id, localFalconLocation: { name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng } }));
      setShowPicker(false);
      queryClient.invalidateQueries({ queryKey: ['/api/local-falcon/reports', loc.place_id] });
      toast({ title: 'Location linked', description: `${loc.name} linked to this client.` });
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

  // Run a new scan
  const runScanMutation = useMutation({
    mutationFn: async () => {
      const loc = client.localFalconLocation;
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
          radius: scanRadius,
          measurement: 'km',
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

  const filteredLocations = locationSearch
    ? locations.filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()) || l.address.toLowerCase().includes(locationSearch.toLowerCase()))
    : locations;

  // Match each keyword to its latest scan
  const keywordRankings = useMemo(() => {
    return parsedKeywords.map(kw => {
      const matches = reports
        .filter(r => r.keyword.toLowerCase().trim() === kw.keyword.toLowerCase().trim())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = matches[0];
      return {
        ...kw,
        arp: latest ? parseFloat(latest.arp) : null,
        solv: latest ? parseFloat(latest.solv) : null,
        scanDate: latest?.date || null,
        reportUrl: latest?.public_url || null,
        heatmap: latest?.heatmap || latest?.image || null,
      };
    });
  }, [parsedKeywords, reports]);

  // Overall metrics from most recent scan
  const latestReport = reports[0];
  const latestArp = latestReport ? parseFloat(latestReport.arp) : null;
  const latestSolv = latestReport ? parseFloat(latestReport.solv) : null;

  // Keywords needing action (for priority actions section)
  const actionKeywords = keywordRankings.filter(k => k.arp === null || k.arp > 3).slice(0, 5);
  const inThreePack = keywordRankings.filter(k => k.arp !== null && k.arp <= 3).length;
  const scannedCount = keywordRankings.filter(k => k.arp !== null).length;

  const displayKeywords = showAllKeywords ? keywordRankings : keywordRankings.slice(0, 8);

  return (
    <div className="border rounded-lg overflow-hidden mb-3" data-testid="local-gbp-section">
      {/* ── Section header ── */}
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(p => !p)}
        data-testid="toggle-local-presence"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-medium">Local GBP Rankings</p>
          {parsedKeywords.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{parsedKeywords.length} keywords</Badge>
          )}
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

          {/* ── Location picker ── */}
          {showPicker && (
            <div className="p-3 border-b bg-muted/10 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">
                  {hasNoLFLocations ? 'Search business by name' : 'Select tracked location'}
                </p>
                <button onClick={() => { setShowPicker(false); setLocationSearch(''); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder={hasNoLFLocations ? 'Type business name to search…' : 'Search locations…'}
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                className="h-8 text-xs"
                data-testid="input-location-search"
                autoFocus
              />

              {/* LF has locations → filter and show them */}
              {!hasNoLFLocations && (
                locationsLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : filteredLocations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No locations match your search</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {filteredLocations.map(loc => (
                      <button key={loc.id} className="w-full text-left p-2 rounded border hover:bg-muted/30 transition-colors" onClick={() => linkMutation.mutate(loc)} disabled={linkMutation.isPending} data-testid={`location-option-${loc.id}`}>
                        <p className="text-xs font-medium">{loc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{loc.address}</p>
                        {(loc.rating && loc.rating !== '0.000') && <p className="text-[11px] text-amber-600">★ {parseFloat(loc.rating).toFixed(1)} · {loc.reviews} reviews</p>}
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* LF has no locations → Google Places search mode */}
              {hasNoLFLocations && (
                locationSearch.trim().length < 2 ? (
                  <div className="py-2 space-y-2">
                    <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                      Type the client's business name above to search, then select a result to link it.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/local-falcon/locations'] })}
                        className="inline-flex items-center gap-1.5 text-[11px] border rounded px-3 py-1.5 hover:bg-muted/30 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" /> Refresh
                      </button>
                    </div>
                  </div>
                ) : placesLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : (placesData?.places || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No businesses found — try a different name</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    <p className="text-[11px] text-muted-foreground px-1">Google search results — select to link:</p>
                    {(placesData?.places || []).map(loc => (
                      <button key={loc.id} className="w-full text-left p-2 rounded border hover:bg-muted/30 transition-colors" onClick={() => linkMutation.mutate(loc)} disabled={linkMutation.isPending} data-testid={`place-option-${loc.id}`}>
                        <p className="text-xs font-medium">{loc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{loc.address}</p>
                        {loc.rating && loc.rating !== '0' && <p className="text-[11px] text-amber-600">★ {parseFloat(loc.rating).toFixed(1)} · {loc.reviews} reviews</p>}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* ── Not linked state ── */}
          {!hasLinked && !showPicker && (
            <div className="p-4 text-center space-y-2.5">
              <div className="mx-auto w-10 h-10 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No location linked</p>
                <p className="text-xs text-muted-foreground mt-0.5">Link a location to track keyword rankings in the 3-pack</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowPicker(true)} data-testid="btn-link-location">
                <Link2 className="h-3.5 w-3.5" /> Link Location
              </Button>
            </div>
          )}

          {/* ── Linked location: main content ── */}
          {hasLinked && !showPicker && (
            <>
              {/* Location bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3 w-3 text-violet-500 shrink-0" />
                  <p className="text-xs font-medium truncate">{client.localFalconLocation?.name || 'Linked Location'}</p>
                  {client.localFalconLocation?.address && (
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">· {client.localFalconLocation.address}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button onClick={() => setShowPicker(true)} className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50" data-testid="btn-change-location">Change</button>
                  <button onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending} className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/50" data-testid="btn-unlink-location">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Overall metrics row */}
              {reportsLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {latestReport && (
                    <div className="grid grid-cols-4 divide-x border-b">
                      {[
                        { label: 'Avg Rank', value: latestArp !== null ? latestArp.toFixed(1) : '—', color: arpColor(latestArp) },
                        { label: 'SoLV', value: latestSolv !== null ? `${latestSolv.toFixed(0)}%` : '—', color: 'text-violet-600 dark:text-violet-400' },
                        { label: 'In 3-Pack', value: `${inThreePack}/${parsedKeywords.length || '—'}`, color: inThreePack > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground' },
                        { label: 'Scanned', value: parsedKeywords.length ? `${scannedCount}/${parsedKeywords.length}` : reports.length.toString(), color: 'text-foreground' },
                      ].map(m => (
                        <div key={m.label} className="py-2 px-2 text-center">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{m.label}</p>
                          <p className={`text-base font-bold leading-none ${m.color}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Keyword Rankings Table ── */}
                  {parsedKeywords.length > 0 ? (
                    <div>
                      {/* Table header */}
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Keyword Rankings</p>
                        <div className="flex items-center gap-1">
                          <input
                            ref={keywordFileRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleKeywordFileUpload(f); }}
                            data-testid="input-keyword-file-replace"
                          />
                          <button
                            onClick={() => keywordFileRef.current?.click()}
                            disabled={keywordUploading}
                            className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50 flex items-center gap-1"
                            data-testid="btn-replace-keywords"
                            title="Replace keywords from file"
                          >
                            {keywordUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          </button>
                          <button onClick={() => refetchReports()} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50" data-testid="btn-refresh-reports">
                            <RefreshCw className="h-3 w-3" />
                          </button>
                          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => { setShowRunScan(v => !v); setScanKeyword(''); }} data-testid="btn-show-run-scan">
                            <Radio className="h-3 w-3" /> New Scan
                          </Button>
                        </div>
                      </div>

                      {/* Scan form */}
                      {showRunScan && (
                        <div className="p-3 bg-muted/10 border-b space-y-2">
                          <Input placeholder="Keyword (e.g. plumber brisbane)" value={scanKeyword} onChange={e => setScanKeyword(e.target.value)} className="h-8 text-xs" data-testid="input-scan-keyword" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Grid Size</p>
                              <select value={scanGridSize} onChange={e => setScanGridSize(e.target.value)} className="w-full h-8 text-xs rounded border bg-background px-2" data-testid="select-grid-size">
                                {GRID_SIZES.map(s => <option key={s} value={s}>{s}×{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Radius (km)</p>
                              <select value={scanRadius} onChange={e => setScanRadius(e.target.value)} className="w-full h-8 text-xs rounded border bg-background px-2" data-testid="select-scan-radius">
                                {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 h-8 gap-1.5" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending || !scanKeyword.trim()} data-testid="btn-run-scan">
                              {runScanMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</> : <><Radio className="h-3.5 w-3.5" /> Run Scan</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowRunScan(false); setScanKeyword(''); }} disabled={runScanMutation.isPending}>Cancel</Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Larger grids & radii use more scan credits.</p>
                        </div>
                      )}

                      {/* Keyword rows */}
                      <div className="divide-y">
                        {displayKeywords.map((kw, i) => {
                          const status = threePackStatus(kw.arp);
                          return (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors group">
                              {/* ARP badge */}
                              <span className={`inline-flex items-center justify-center h-6 w-7 rounded text-[11px] font-bold shrink-0 ${kw.arp !== null ? arpBg(kw.arp) : 'bg-muted/60 text-muted-foreground'}`}>
                                {kw.arp !== null ? (kw.arp <= 20 ? `#${kw.arp.toFixed(0)}` : '20+') : '—'}
                              </span>
                              {/* Keyword info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{kw.keyword}</p>
                                <div className="flex items-center gap-2">
                                  <span className={`flex items-center gap-1 text-[11px] ${status.color}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${status.dot}`} />
                                    {status.label}
                                  </span>
                                  {kw.volume && <span className="text-[11px] text-muted-foreground">{kw.volume >= 1000 ? `${(kw.volume / 1000).toFixed(1)}K` : kw.volume} vol</span>}
                                  {kw.scanDate && <span className="text-[11px] text-muted-foreground hidden group-hover:inline">{kw.scanDate}</span>}
                                </div>
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                {kw.reportUrl && (
                                  <a href={kw.reportUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50" title="View heatmap report">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                <button
                                  onClick={() => { setScanKeyword(kw.keyword); setShowRunScan(true); }}
                                  className="text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 p-1 rounded hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title={`Scan for "${kw.keyword}"`}
                                  data-testid={`btn-scan-keyword-${i}`}
                                >
                                  <ScanSearch className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Show more / Show less */}
                      {keywordRankings.length > 8 && (
                        <button onClick={() => setShowAllKeywords(v => !v)} className="w-full text-center py-2 text-[11px] text-muted-foreground hover:text-foreground border-t hover:bg-muted/20 transition-colors">
                          {showAllKeywords ? `Show less` : `Show all ${keywordRankings.length} keywords`}
                        </button>
                      )}

                      {/* Scan history for scanned-but-not-in-keyword-list */}
                      {scannedCount === 0 && reports.length > 0 && (
                        <div className="px-3 py-2 border-t">
                          <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">Scan History</p>
                          <div className="space-y-1">
                            {reports.slice(0, 5).map(r => {
                              const arp = parseFloat(r.arp);
                              return (
                                <div key={r.id} className="flex items-center gap-2 py-1 text-[11px]">
                                  <span className={`inline-flex items-center justify-center h-5 w-6 rounded text-[10px] font-bold shrink-0 ${arpBg(arp)}`}>{isNaN(arp) ? '?' : arp.toFixed(0)}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate font-medium">{r.keyword}</p>
                                    <p className="text-muted-foreground">{r.date} · {parseFloat(r.solv).toFixed(0)}% SoLV</p>
                                  </div>
                                  {r.public_url && <a href={r.public_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* No scans yet */}
                      {reports.length === 0 && (
                        <div className="px-3 py-4 text-center">
                          <p className="text-xs text-muted-foreground">No scans yet — run your first scan to see local rankings</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No keywords uploaded yet */
                    <div className="p-4 space-y-3">
                      <div className="text-center space-y-3">
                        <div className="mx-auto w-10 h-10 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-violet-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">No keywords uploaded yet</p>
                          <p className="text-[11px] text-muted-foreground">Upload your Ahrefs or keyword export to track rankings for your target keywords.</p>
                        </div>
                        <input
                          ref={keywordFileRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleKeywordFileUpload(f); }}
                          data-testid="input-keyword-file"
                        />
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => keywordFileRef.current?.click()}
                          disabled={keywordUploading}
                          data-testid="btn-upload-keywords"
                        >
                          {keywordUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {keywordUploading ? 'Importing…' : 'Upload Keyword File'}
                        </Button>
                        <p className="text-[10px] text-muted-foreground">Ahrefs, Google Keyword Planner, or any .csv / .xlsx export</p>
                      </div>
                      {/* Still show scan history + run scan if available */}
                      {reports.length > 0 && (
                        <div className="space-y-1 border-t pt-3">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Scan History</p>
                          {reports.slice(0, 5).map(r => {
                            const arp = parseFloat(r.arp);
                            return (
                              <div key={r.id} className="flex items-center gap-2 py-1 text-[11px]">
                                <span className={`inline-flex items-center justify-center h-5 w-6 rounded text-[10px] font-bold shrink-0 ${arpBg(arp)}`}>{isNaN(arp) ? '?' : arp.toFixed(0)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate font-medium">{r.keyword}</p>
                                  <p className="text-muted-foreground">{r.date} · {parseFloat(r.solv).toFixed(0)}% SoLV</p>
                                </div>
                                {r.public_url && <a href={r.public_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <Button size="sm" variant="outline" className="w-full gap-1.5 h-8" onClick={() => setShowRunScan(v => !v)} data-testid="btn-show-run-scan">
                        <Radio className="h-3.5 w-3.5" /> Run a Scan
                      </Button>
                      {showRunScan && (
                        <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                          <Input placeholder="Keyword (e.g. plumber near me)" value={scanKeyword} onChange={e => setScanKeyword(e.target.value)} className="h-8 text-xs" data-testid="input-scan-keyword" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Grid Size</p>
                              <select value={scanGridSize} onChange={e => setScanGridSize(e.target.value)} className="w-full h-8 text-xs rounded border bg-background px-2" data-testid="select-grid-size">
                                {GRID_SIZES.map(s => <option key={s} value={s}>{s}×{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Radius (km)</p>
                              <select value={scanRadius} onChange={e => setScanRadius(e.target.value)} className="w-full h-8 text-xs rounded border bg-background px-2" data-testid="select-scan-radius">
                                {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 h-8 gap-1.5" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending || !scanKeyword.trim()} data-testid="btn-run-scan">
                              {runScanMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</> : <><Radio className="h-3.5 w-3.5" /> Run Scan</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowRunScan(false); setScanKeyword(''); }} disabled={runScanMutation.isPending}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Priority 3-Pack Actions ── */}
                  {actionKeywords.length > 0 && parsedKeywords.length > 0 && (
                    <div className="border-t px-3 py-2.5 bg-amber-50/50 dark:bg-amber-950/10">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> 3-Pack Action Plan
                      </p>
                      <div className="space-y-1.5">
                        {actionKeywords.map((kw, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 font-bold text-[10px]">{i + 1}</span>
                            <p className="text-muted-foreground flex-1 min-w-0 truncate">{threePackAction(kw.keyword, kw.arp)}</p>
                            <button
                              onClick={() => { setScanKeyword(kw.keyword); setShowRunScan(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded transition-colors"
                              data-testid={`btn-action-scan-${i}`}
                            >
                              <ScanSearch className="h-2.5 w-2.5" /> Scan
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
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

  const avgStars = reviewsData ? STAR_MAP[reviewsData.averageRating] ?? 0 : 0;

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
                      <StarRating rating={reviewsData.averageRating} />
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
                              <div className="flex gap-1.5">
                                <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => replyMutation.mutate({ reviewName: review.name, reply: replyText })} disabled={!replyText.trim() || replyMutation.isPending}>
                                  {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post Reply'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => { setReplyingTo(null); setReplyText(''); }}>Cancel</Button>
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
