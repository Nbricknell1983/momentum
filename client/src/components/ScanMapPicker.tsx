import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { X, Check, Loader2, MousePointer2, Lasso } from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

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
  centroid: [number, number];
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

// ── Utilities ─────────────────────────────────────────────────────────────────

async function fetchSuburbPolygon(query: string): Promise<SuburbFeature | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Australia')}&polygon_geojson=1&format=json&limit=5`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return null;
    const SUBURB_TYPES = ['suburb', 'locality', 'town', 'village', 'hamlet', 'quarter', 'neighbourhood', 'residential'];
    const best = data.find((f: any) => SUBURB_TYPES.includes(f.type) && f.geojson)
      || data.find((f: any) => f.geojson)
      || null;
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

async function reverseGeocodeSuburb(lat: number, lng: number): Promise<string> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,neighborhood,place&country=AU&access_token=${token}`
    );
    const d = await r.json();
    return d.features?.[0]?.text || '';
  } catch { return ''; }
}

function computeCentroid(suburbs: SuburbFeature[]): [number, number] {
  if (!suburbs.length) return [0, 0];
  return [
    suburbs.reduce((a, s) => a + s.centroid[0], 0) / suburbs.length,
    suburbs.reduce((a, s) => a + s.centroid[1], 0) / suburbs.length,
  ];
}

function buildFC(suburbs: SuburbFeature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: suburbs.map(s => s.geojson) };
}

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function samplePointsInLasso(lasso: [number, number][], gridSize = 10): [number, number][] {
  if (!lasso.length) return [];
  const xs = lasso.map(p => p[0]), ys = lasso.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pts: [number, number][] = [];
  for (let r = 0; r <= gridSize; r++) {
    for (let c = 0; c <= gridSize; c++) {
      const px = minX + (c / gridSize) * (maxX - minX);
      const py = minY + (r / gridSize) * (maxY - minY);
      if (pointInPolygon(px, py, lasso)) pts.push([px, py]);
    }
  }
  if (!pts.length) pts.push([(minX + maxX) / 2, (minY + maxY) / 2]);
  return pts;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanMapPicker({
  defaultLat, defaultLng, gridSize, areaChips, initialArea, onConfirm, onClose,
}: ScanMapPickerProps) {
  // Three separate refs: outer wrapper (for sizing), mapbox div, lasso canvas
  const outerRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const selectedRef = useRef<SuburbFeature[]>([]);
  const loadingRef = useRef(false);
  const drawModeRef = useRef(false);
  const isDrawingRef = useRef(false);
  const lassoPathRef = useRef<[number, number][]>([]);
  const animFrameRef = useRef<number>(0);

  const [selected, setSelectedState] = useState<SuburbFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [drawMode, setDrawMode] = useState(false);

  const setSelected = useCallback((next: SuburbFeature[]) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  // Push data to Mapbox source — always safe to call
  const pushToMap = useCallback((suburbs: SuburbFeature[]) => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('suburbs') as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(buildFC(suburbs));
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, []);

  // Toggle single suburb (click mode)
  const toggleSuburb = useCallback(async (query: string) => {
    if (loadingRef.current) return;
    const current = selectedRef.current;
    const qLower = query.toLowerCase();
    const existing = current.find(s => s.key === qLower || s.key.startsWith(qLower) || qLower.startsWith(s.key));
    if (existing) {
      const next = current.filter(s => s !== existing);
      setSelected(next);
      pushToMap(next);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setLoadingMsg('Loading suburb boundary…');
    const feature = await fetchSuburbPolygon(query);
    if (feature) {
      const next = [...selectedRef.current, feature];
      setSelected(next);
      pushToMap(next);
    }
    loadingRef.current = false;
    setLoading(false);
    setLoadingMsg('');
  }, [setSelected, pushToMap]);

  const toggleRef = useRef(toggleSuburb);
  useEffect(() => { toggleRef.current = toggleSuburb; }, [toggleSuburb]);

  // Lasso: collect ALL features then do ONE atomic update
  const processLasso = useCallback(async (path: [number, number][]) => {
    const map = mapRef.current;
    if (!map || path.length < 10) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadingMsg('Scanning selection…');
    try {
      const samplePixels = samplePointsInLasso(path, 10);
      const lngLats = samplePixels.map(([px, py]) => {
        const ll = map.unproject([px, py] as [number, number]);
        return { lat: ll.lat, lng: ll.lng };
      });

      // Reverse geocode in batches of 8
      const names: string[] = [];
      const BATCH = 8;
      for (let i = 0; i < lngLats.length; i += BATCH) {
        await Promise.all(lngLats.slice(i, i + BATCH).map(async ({ lat, lng }) => {
          const name = await reverseGeocodeSuburb(lat, lng);
          if (name && !names.includes(name)) names.push(name);
        }));
        setLoadingMsg(`Scanning… ${Math.min(i + BATCH, lngLats.length)}/${lngLats.length} points`);
        if (i + BATCH < lngLats.length) await new Promise(r => setTimeout(r, 80));
      }
      if (!names.length) return;

      // Fetch suburb polygons — collect all into local array (no shared state writes during fetch)
      const fetched: SuburbFeature[] = [];
      const POLY = 5;
      for (let i = 0; i < names.length; i += POLY) {
        const results = await Promise.all(names.slice(i, i + POLY).map(n => fetchSuburbPolygon(n)));
        results.forEach(f => { if (f && !fetched.find(e => e.key === f.key)) fetched.push(f); });
        setLoadingMsg(`Fetching boundaries… ${Math.min(i + POLY, names.length)}/${names.length}`);
        if (i + POLY < names.length) await new Promise(r => setTimeout(r, 120));
      }
      if (!fetched.length) return;

      // ONE atomic state + map update
      const existing = selectedRef.current;
      const next = [...existing, ...fetched.filter(f => !existing.find(e => e.key === f.key))];
      setSelected(next);
      pushToMap(next);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setLoadingMsg('');
    }
  }, [setSelected, pushToMap]);

  // Canvas drawing
  const drawCanvas = useCallback(() => {
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
    ctx.fillStyle = 'rgba(79,70,229,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(79,70,229,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const outer = outerRef.current;
    if (!canvas || !outer) return;
    const r = outer.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
  }, []);

  // Map init — mapbox gets its own dedicated div (mapDivRef)
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [defaultLng, defaultLat],
      zoom: 11,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('suburbs', { type: 'geojson', data: buildFC([]) });
      map.addLayer({ id: 'suburbs-fill', type: 'fill', source: 'suburbs', paint: { 'fill-color': '#4F46E5', 'fill-opacity': 0.3 } });
      map.addLayer({ id: 'suburbs-border', type: 'line', source: 'suburbs', paint: { 'line-color': '#4F46E5', 'line-width': 2.5 } });
      map.addLayer({
        id: 'suburbs-label', type: 'symbol', source: 'suburbs',
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#1e1b4b', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      });
      // Load initial area
      if (initialArea?.trim()) {
        fetchSuburbPolygon(initialArea).then(f => {
          if (f) { const next = [f]; setSelected(next); pushToMap(next); map.flyTo({ center: f.centroid, zoom: 12 }); }
        });
      }
    });

    map.on('click', async (e) => {
      if (drawModeRef.current) return;
      const name = await reverseGeocodeSuburb(e.lngLat.lat, e.lngLat.lng);
      if (name) toggleRef.current(name);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Canvas events
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
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(drawCanvas);
    };
    const onUp = async () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const path = [...lassoPathRef.current];
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      lassoPathRef.current = [];
      await processLasso(path);
    };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drawCanvas, processLasso]);

  // Sync drawMode to ref + map interactions
  useEffect(() => {
    drawModeRef.current = drawMode;
    const map = mapRef.current;
    if (!map) return;
    if (drawMode) { map.dragPan.disable(); map.scrollZoom.disable(); }
    else { map.dragPan.enable(); map.scrollZoom.enable(); }
  }, [drawMode]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const isChipSelected = (chip: string) => {
    const cl = chip.toLowerCase();
    return selected.some(s => s.key === cl || s.key.startsWith(cl) || cl.startsWith(s.key));
  };

  const handleConfirm = () => {
    if (!selected.length) return;
    const [lng, lat] = computeCentroid(selected);
    onConfirm({ lat, lng, name: selected.map(s => s.name).join(', '), suburbs: selected.map(s => s.name) });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: 'min(95vw, 1800px)', height: 'min(95vh, 1200px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <p className="text-sm font-semibold">Select Scan Suburbs</p>
            <p className="text-[11px] text-muted-foreground">
              {drawMode ? 'Draw mode — click and drag to circle suburbs. Release to auto-select.' : 'Click a suburb to toggle it, or use Draw Mode to lasso-select an area.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawMode(d => !d)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${drawMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
              data-testid="btn-draw-mode-toggle"
            >
              {drawMode ? <Lasso className="h-3.5 w-3.5" /> : <MousePointer2 className="h-3.5 w-3.5" />}
              {drawMode ? 'Draw Mode (on)' : 'Draw Mode'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="btn-close-map-picker">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chips */}
        {areaChips.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5 shrink-0 bg-muted/20">
            <span className="text-[10px] text-muted-foreground self-center mr-1 shrink-0">Quick add:</span>
            {areaChips.map(chip => {
              const active = isChipSelected(chip);
              return (
                <button key={chip} onClick={() => toggleSuburb(chip)} disabled={loading}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border'}`}
                  data-testid={`chip-map-area-${chip}`}>
                  {chip}
                </button>
              );
            })}
          </div>
        )}

        {/* Map area: outer wrapper → mapbox div + canvas overlay */}
        <div ref={outerRef} className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Mapbox renders into this dedicated div — no React children */}
          <div ref={mapDivRef} className="absolute inset-0" />

          {/* Lasso canvas sits on top of the map */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10"
            style={{ pointerEvents: drawMode ? 'auto' : 'none', cursor: drawMode ? 'crosshair' : 'default' }}
          />

          {/* Overlays (z-20 to float above both map + canvas) */}
          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md z-20">
              <Loader2 className="h-3 w-3 animate-spin" />
              {loadingMsg || 'Loading…'}
            </div>
          )}
          {drawMode && !loading && (
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium shadow z-20 flex items-center gap-1.5">
              <Lasso className="h-3.5 w-3.5" />
              Click &amp; drag to circle suburbs
            </div>
          )}
          <div className="absolute bottom-8 left-3 bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow z-10">
            <span className="font-semibold text-primary">Service Areas</span>{' · '}<span>{selected.length} of {Math.max(selected.length, areaChips.length)} selected</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center gap-3 shrink-0 bg-muted/10">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            {selected.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {drawMode ? 'Draw a circle on the map to select suburbs' : 'Click the map or use the chips above'}
              </p>
            ) : (
              selected.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                  {s.name}
                  <button onClick={() => { const next = selected.filter(x => x !== s); setSelected(next); pushToMap(next); }} className="hover:text-destructive ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={handleConfirm} disabled={loading || selected.length === 0} data-testid="btn-confirm-map-area">
            <Check className="h-3.5 w-3.5" />
            Use These Areas ({selected.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
