import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { MapPin, X, Check, Loader2 } from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

export interface MapPickerResult {
  lat: number;
  lng: number;
  name: string;
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

const RADIUS_KM = 3;

function buildCircleGeoJSON(lat: number, lng: number, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const pts = 64;
  const coords: [number, number][] = [];
  const kmInDegLat = 1 / 110.574;
  const kmInDegLng = 1 / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= pts; i++) {
    const angle = (i / pts) * 2 * Math.PI;
    coords.push([lng + radiusKm * kmInDegLng * Math.sin(angle), lat + radiusKm * kmInDegLat * Math.cos(angle)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,suburb,neighborhood,place&country=AU&access_token=${token}`
    );
    const d = await r.json();
    const f = d.features?.[0];
    if (f) {
      const suburb = f.context?.find((c: any) => c.id?.startsWith('locality') || c.id?.startsWith('suburb'))?.text || f.text || '';
      const state = f.context?.find((c: any) => c.id?.startsWith('region'))?.short_code?.replace('AU-', '') || '';
      return [suburb, state].filter(Boolean).join(' ') || f.place_name;
    }
  } catch { /* ignore */ }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query + ', Australia')}.json?types=locality,suburb,neighborhood,place&country=AU&access_token=${token}`
    );
    const d = await r.json();
    const f = d.features?.[0];
    if (f) {
      const [lng, lat] = f.center;
      const suburb = f.context?.find((c: any) => c.id?.startsWith('locality') || c.id?.startsWith('suburb'))?.text || f.text || '';
      const state = f.context?.find((c: any) => c.id?.startsWith('region'))?.short_code?.replace('AU-', '') || '';
      return { lat, lng, name: [suburb, state].filter(Boolean).join(' ') || f.place_name };
    }
  } catch { /* ignore */ }
  return null;
}

export default function ScanMapPicker({ defaultLat, defaultLng, gridSize, areaChips, initialArea, onConfirm, onClose }: ScanMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [selected, setSelected] = useState<MapPickerResult>({ lat: defaultLat, lng: defaultLng, name: initialArea || '' });
  const [loading, setLoading] = useState(false);
  const gridN = parseInt(gridSize) || 5;

  const updateCircle = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map || !map.getSource('circle')) return;
    (map.getSource('circle') as mapboxgl.GeoJSONSource).setData(buildCircleGeoJSON(lat, lng, RADIUS_KM));
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    markerRef.current?.setLngLat([lng, lat]);
    updateCircle(lat, lng);
    setLoading(true);
    const name = await reverseGeocode(lat, lng);
    setSelected({ lat, lng, name });
    setLoading(false);
  }, [updateCircle]);

  const handleChipClick = useCallback(async (chip: string) => {
    setLoading(true);
    const result = await forwardGeocode(chip);
    if (result) {
      const { lat, lng, name } = result;
      markerRef.current?.setLngLat([lng, lat]);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 12, duration: 800 });
      updateCircle(lat, lng);
      setSelected({ lat, lng, name });
    }
    setLoading(false);
  }, [updateCircle]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [defaultLng, defaultLat],
      zoom: 11,
    });
    mapRef.current = map;

    const marker = new mapboxgl.Marker({ color: '#4F46E5', draggable: true })
      .setLngLat([defaultLng, defaultLat])
      .addTo(map);
    markerRef.current = marker;

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      handleMapClick(lat, lng);
    });

    map.on('click', (e) => handleMapClick(e.lngLat.lat, e.lngLat.lng));

    map.on('load', () => {
      map.addSource('circle', { type: 'geojson', data: buildCircleGeoJSON(defaultLat, defaultLng, RADIUS_KM) });
      map.addLayer({ id: 'circle-fill', type: 'fill', source: 'circle', paint: { 'fill-color': '#4F46E5', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'circle-border', type: 'line', source: 'circle', paint: { 'line-color': '#4F46E5', 'line-width': 2, 'line-dasharray': [3, 2] } });

      // If initialArea set, geocode it immediately
      if (initialArea?.trim()) {
        forwardGeocode(initialArea).then(r => {
          if (r) {
            marker.setLngLat([r.lng, r.lat]);
            map.flyTo({ center: [r.lng, r.lat], zoom: 12 });
            updateCircle(r.lat, r.lng);
            setSelected(r);
          }
        });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-[680px] max-w-full flex flex-col overflow-hidden" style={{ maxHeight: 'min(90vh, 700px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <p className="text-sm font-semibold">Select Scan Area</p>
            <p className="text-[11px] text-muted-foreground">Click the map or drag the pin — the scan will be centred on your selection</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="btn-close-map-picker">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Suburb chips */}
        {areaChips.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5 shrink-0 bg-muted/20">
            <span className="text-[10px] text-muted-foreground self-center mr-1">Quick select:</span>
            {areaChips.map(chip => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                disabled={loading}
                className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${selected.name === chip ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-primary/10 hover:border-primary/50 border-border text-foreground'}`}
                data-testid={`chip-map-area-${chip}`}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Map */}
        <div className="relative flex-1" style={{ minHeight: 320 }}>
          <div ref={containerRef} className="absolute inset-0" />
          {loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border rounded-full px-3 py-1.5 flex items-center gap-2 text-xs shadow-md">
              <Loader2 className="h-3 w-3 animate-spin" />
              Locating area…
            </div>
          )}
          {/* Grid size info overlay */}
          <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-1.5 text-[11px] shadow">
            <span className="font-semibold text-primary">{gridN}×{gridN}</span> grid · {gridN * gridN} check points · {RADIUS_KM}km radius
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center gap-3 shrink-0 bg-muted/10">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">
                {loading ? 'Identifying area…' : selected.name || 'Click the map to select an area'}
              </p>
              {selected.name && !loading && (
                <p className="text-[10px] text-muted-foreground">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={() => onConfirm(selected)} disabled={loading || !selected.name} data-testid="btn-confirm-map-area">
            <Check className="h-3.5 w-3.5" /> Use This Area
          </Button>
        </div>
      </div>
    </div>
  );
}
