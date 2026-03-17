import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, X, Bookmark, BookmarkCheck } from 'lucide-react';
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
const SAVED_PINS_KEY = 'research_saved_pins';

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

function loadSavedPins(): PinnedLocation[] {
  try {
    const raw = localStorage.getItem(SAVED_PINS_KEY);
    if (raw) return JSON.parse(raw) as PinnedLocation[];
  } catch {}
  return [];
}

function savePinsToStorage(pins: PinnedLocation[]) {
  try { localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(pins)); } catch {}
}

export function MapPickerDialog({ open, onClose, onConfirm, persistKey = PERSIST_KEY }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const iconRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const [pinned, setPinned] = useState<PinnedLocation | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [savedPins, setSavedPins] = useState<PinnedLocation[]>(() => loadSavedPins());
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');

  // Check if current pin is already saved
  const isPinnedSaved = pinned
    ? savedPins.some(p => Math.abs(p.lat - pinned.lat) < 0.0001 && Math.abs(p.lng - pinned.lng) < 0.0001)
    : false;

  // Load persisted single pin on mount (backwards compat)
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
      leafletRef.current = L;

      await new Promise(r => setTimeout(r, 80));
      if (!mapRef.current) return;

      const savedPin = (() => {
        try {
          const s = localStorage.getItem(persistKey);
          return s ? (JSON.parse(s) as PinnedLocation) : null;
        } catch { return null; }
      })();

      const defaultCenter: [number, number] = savedPin
        ? [savedPin.lat, savedPin.lng]
        : [-27.47, 153.02]; // default to Brisbane

      map = L.map(mapRef.current, { zoomControl: true }).setView(defaultCenter, savedPin ? 13 : 10);
      leafletMapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        html: `<div style="background:#6d28d9;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
        iconAnchor: [14, 28],
        className: '',
      });
      iconRef.current = icon;

      // Saved-pin ghost markers (non-draggable, muted)
      const ghostIcon = L.divIcon({
        html: `<div style="background:#a78bfa;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25);opacity:0.75"></div>`,
        iconAnchor: [10, 20],
        className: '',
      });
      const pins = loadSavedPins();
      pins.forEach(p => {
        const m = L.marker([p.lat, p.lng], { icon: ghostIcon }).addTo(map);
        m.bindTooltip(p.label, { permanent: false, direction: 'top' });
        m.on('click', async () => {
          if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
          const marker = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(map);
          markerRef.current = marker;
          setPinned({ lat: p.lat, lng: p.lng, label: p.label });
          map.setView([p.lat, p.lng], 13);
          marker.on('dragend', async () => {
            const pos = marker.getLatLng();
            setGeocoding(true);
            const lbl = await reverseGeocode(pos.lat, pos.lng);
            setGeocoding(false);
            setPinned({ lat: pos.lat, lng: pos.lng, label: lbl });
          });
        });
      });

      // Restore last active pin
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
        if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
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
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; }
      markerRef.current = null;
      setMapReady(false);
    };
  }, [open, persistKey]);

  const handleConfirm = () => {
    if (!pinned) return;
    try { localStorage.setItem(persistKey, JSON.stringify(pinned)); } catch {}
    onConfirm(pinned);
    onClose();
  };

  const handleClearPin = () => {
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    setPinned(null);
    try { localStorage.removeItem(persistKey); } catch {}
  };

  const handleSavePin = () => {
    if (!pinned) return;
    if (isPinnedSaved) return;
    setLabelInput(pinned.label);
    setEditingLabel(pinned.label);
  };

  const handleConfirmSave = () => {
    if (!pinned) return;
    const label = labelInput.trim() || pinned.label;
    const newPin: PinnedLocation = { ...pinned, label };
    const updated = [...savedPins.filter(p => !(Math.abs(p.lat - newPin.lat) < 0.0001 && Math.abs(p.lng - newPin.lng) < 0.0001)), newPin];
    setSavedPins(updated);
    savePinsToStorage(updated);
    setPinned(newPin);
    setEditingLabel(null);
  };

  const handleDeleteSaved = (idx: number) => {
    const updated = savedPins.filter((_, i) => i !== idx);
    setSavedPins(updated);
    savePinsToStorage(updated);
  };

  const handleUseSaved = (p: PinnedLocation) => {
    const L = leafletRef.current;
    if (leafletMapRef.current && iconRef.current && L) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      const marker = L.marker([p.lat, p.lng], { icon: iconRef.current, draggable: true }).addTo(leafletMapRef.current);
      markerRef.current = marker;
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        setGeocoding(true);
        const lbl = await reverseGeocode(pos.lat, pos.lng);
        setGeocoding(false);
        setPinned({ lat: pos.lat, lng: pos.lng, label: lbl });
      });
      leafletMapRef.current.setView([p.lat, p.lng], 13);
    }
    setPinned(p);
    try { localStorage.setItem(persistKey, JSON.stringify(p)); } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden" data-testid="dialog-map-picker">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet-600" />
            Pin a search area
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Click anywhere on the map to place a pin. Save it to your pin list to quickly reuse search areas.
          </p>
        </DialogHeader>

        {/* Map */}
        <div className="relative" style={{ height: 500 }}>
          <div ref={mapRef} style={{ height: '100%', width: '100%' }} data-testid="map-container" />

          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {geocoding && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-zinc-900/90 rounded-full px-3 py-1 text-xs font-medium shadow flex items-center gap-2 z-[1000]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Looking up suburb…
            </div>
          )}
        </div>

        {/* Saved pins list */}
        {savedPins.length > 0 && (
          <div className="px-6 pt-3 pb-1">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Saved pins</p>
            <div className="flex flex-wrap gap-2">
              {savedPins.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-full pl-2.5 pr-1 py-1 text-xs"
                >
                  <MapPin className="h-3 w-3 text-violet-600 shrink-0" />
                  <button
                    onClick={() => handleUseSaved(p)}
                    className="text-violet-700 dark:text-violet-300 font-medium hover:underline truncate max-w-[160px]"
                    title={`Use: ${p.label}`}
                  >
                    {p.label}
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(idx)}
                    className="text-muted-foreground hover:text-destructive rounded-full p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove pin"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/30 space-y-3">
          {/* Label edit row */}
          {editingLabel !== null && (
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-violet-600 shrink-0" />
              <Input
                autoFocus
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmSave(); if (e.key === 'Escape') setEditingLabel(null); }}
                placeholder="Name this pin…"
                className="h-7 text-sm flex-1"
              />
              <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white shrink-0" onClick={handleConfirmSave}>
                Save
              </Button>
              <button onClick={() => setEditingLabel(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Current pin + action row */}
          <div className="flex items-center justify-between gap-3">
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
                <span className="text-sm text-muted-foreground italic">Click the map to drop a pin</span>
              )}
            </div>

            <div className="flex gap-2 shrink-0 items-center">
              {pinned && !isPinnedSaved && editingLabel === null && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSavePin}
                  className="h-8 text-xs gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-700"
                  data-testid="button-save-pin"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Save to my pins
                </Button>
              )}
              {pinned && isPinnedSaved && (
                <span className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <BookmarkCheck className="h-3.5 w-3.5" /> Saved
                </span>
              )}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
