import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { X, Check, Loader2 } from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

export interface MapPickerResult {
  lat: number;
  lng: number;
  name: string;
  suburbs: string[];
}

interface SuburbFeature {
  key: string; // lowercase normalised name
  name: string; // display name
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

async function fetchSuburbPolygon(query: string): Promise<SuburbFeature | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Australia')}&polygon_geojson=1&format=json&limit=5`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await r.json();
    if (!data?.length) return null;
    const SUBURB_TYPES = ['suburb', 'locality', 'town', 'village', 'hamlet', 'quarter', 'neighbourhood', 'residential'];
    const best = data.find((f: any) => SUBURB_TYPES.includes(f.type) && f.geojson) || data.find((f: any) => f.geojson) || null;
    if (!best?.geojson) return null;
    const name = best.display_name.split(',')[0].trim();
    return {
      key: name.toLowerCase(),
      name,
      geojson: { type: 'Feature', properties: { name }, geometry: best.geojson },
      centroid: [parseFloat(best.lon), parseFloat(best.lat)],
    };
  } catch {
    return null;
  }
}

async function reverseGeocodeSuburb(lat: number, lng: number): Promise<string> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,neighborhood,place&country=AU&access_token=${token}`
    );
    const d = await r.json();
    return d.features?.[0]?.text || '';
  } catch {
    return '';
  }
}

function computeCentroid(suburbs: SuburbFeature[]): [number, number] {
  if (!suburbs.length) return [0, 0];
  return [
    suburbs.reduce((a, s) => a + s.centroid[0], 0) / suburbs.length,
    suburbs.reduce((a, s) => a + s.centroid[1], 0) / suburbs.length,
  ];
}

function buildFeatureCollection(suburbs: SuburbFeature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: suburbs.map(s => s.geojson) };
}

export default function ScanMapPicker({ defaultLat, defaultLng, gridSize, areaChips, initialArea, onConfirm, onClose }: ScanMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const selectedRef = useRef<SuburbFeature[]>([]);
  const loadingRef = useRef(false);
  const [selected, setSelectedState] = useState<SuburbFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const gridN = parseInt(gridSize) || 5;

  // Keep ref in sync with state
  const setSelected = useCallback((next: SuburbFeature[]) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  const syncMapLayers = useCallback((suburbs: SuburbFeature[]) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('suburbs') as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(buildFeatureCollection(suburbs));
  }, []);

  const toggleSuburb = useCallback(async (query: string) => {
    if (loadingRef.current) return;
    const current = selectedRef.current;
    const qLower = query.toLowerCase();
    const existing = current.find(s => s.key === qLower || s.key.startsWith(qLower) || qLower.startsWith(s.key));
    if (existing) {
      const next = current.filter(s => s !== existing);
      setSelected(next);
      syncMapLayers(next);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    const feature = await fetchSuburbPolygon(query);
    if (feature) {
      const next = [...selectedRef.current, feature];
      setSelected(next);
      syncMapLayers(next);
      if (selectedRef.current.length <= 1) {
        mapRef.current?.flyTo({ center: feature.centroid, zoom: 12, duration: 700 });
      }
    }
    loadingRef.current = false;
    setLoading(false);
  }, [setSelected, syncMapLayers]);

  // Store toggleSuburb in ref so map click handler is always fresh
  const toggleRef = useRef(toggleSuburb);
  useEffect(() => { toggleRef.current = toggleSuburb; }, [toggleSuburb]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [defaultLng, defaultLat],
      zoom: 11,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('suburbs', { type: 'geojson', data: buildFeatureCollection([]) });
      map.addLayer({ id: 'suburbs-fill', type: 'fill', source: 'suburbs', paint: { 'fill-color': '#4F46E5', 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'suburbs-border', type: 'line', source: 'suburbs', paint: { 'line-color': '#4F46E5', 'line-width': 2 } });
      map.addLayer({
        id: 'suburbs-label',
        type: 'symbol',
        source: 'suburbs',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-anchor': 'center',
        },
        paint: { 'text-color': '#1e1b4b', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      });

      if (initialArea?.trim()) {
        fetchSuburbPolygon(initialArea).then(f => {
          if (f) {
            selectedRef.current = [f];
            setSelectedState([f]);
            syncMapLayers([f]);
            map.flyTo({ center: f.centroid, zoom: 12 });
          }
        });
      }
    });

    map.on('click', async (e) => {
      const name = await reverseGeocodeSuburb(e.lngLat.lat, e.lngLat.lng);
      if (name) toggleRef.current(name);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

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
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
              Click any suburb on the map to add or remove it — or use the chips below
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="btn-close-map-picker">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chips */}
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
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border'}`}
                  data-testid={`chip-map-area-${chip}`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}

        {/* Map */}
        <div className="relative flex-1" style={{ minHeight: 0 }}>
          <div ref={containerRef} className="absolute inset-0" />

          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md z-10">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading suburb boundary…
            </div>
          )}

          {/* Bottom-left stats badge */}
          <div className="absolute bottom-8 left-3 bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow z-10">
            <span className="font-semibold text-primary">Service Areas</span>
            {' · '}
            <span>{selected.length} of {Math.max(selected.length, areaChips.length)} selected</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center gap-3 shrink-0 bg-muted/10">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            {selected.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No suburbs selected — click the map or use the chips above</p>
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
                      syncMapLayers(next);
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
    </div>
  );
}
