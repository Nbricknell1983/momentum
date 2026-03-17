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

// ── Utilities ─────────────────────────────────────────────────────────────────

async function fetchSuburbPolygon(query: string): Promise<SuburbFeature | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Australia')}&polygon_geojson=1&format=json&limit=5`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) return null;
    const SUBURB_TYPES = ['suburb', 'locality', 'town', 'village', 'hamlet', 'quarter', 'neighbourhood', 'residential'];
    const best =
      data.find((f: any) => SUBURB_TYPES.includes(f.type) && f.geojson) ||
      data.find((f: any) => f.geojson) ||
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

async function reverseGeocodeSuburb(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=13`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return '';
    const d = await r.json();
    return d.address?.suburb || d.address?.town || d.address?.city_district || d.address?.village || d.address?.neighbourhood || '';
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

function buildFC(suburbs: SuburbFeature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: suburbs.map(s => s.geojson) };
}

const POLY_STYLE = { color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.25, weight: 2.5 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScanMapPicker({
  defaultLat, defaultLng, areaChips, initialArea, onConfirm, onClose,
}: ScanMapPickerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);

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

  // Push new GeoJSON to the Leaflet layer
  const pushToMap = useCallback((suburbs: SuburbFeature[]) => {
    const layer = geoLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (suburbs.length) {
      layer.addData(buildFC(suburbs) as any);
    }
  }, []);

  // Toggle a suburb on/off (click mode)
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

  // Lasso: collect ALL features first, then one atomic state + map update
  const processLasso = useCallback(async (path: [number, number][]) => {
    const map = mapRef.current;
    if (!map || path.length < 10) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadingMsg('Scanning selection…');
    try {
      const samplePixels = samplePointsInLasso(path, 10);

      // pixel coords → lat/lng via Leaflet
      const lngLats = samplePixels.map(([px, py]) => {
        const latlng = map.containerPointToLatLng([px, py]);
        return { lat: latlng.lat, lng: latlng.lng };
      });

      // Reverse geocode in batches of 8 using Nominatim
      const names: string[] = [];
      const BATCH = 8;
      for (let i = 0; i < lngLats.length; i += BATCH) {
        await Promise.all(lngLats.slice(i, i + BATCH).map(async ({ lat, lng }) => {
          const name = await reverseGeocodeSuburb(lat, lng);
          if (name && !names.includes(name)) names.push(name);
        }));
        setLoadingMsg(`Scanning… ${Math.min(i + BATCH, lngLats.length)}/${lngLats.length} points`);
        if (i + BATCH < lngLats.length) await new Promise(r => setTimeout(r, 100));
      }
      if (!names.length) return;

      // Fetch suburb boundary polygons — collect all, no shared-state writes during fetch
      const fetched: SuburbFeature[] = [];
      const POLY = 5;
      for (let i = 0; i < names.length; i += POLY) {
        const results = await Promise.all(names.slice(i, i + POLY).map(n => fetchSuburbPolygon(n)));
        results.forEach(f => { if (f && !fetched.find(e => e.key === f.key)) fetched.push(f); });
        setLoadingMsg(`Fetching boundaries… ${Math.min(i + POLY, names.length)}/${names.length}`);
        if (i + POLY < names.length) await new Promise(r => setTimeout(r, 120));
      }
      if (!fetched.length) return;

      // One single atomic merge
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

  // Canvas lasso drawing
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

  // Init Leaflet map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, { zoomControl: true }).setView([defaultLat, defaultLng], 12);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const geoLayer = L.geoJSON(undefined, {
      style: () => POLY_STYLE,
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name;
        if (name) {
          layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'suburb-label' });
        }
      },
    }).addTo(map);
    geoLayerRef.current = geoLayer;

    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current) return;
      const name = await reverseGeocodeSuburb(e.latlng.lat, e.latlng.lng);
      if (name) toggleRef.current(name);
    });

    // Load initial area
    if (initialArea?.trim()) {
      fetchSuburbPolygon(initialArea).then(f => {
        if (f) {
          const next = [f];
          selectedRef.current = next;
          setSelectedState(next);
          geoLayer.clearLayers();
          geoLayer.addData(buildFC(next) as any);
          map.flyTo([f.centroid[1], f.centroid[0]], 13);
        }
      });
    }

    return () => { map.remove(); mapRef.current = null; geoLayerRef.current = null; };
  }, []);

  // Canvas mouse events for lasso
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

  // Sync draw mode → disable/enable Leaflet drag & scroll
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-background rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(95vw, 1800px)', height: 'min(95vh, 1200px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <p className="text-sm font-semibold">Select Scan Suburbs</p>
            <p className="text-[11px] text-muted-foreground">
              {drawMode
                ? 'Draw mode — click and drag to circle suburbs. Release to auto-select.'
                : 'Click a suburb on the map, use the chips below, or switch to Draw Mode to lasso an area.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawMode(d => !d)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                drawMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'
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

        {/* Quick-add chips */}
        {areaChips.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5 shrink-0 bg-muted/20">
            <span className="text-[10px] text-muted-foreground self-center mr-1 shrink-0">Quick add:</span>
            {areaChips.map(chip => {
              const active = isChipSelected(chip);
              return (
                <button
                  key={chip}
                  onClick={() => toggleSuburb(chip)}
                  disabled={loading}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border'
                  }`}
                  data-testid={`chip-map-area-${chip}`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}

        {/* Map + lasso canvas */}
        <div ref={outerRef} className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Leaflet renders into this dedicated div */}
          <div ref={mapDivRef} className="absolute inset-0" style={{ zIndex: 0 }} />

          {/* Lasso canvas — sits on top of the map */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              zIndex: 10,
              pointerEvents: drawMode ? 'auto' : 'none',
              cursor: drawMode ? 'crosshair' : 'default',
            }}
          />

          {/* Overlays */}
          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md" style={{ zIndex: 20 }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              {loadingMsg || 'Loading…'}
            </div>
          )}
          {drawMode && !loading && (
            <div className="absolute top-3 left-3 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium shadow flex items-center gap-1.5" style={{ zIndex: 20 }}>
              <Lasso className="h-3.5 w-3.5" />
              Click &amp; drag to circle suburbs
            </div>
          )}
          <div className="absolute bottom-6 left-3 bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow" style={{ zIndex: 10 }}>
            <span className="font-semibold text-primary">Service Areas</span>
            {' · '}
            <span>{selected.length} selected</span>
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
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5"
                >
                  {s.name}
                  <button
                    onClick={() => {
                      const next = selected.filter(x => x !== s);
                      setSelected(next);
                      pushToMap(next);
                    }}
                    className="hover:text-destructive ml-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
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
        .suburb-label {
          background: rgba(255,255,255,0.85);
          border: none;
          box-shadow: none;
          font-size: 11px;
          font-weight: 600;
          color: #1e1b4b;
          padding: 1px 4px;
          border-radius: 3px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
