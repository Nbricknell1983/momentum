import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { X, Check, Loader2, MousePointer2, Lasso } from 'lucide-react';

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

// ── Nominatim helpers ─────────────────────────────────────────────────────────

async function nominatimReverse(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=13&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!r.ok) return '';
    const d = await r.json();
    return (
      d.address?.suburb ||
      d.address?.neighbourhood ||
      d.address?.town ||
      d.address?.city_district ||
      d.address?.village ||
      ''
    );
  } catch { return ''; }
}

async function fetchSuburbPolygon(query: string): Promise<SuburbFeature | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Australia')}&polygon_geojson=1&format=json&limit=8&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (!data.length) return null;
    const SUBURB_TYPES = ['suburb', 'locality', 'town', 'village', 'hamlet', 'quarter', 'neighbourhood', 'residential', 'city'];
    const best =
      data.find(f => SUBURB_TYPES.includes(f.type) && (f.geojson?.type === 'Polygon' || f.geojson?.type === 'MultiPolygon')) ||
      data.find(f => f.geojson?.type === 'Polygon' || f.geojson?.type === 'MultiPolygon') ||
      null;
    if (!best?.geojson) return null;
    const name = best.display_name.split(',')[0].trim();
    return {
      key: name.toLowerCase(),
      name,
      geojson: { type: 'Feature', properties: { name }, geometry: best.geojson },
      centroid: [parseFloat(best.lon), parseFloat(best.lat)],
    };
  } catch { return null; }
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

function samplePointsInLasso(lasso: [number, number][], gridN = 10): [number, number][] {
  if (!lasso.length) return [];
  const xs = lasso.map(p => p[0]), ys = lasso.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pts: [number, number][] = [];
  for (let r = 0; r <= gridN; r++) {
    for (let c = 0; c <= gridN; c++) {
      const px = minX + (c / gridN) * (maxX - minX);
      const py = minY + (r / gridN) * (maxY - minY);
      if (pointInPolygon(px, py, lasso)) pts.push([px, py]);
    }
  }
  if (!pts.length) pts.push([(minX + maxX) / 2, (minY + maxY) / 2]);
  return pts;
}

