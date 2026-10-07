import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CourtLocation, MapBounds, MapCommand, toMapPins } from "./leafletMapHtml";

export type CourtsMapProps = {
  courts: CourtLocation[];
  selectedId?: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  // Bump to re-fit the map to all pins (e.g. after a filter change).
  fitKey?: number;
  // Bump to center on the player's location (now, or once it arrives).
  recenterKey?: number;
  onCourtPress: (courtId: string) => void;
  onMapPress?: () => void;
  onRegionChange?: (bounds: MapBounds) => void;
  // Fires once the basemap has drawn (not just when the page script runs).
  onReady?: () => void;
};

// Platform-agnostic half of the map bridge: turns props into MapCommands for
// the Leaflet page and page messages into callbacks. `post` delivers a command
// (WebView injectJavaScript on native, iframe postMessage on web).
export function useMapBridge(post: (command: MapCommand) => void, props: CourtsMapProps) {
  const { courts, selectedId = null, userLocation = null, fitKey = 0, recenterKey = 0 } = props;
  // Counts "ready" messages: a reloaded page announces itself again and must
  // get everything re-sent.
  const [readyCount, setReadyCount] = useState(0);
  const ready = readyCount > 0;
  const pins = useMemo(() => toMapPins(courts), [courts]);
  const fittedRef = useRef(false);
  const lastFitKey = useRef(fitKey);
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });

  useEffect(() => {
    if (!readyCount) return;
    const fit = !fittedRef.current || lastFitKey.current !== fitKey;
    fittedRef.current = true;
    lastFitKey.current = fitKey;
    post({ type: "set_courts", pins, fit });
  }, [readyCount, pins, fitKey, post]);

  useEffect(() => {
    if (readyCount) post({ type: "select", id: selectedId });
  }, [readyCount, selectedId, post]);

  // A recenter request waits for a location if there isn't one yet.
  const recenterPending = useRef(false);
  const lastRecenterKey = useRef(recenterKey);
  useEffect(() => {
    if (lastRecenterKey.current !== recenterKey) {
      lastRecenterKey.current = recenterKey;
      recenterPending.current = true;
    }
    if (!readyCount || !userLocation) return;
    post({ type: "set_user", lat: userLocation.latitude, lng: userLocation.longitude, center: recenterPending.current });
    recenterPending.current = false;
  }, [readyCount, userLocation, recenterKey, post]);

  const handleMessage = useCallback((raw: unknown) => {
    let message: { type?: string; courtId?: string; bounds?: MapBounds; message?: string } | null = null;
    try { message = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof message); } catch { return; }
    if (!message) return;
    const current = propsRef.current;
    if (message.type === "ready") { fittedRef.current = false; setReadyCount((n) => n + 1); }
    else if (message.type === "tiles_ready") current.onReady?.();
    else if (message.type === "court_selected" && message.courtId) current.onCourtPress(String(message.courtId));
    else if (message.type === "map_tap") current.onMapPress?.();
    else if (message.type === "map_moved" && message.bounds) current.onRegionChange?.(message.bounds);
    else if (message.type === "map_error") console.warn("[courts map]", message.message);
  }, []);

  return { ready, handleMessage };
}
