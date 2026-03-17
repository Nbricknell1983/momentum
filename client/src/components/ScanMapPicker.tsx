import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Check, Loader2, Search, Lasso } from 'lucide-react';

export interface MapPickerResult {
  lat: number;
  lng: number;
  name: string;
  suburbs: string[];
}

interface SuburbFeature {
  key: string;
  name: string;
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  centroid: [number, number]; // [lng, lat]
}

interface ScanMapPickerProps {
  defaultLat: number;
  defaultLng: number;
  gridSize: string;
  areaChips: string[];
  initialArea?: string;
  onConfirm: (result: MapPickerResult) => void;
  onClose: () => void;
}

// ── Nominatim via server proxy ────────────────────────────────────────────────

async function searchSuburb(query: string): Promise<SuburbFeature | null> {
  if (!query.trim()) return null;
  try {
    const url = `/api/nominatim/search?q=${encodeURIComponent(query.trim())}&polygon_geojson=1&limit=10&addressdetails=1`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (!Array.isArray(data) || !data.length) return null;
    const TYPES = ['suburb', 'locality', 'town', 'village', 'hamlet', 'quarter', 'neighbourhood', 'residential', 'city', 'administrative'];
    const best =
      data.find(f => TYPES.includes(f.type) && (f.geojson?.type === 'Polygon' || f.geojson?.type === 'MultiPolygon')) ||
      data.find(f => f.geojson?.type === 'Polygon' || f.geojson?.type === 'MultiPolygon') ||
      null;
    if (!best) return null;
    const name = best.display_name.split(',')[0].trim();
    return {
      key: name.toLowerCase(),
      name,
      geojson: { type: 'Feature', properties: { name }, geometry: best.geojson },
      centroid: [parseFloat(best.lon), parseFloat(best.lat)],
    };
  } catch (e) {
    console.error('[ScanMap] searchSuburb error:', e);
    return null;
  }
}

async function reverseToSuburb(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`/api/nominatim/reverse?lat=${lat}&lon=${lng}&zoom=13`);
    if (!r.ok) return '';
    const d = await r.json();
    return d.address?.suburb || d.address?.neighbourhood || d.address?.town || d.address?.village || d.address?.city_district || '';
  } catch { return ''; }
}

function computeCentroid(suburbs: SuburbFeature[]): [number, number] {
  if (!suburbs.length) return [0, 0];
  return [
    suburbs.reduce((a, s) => a + s.centroid[0], 0) / suburbs.length,
    suburbs.reduce((a, s) => a + s.centroid[1], 0) / suburbs.length,
  ];
}

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function sampleGrid(lasso: [number, number][], n = 8): [number, number][] {
  const xs = lasso.map(p => p[0]), ys = lasso.map(p => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pts: [number, number][] = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
    const px = minX + (c / n) * (maxX - minX);
    const py = minY + (r / n) * (maxY - minY);
    if (pointInPolygon(px, py, lasso)) pts.push([px, py]);
  }
  return pts.length ? pts : [[(minX + maxX) / 2, (minY + maxY) / 2]];
}