const POLY_STYLE: L.PathOptions = { color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.28, weight: 2.5 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanMapPicker({
  defaultLat, defaultLng, areaChips, initialArea, onConfirm, onClose,
}: ScanMapPickerProps) {
  const mapDivRef  = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const outerRef   = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<L.Map | null>(null);
  const layerRef   = useRef<L.GeoJSON | null>(null);

  const selectedRef   = useRef<SuburbFeature[]>([]);
  const loadingRef    = useRef(false);
  const drawModeRef   = useRef(false);
  const isDrawingRef  = useRef(false);
  const lassoPathRef  = useRef<[number, number][]>([]);
  const rafRef        = useRef(0);

  const [selected,   setSelectedState] = useState<SuburbFeature[]>([]);
  const [loading,    setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg]    = useState('');
  const [drawMode,   setDrawMode]      = useState(false);
  const [clickHint,  setClickHint]     = useState('');

  // ── helpers ────────────────────────────────────────────────────────────────

  const setSelected = useCallback((next: SuburbFeature[]) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  const refreshLayer = useCallback((suburbs: SuburbFeature[]) => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    suburbs.forEach(s => {
      const l = L.geoJSON(s.geojson as any, { style: () => POLY_STYLE });
      l.bindTooltip(s.name, { permanent: true, direction: 'center', className: 'suburb-lbl' });
      l.addTo(layer);
    });
  }, []);

  // ── click to toggle ────────────────────────────────────────────────────────

  const toggleSuburb = useCallback(async (query: string) => {
    if (loadingRef.current) return;
    const current = selectedRef.current;
    const qLower  = query.toLowerCase();
    const existing = current.find(
      s => s.key === qLower || s.key.startsWith(qLower) || qLower.startsWith(s.key)
    );
    if (existing) {
      const next = current.filter(s => s !== existing);
      setSelected(next);
      refreshLayer(next);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setLoadingMsg(`Loading ${query}…`);
    const f = await fetchSuburbPolygon(query);
    if (f) {
      const next = [...selectedRef.current, f];
      setSelected(next);
      refreshLayer(next);
    } else {
      setClickHint(`No polygon found for "${query}"`);
      setTimeout(() => setClickHint(''), 3000);
    }
    loadingRef.current = false;
    setLoading(false);
    setLoadingMsg('');
  }, [setSelected, refreshLayer]);

  const toggleRef = useRef(toggleSuburb);
  useEffect(() => { toggleRef.current = toggleSuburb; }, [toggleSuburb]);

  // ── lasso ──────────────────────────────────────────────────────────────────

  const processLasso = useCallback(async (path: [number, number][]) => {
    const map = mapRef.current;
    if (!map || path.length < 8) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadingMsg('Scanning selection…');
    try {
      const samplePixels = samplePointsInLasso(path, 10);

      // Convert canvas-local pixel → lat/lng using Leaflet
      const lngLats = samplePixels.map(([px, py]) => {
        const ll = map.containerPointToLatLng(L.point(px, py));
        return { lat: ll.lat, lng: ll.lng };
      });

      // Reverse geocode in batches of 6 (Nominatim rate limit)
      const names: string[] = [];
      const RBATCH = 6;
      for (let i = 0; i < lngLats.length; i += RBATCH) {
        await Promise.all(lngLats.slice(i, i + RBATCH).map(async ({ lat, lng }) => {
          const name = await nominatimReverse(lat, lng);
          if (name && !names.includes(name)) names.push(name);
        }));
        setLoadingMsg(`Scanning… ${Math.min(i + RBATCH, lngLats.length)}/${lngLats.length} pts`);
        if (i + RBATCH < lngLats.length) await new Promise(r => setTimeout(r, 120));
      }

      if (!names.length) {
        setClickHint('No suburbs detected — try drawing a larger area');
        setTimeout(() => setClickHint(''), 4000);
        return;
      }

      // Fetch polygons — collect all first, then single atomic update
      const fetched: SuburbFeature[] = [];
      const PBATCH = 4;
      for (let i = 0; i < names.length; i += PBATCH) {
        const results = await Promise.all(names.slice(i, i + PBATCH).map(n => fetchSuburbPolygon(n)));
        results.forEach(f => { if (f && !fetched.find(e => e.key === f.key)) fetched.push(f); });
        setLoadingMsg(`Fetching boundaries… ${Math.min(i + PBATCH, names.length)}/${names.length}`);
        if (i + PBATCH < names.length) await new Promise(r => setTimeout(r, 150));
      }

      if (!fetched.length) return;
      const existing = selectedRef.current;
      const next = [...existing, ...fetched.filter(f => !existing.find(e => e.key === f.key))];
      setSelected(next);
      refreshLayer(next);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setLoadingMsg('');
    }
  }, [setSelected, refreshLayer]);

  // ── canvas draw ────────────────────────────────────────────────────────────

  const paintCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const path = lassoPathRef.current;
    if (!path.length) return;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.closePath();
    ctx.fillStyle   = 'rgba(79,70,229,0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(79,70,229,0.9)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
  }, []);

  const syncCanvasSize = useCallback(() => {
    const c = canvasRef.current, o = outerRef.current;
    if (!c || !o) return;
    const r = o.getBoundingClientRect();
    if (c.width !== r.width || c.height !== r.height) {
      c.width  = r.width;
      c.height = r.height;
    }
  }, []);

  // ── Leaflet init ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer as any;

    // Must call invalidateSize after flex layout has painted
    requestAnimationFrame(() => {
      setTimeout(() => map.invalidateSize(), 50);
    });

    // Resize observer keeps map correct when modal resizes
    const ro = new ResizeObserver(() => map.invalidateSize());
    if (mapDivRef.current) ro.observe(mapDivRef.current);

    // Click handler — only fires when not in draw mode
    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current) return;
      setClickHint('Looking up suburb…');
      const name = await nominatimReverse(e.latlng.lat, e.latlng.lng);
      setClickHint('');
      if (name) toggleRef.current(name);
      else {
        setClickHint('No suburb found at that point');
        setTimeout(() => setClickHint(''), 3000);
      }
    });

    // Load initial area
    if (initialArea?.trim()) {
      fetchSuburbPolygon(initialArea).then(f => {
        if (!f) return;
        const next = [f];
        selectedRef.current = next;
        setSelectedState(next);
        // Add directly to layerGroup
        const gl = L.geoJSON(f.geojson as any, { style: () => POLY_STYLE });
        gl.bindTooltip(f.name, { permanent: true, direction: 'center', className: 'suburb-lbl' });
        gl.addTo(layer as any);
        map.flyTo([f.centroid[1], f.centroid[0]], 13);
      });
    }

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current  = null;
      layerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── canvas mouse events ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: MouseEvent) => {
      if (!drawModeRef.current) return;
      e.preventDefault();
      isDrawingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      lassoPathRef.current = [[e.clientX - rect.left, e.clientY - rect.top]];
    };
    const onMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      lassoPathRef.current.push([e.clientX - rect.left, e.clientY - rect.top]);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(paintCanvas);
    };
    const onUp = async () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const path = [...lassoPathRef.current];
      lassoPathRef.current = [];
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      await processLasso(path);
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onUp);
    };
  }, [paintCanvas, processLasso]);

  // ── draw mode → disable/enable Leaflet interaction ─────────────────────────

  useEffect(() => {
    drawModeRef.current = drawMode;
    const map = mapRef.current;
    if (!map) return;
    if (drawMode) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
    }
  }, [drawMode]);

  // ── canvas resize ──────────────────────────────────────────────────────────

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // ── helpers ────────────────────────────────────────────────────────────────

  const isChipActive = (chip: string) => {
    const cl = chip.toLowerCase();
    return selected.some(s => s.key === cl || s.key.startsWith(cl) || cl.startsWith(s.key));
  };

  const removeSuburb = (s: SuburbFeature) => {
    const next = selected.filter(x => x !== s);
    setSelected(next);
    refreshLayer(next);
  };

  const handleConfirm = () => {
    if (!selected.length) return;
    const [lng, lat] = computeCentroid(selected);
    onConfirm({ lat, lng, name: selected.map(s => s.name).join(', '), suburbs: selected.map(s => s.name) });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-background rounded-xl shadow-2xl flex flex-col"
        style={{ width: 'min(95vw, 1800px)', height: 'min(95vh, 1200px)', overflow: 'hidden' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <p className="text-sm font-semibold">Select Scan Suburbs</p>
            <p className="text-[11px] text-muted-foreground">
              {drawMode
                ? 'Draw mode — click and drag over suburbs then release to auto-select.'
                : 'Click anywhere on the map to add a suburb, or use Draw Mode to lasso an area.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawMode(d => !d)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors select-none ${
                drawMode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              }`}
              data-testid="btn-draw-mode-toggle"
            >
              {drawMode ? <Lasso className="h-3.5 w-3.5" /> : <MousePointer2 className="h-3.5 w-3.5" />}
              {drawMode ? 'Draw Mode (on)' : 'Draw Mode'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" data-testid="btn-close-map-picker">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Quick-add chips ── */}
        {areaChips.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5 shrink-0 bg-muted/20">
            <span className="text-[10px] text-muted-foreground self-center mr-1 shrink-0">Quick add:</span>
            {areaChips.map(chip => (
              <button
                key={chip}
                onClick={() => toggleSuburb(chip)}
                disabled={loading}
                className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                  isChipActive(chip)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border'
                }`}
                data-testid={`chip-map-area-${chip}`}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* ── Map area ── */}
        <div
          ref={outerRef}
          style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          {/* Leaflet renders here — no React children */}
          <div ref={mapDivRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

          {/* Lasso canvas — on top of map */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute', inset: 0, zIndex: 10,
              pointerEvents: drawMode ? 'auto' : 'none',
              cursor: drawMode ? 'crosshair' : 'default',
            }}
          />

          {/* Status overlays */}
          {(loading || clickHint) && (
            <div
              style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}
              className="bg-background/95 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md whitespace-nowrap"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {loading ? (loadingMsg || 'Loading…') : clickHint}
            </div>
          )}

          {drawMode && !loading && (
            <div
              style={{ position: 'absolute', top: 12, left: 12, zIndex: 20 }}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium shadow flex items-center gap-1.5 select-none"
            >
              <Lasso className="h-3.5 w-3.5" />
              Click &amp; drag to circle suburbs
            </div>
          )}

          <div
            style={{ position: 'absolute', bottom: 24, left: 12, zIndex: 10 }}
            className="bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow"
          >
            <span className="font-semibold text-primary">Service Areas</span>
            {' · '}
            <span>{selected.length} selected</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-3 border-t flex items-center gap-3 shrink-0 bg-muted/10">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap overflow-hidden">
            {selected.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {drawMode ? 'Draw a circle on the map to select suburbs' : 'Click the map or use the chips above'}
              </p>
            ) : (
              selected.map(s => (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 shrink-0"
                >
                  {s.name}
                  <button onClick={() => removeSuburb(s)} className="hover:text-destructive ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleConfirm}
            disabled={loading || selected.length === 0}
            data-testid="btn-confirm-map-area"
          >
            <Check className="h-3.5 w-3.5" />
            Use These Areas ({selected.length})
          </Button>
        </div>
      </div>

      <style>{`
        .suburb-lbl {
          background: rgba(255,255,255,0.9) !important;
          border: 1px solid rgba(79,70,229,0.3) !important;
          box-shadow: none !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #1e1b4b !important;
          padding: 1px 5px !important;
          border-radius: 3px !important;
          white-space: nowrap !important;
        }
      `}</style>
    </div>
  );
}
