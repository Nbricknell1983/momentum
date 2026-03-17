import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface PinnedLocation {
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (location: PinnedLocation) => void;
  persistKey?: string;
}

const PERSIST_KEY = 'research_map_pin';

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'MomentumAgent/1.0' } }
    );
    const data = await res.json();
    const a = data.address || {};
    const suburb = a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.quarter || '';
    const city = a.city || a.town || a.municipality || '';
    const state = a.state || '';
    const parts = [suburb, city, state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 2).join(',').trim() || 'Selected location';
  } catch {
    return 'Selected location';
  }
}

export function MapPickerDialog({ open, onClose, onConfirm, persistKey = PERSIST_KEY }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [pinned, setPinned] = useState<PinnedLocation | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Load persisted pin on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(persistKey);
      if (saved) {
        const parsed = JSON.parse(saved) as PinnedLocation;
        if (parsed.lat && parsed.lng) setPinned(parsed);
      }
    } catch {}
  }, [persistKey]);

  // Init Leaflet map when dialog opens
  useEffect(() => {
    if (!open) return;

    let map: any = null;

    const init = async () => {
      const L = (await import('leaflet')).default;

      // Wait for DOM
      await new Promise(r => setTimeout(r, 80));
      if (!mapRef.current) return;

      // Default to centre of Australia
      const savedPin = (() => {
        try {
          const s = localStorage.getItem(persistKey);
          return s ? (JSON.parse(s) as PinnedLocation) : null;
        } catch { return null; }
      })();

      const defaultCenter: [number, number] = savedPin
        ? [savedPin.lat, savedPin.lng]
        : [-25.2744, 133.7751];

      map = L.map(mapRef.current, { zoomControl: true }).setView(defaultCenter, savedPin ? 13 : 5);
      leafletMapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom pin icon
      const icon = L.divIcon({
        html: `<div style="background:#6d28d9;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
        iconAnchor: [13, 26],
        className: '',
      });

      // Restore saved pin
      if (savedPin) {
        const marker = L.marker([savedPin.lat, savedPin.lng], { icon, draggable: true }).addTo(map);
        markerRef.current = marker;
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          setGeocoding(true);
          const label = await reverseGeocode(pos.lat, pos.lng);
          setGeocoding(false);
          setPinned({ lat: pos.lat, lng: pos.lng, label });
        });
      }

      // Click to place / move pin
      map.on('click', async (e: any) => {
        const { lat, lng } = e.latlng;

        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }

        const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current = marker;

        setGeocoding(true);
        const label = await reverseGeocode(lat, lng);
        setGeocoding(false);
        setPinned({ lat, lng, label });

        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          setGeocoding(true);
          const lbl = await reverseGeocode(pos.lat, pos.lng);
          setGeocoding(false);
          setPinned({ lat: pos.lat, lng: pos.lng, label: lbl });
        });
      });

      setMapReady(true);
    };

    init();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      markerRef.current = null;
      setMapReady(false);
    };
  }, [open, persistKey]);

  const handleConfirm = () => {
    if (!pinned) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(pinned));
    } catch {}
    onConfirm(pinned);
    onClose();
  };

  const handleClearPin = () => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    setPinned(null);
    try { localStorage.removeItem(persistKey); } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden" data-testid="dialog-map-picker">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet-600" />
            Pin a search area
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Click anywhere on the map to pin a suburb. Drag the pin to adjust. Your pin is saved between sessions.
          </p>
        </DialogHeader>

        {/* Map */}
        <div className="relative" style={{ height: 420 }}>
          <div ref={mapRef} style={{ height: '100%', width: '100%' }} data-testid="map-container" />

          {/* Loading overlay */}
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Geocoding spinner */}
          {geocoding && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-3 py-1 text-xs font-medium shadow flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Looking up suburb…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            {pinned ? (
              <>
                <MapPin className="h-4 w-4 text-violet-600 shrink-0" />
                <span className="text-sm font-medium truncate">{pinned.label}</span>
                <button
                  onClick={handleClearPin}
                  className="text-muted-foreground hover:text-foreground ml-1 shrink-0"
                  title="Clear pin"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No pin set — click the map to pin a suburb</span>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} data-testid="button-map-cancel">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!pinned || geocoding}
              data-testid="button-map-confirm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              Use this location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