const FILL: L.PathOptions = { color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.28, weight: 2.5, interactive: false };

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanMapPicker({ defaultLat, defaultLng, areaChips, initialArea, onConfirm, onClose }: ScanMapPickerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef  = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<L.Map | null>(null);
  const geoRef    = useRef<L.GeoJSON | null>(null);

  const selectedRef  = useRef<SuburbFeature[]>([]);
  const loadingRef   = useRef(false);
  const drawingRef   = useRef(false);
  const pathRef      = useRef<[number, number][]>([]);
  const rafRef       = useRef(0);

  const [selected,  setStateSelected] = useState<SuburbFeature[]>([]);
  const [busy,      setBusy]          = useState(false);
  const [status,    setStatus]        = useState('');
  const [drawMode,  setDrawMode]      = useState(false);
  const [search,    setSearch]        = useState('');
  const [searching, setSearching]     = useState(false);

  // Sync selected to ref
  const setSelected = useCallback((next: SuburbFeature[]) => {
    selectedRef.current = next;
    setStateSelected(next);
  }, []);

  // ── GeoJSON layer refresh ──────────────────────────────────────────────────
  const redraw = useCallback((suburbs: SuburbFeature[]) => {
    const geo = geoRef.current;
    if (!geo) return;
    geo.clearLayers();
    suburbs.forEach(s => {
      const lyr = L.geoJSON(s.geojson as any, { style: () => FILL });
      lyr.addTo(geo!);
      lyr.bindTooltip(s.name, { permanent: true, direction: 'center', className: 'slbl' });
    });
  }, []);

  // ── add/remove suburb ─────────────────────────────────────────────────────
  const addSuburb = useCallback(async (query: string) => {
    if (loadingRef.current) return;
    const cur = selectedRef.current;
    const key = query.toLowerCase().trim();
    if (cur.find(s => s.key === key || key.startsWith(s.key) || s.key.startsWith(key))) {
      // already present — skip silently
      return;
    }
    loadingRef.current = true;
    setBusy(true);
    setStatus(`Searching for ${query}…`);
    const f = await searchSuburb(query);
    if (f) {
      const next = [...selectedRef.current.filter(s => s.key !== f.key), f];
      setSelected(next);
      redraw(next);
      setStatus('');
    } else {
      setStatus(`"${query}" not found`);
      setTimeout(() => setStatus(''), 3000);
    }
    loadingRef.current = false;
    setBusy(false);
  }, [setSelected, redraw]);

  const removeSuburb = useCallback((s: SuburbFeature) => {
    const next = selectedRef.current.filter(x => x !== s);
    setSelected(next);
    redraw(next);
  }, [setSelected, redraw]);

  const toggleSuburb = useCallback(async (query: string) => {
    const key = query.toLowerCase().trim();
    const cur = selectedRef.current;
    const existing = cur.find(s => s.key === key || key.startsWith(s.key) || s.key.startsWith(key));
    if (existing) { removeSuburb(existing); return; }
    await addSuburb(query);
  }, [addSuburb, removeSuburb]);

  // ── search box submit ──────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    await addSuburb(search.trim());
    setSearch('');
    setSearching(false);
  }, [search, addSuburb]);

  // ── lasso ──────────────────────────────────────────────────────────────────
  const processLasso = useCallback(async (path: [number, number][]) => {
    const map = mapRef.current;
    if (!map || path.length < 8) return;
    loadingRef.current = true;
    setBusy(true);
    setStatus('Scanning…');
    try {
      const pts = sampleGrid(path, 8);
      const names: string[] = [];
      const B = 4;
      for (let i = 0; i < pts.length; i += B) {
        await Promise.all(pts.slice(i, i + B).map(async ([px, py]) => {
          const ll = map.containerPointToLatLng(L.point(px, py));
          const name = await reverseToSuburb(ll.lat, ll.lng);
          if (name && !names.includes(name)) names.push(name);
        }));
        setStatus(`Scanning… ${Math.min(i + B, pts.length)}/${pts.length}`);
        if (i + B < pts.length) await new Promise(r => setTimeout(r, 200));
      }
      if (!names.length) { setStatus('No suburbs found — try a larger area'); setTimeout(() => setStatus(''), 3000); return; }

      const fetched: SuburbFeature[] = [];
      for (const name of names) {
        const f = await searchSuburb(name);
        if (f && !fetched.find(e => e.key === f.key)) fetched.push(f);
        setStatus(`Fetching boundaries… ${fetched.length}/${names.length}`);
        await new Promise(r => setTimeout(r, 300));
      }
      if (!fetched.length) return;
      const existing = selectedRef.current;
      const next = [...existing, ...fetched.filter(f => !existing.find(e => e.key === f.key))];
      setSelected(next);
      redraw(next);
      setStatus('');
    } finally {
      setBusy(false);
      loadingRef.current = false;
    }
  }, [setSelected, redraw]);

  // ── canvas ─────────────────────────────────────────────────────────────────
  const paintLasso = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const p = pathRef.current;
    if (!p.length) return;
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(79,70,229,0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(79,70,229,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]); ctx.stroke();
  }, []);

  const syncCanvas = useCallback(() => {
    const c = canvasRef.current, o = outerRef.current;
    if (!c || !o) return;
    const r = o.getBoundingClientRect();
    c.width = r.width; c.height = r.height;
  }, []);

  // ── Leaflet init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { center: [defaultLat, defaultLng], zoom: 12 });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const geo = L.geoJSON(undefined as any, { style: () => FILL }).addTo(map);
    geoRef.current = geo;

    // Fix size after flex layout paints
    setTimeout(() => map.invalidateSize(), 150);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapDivRef.current!);

    // Map click → reverse geocode → add suburb
    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (drawingRef.current) return;
      setStatus('Looking up suburb…');
      const name = await reverseToSuburb(e.latlng.lat, e.latlng.lng);
      if (name) {
        await addSuburb(name); // will set status itself
      } else {
        setStatus('No suburb found here — try the search box above');
        setTimeout(() => setStatus(''), 3000);
      }
    });

    // Load initial area
    if (initialArea?.trim()) {
      searchSuburb(initialArea).then(f => {
        if (!f) return;
        const next = [f];
        selectedRef.current = next; setStateSelected(next);
        geo.clearLayers();
        L.geoJSON(f.geojson as any, { style: () => FILL }).addTo(geo);
        map.flyTo([f.centroid[1], f.centroid[0]], 13);
      });
    }

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; geoRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose addSuburb to map click via ref so it always has fresh closure
  const addSuburbRef = useRef(addSuburb);
  useEffect(() => { addSuburbRef.current = addSuburb; }, [addSuburb]);

  // ── canvas events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onDown = (e: MouseEvent) => {
      if (!drawMode) return;
      e.preventDefault(); drawingRef.current = true;
      const r = c.getBoundingClientRect();
      pathRef.current = [[e.clientX - r.left, e.clientY - r.top]];
    };
    const onMove = (e: MouseEvent) => {
      if (!drawingRef.current) return;
      const r = c.getBoundingClientRect();
      pathRef.current.push([e.clientX - r.left, e.clientY - r.top]);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(paintLasso);
    };
    const onUp = async () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const p = [...pathRef.current]; pathRef.current = [];
      const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      await processLasso(p);
    };
    c.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { c.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drawMode, paintLasso, processLasso]);

  // Draw mode → disable/enable map interaction
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawMode) { map.dragging.disable(); map.scrollWheelZoom.disable(); map.doubleClickZoom.disable(); }
    else { map.dragging.enable(); map.scrollWheelZoom.enable(); map.doubleClickZoom.enable(); }
  }, [drawMode]);

  useEffect(() => { syncCanvas(); window.addEventListener('resize', syncCanvas); return () => window.removeEventListener('resize', syncCanvas); }, [syncCanvas]);

  const handleConfirm = () => {
    if (!selected.length) return;
    const [lng, lat] = computeCentroid(selected);
    onConfirm({ lat, lng, name: selected.map(s => s.name).join(', '), suburbs: selected.map(s => s.name) });
  };

  const chipsActive = useMemo(() => new Set(areaChips.filter(c => selected.some(s => s.key === c.toLowerCase() || c.toLowerCase().startsWith(s.key) || s.key.startsWith(c.toLowerCase())))), [areaChips, selected]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl flex flex-col" style={{ width: 'min(95vw, 1800px)', height: 'min(95vh, 1200px)', overflow: 'hidden' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Select Scan Suburbs</p>
            <p className="text-[11px] text-muted-foreground">
              Search for a suburb below, click quick-add chips, or click the map. Use Draw Mode to lasso an area.
            </p>
          </div>
          <button
            onClick={() => setDrawMode(d => !d)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium shrink-0 transition-colors ${drawMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
            data-testid="btn-draw-mode-toggle"
          >
            <Lasso className="h-3.5 w-3.5" />
            {drawMode ? 'Draw Mode (on)' : 'Draw Mode'}
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted shrink-0" data-testid="btn-close-map-picker">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + chips row */}
        <div className="px-4 py-2 border-b shrink-0 space-y-2 bg-muted/10">
          {/* Search box */}
          <div className="flex gap-2">
            <Input
              placeholder="Type a suburb name… e.g. Wynnum"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="h-8 text-sm flex-1"
              disabled={busy}
              data-testid="input-suburb-search"
            />
            <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={handleSearch} disabled={busy || !search.trim()} data-testid="btn-suburb-search">
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
          {/* Quick-add chips */}
          {areaChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted-foreground self-center mr-1 shrink-0">Quick add:</span>
              {areaChips.map(chip => (
                <button key={chip} onClick={() => toggleSuburb(chip)} disabled={busy}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${chipsActive.has(chip) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border'}`}
                  data-testid={`chip-map-area-${chip}`}>
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div ref={outerRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: drawMode ? 'auto' : 'none', cursor: drawMode ? 'crosshair' : 'default' }} />

          {(busy || status) && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}
              className="bg-background/95 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md whitespace-nowrap">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {status}
            </div>
          )}
          {drawMode && !busy && (
            <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 20 }}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium shadow flex items-center gap-1.5 select-none">
              <Lasso className="h-3.5 w-3.5" /> Click &amp; drag to circle suburbs
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 22, left: 12, zIndex: 10 }}
            className="bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow">
            <span className="font-semibold text-primary">Service Areas</span>{' · '}<span>{selected.length} selected</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center gap-3 shrink-0 bg-muted/10">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap overflow-hidden">
            {selected.length === 0
              ? <p className="text-xs text-muted-foreground italic">Search for suburbs above or click the map</p>
              : selected.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 shrink-0">
                  {s.name}
                  <button onClick={() => removeSuburb(s)} className="hover:text-destructive ml-0.5"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))
            }
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">Cancel</Button>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={handleConfirm} disabled={busy || !selected.length} data-testid="btn-confirm-map-area">
            <Check className="h-3.5 w-3.5" /> Use These Areas ({selected.length})
          </Button>
        </div>
      </div>

      <style>{`.slbl { background:rgba(255,255,255,.9)!important; border:1px solid rgba(79,70,229,.3)!important; box-shadow:none!important; font-size:11px!important; font-weight:600!important; color:#1e1b4b!important; padding:1px 5px!important; border-radius:3px!important; white-space:nowrap!important; }`}</style>
    </div>
  );
}
