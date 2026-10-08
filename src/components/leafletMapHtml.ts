// The Leaflet map page shared by the native WebView (CourtsMap.tsx) and the
// web iframe (CourtsMap.web.tsx). The page is static; courts, the selected pin
// and the player's location are pushed in as messages so updates don't reload
// the map. Messages out: ready, court_selected, map_tap, map_moved.

export type CourtLocation = {
  id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  status: "Available" | "Full" | "Closed" | null;
  rating?: number | string | null;
  hourlyRate?: number | null;
  // From enrichCourt: the first bookable slot today/tomorrow, when known.
  nextSlot?: { label: string; today: boolean } | null;
};

export type MapPin = { id: string; lat: number; lng: number; status: string; label: string; name: string };
export type MapBounds = { north: number; south: number; east: number; west: number };
export type MapCommand =
  | { type: "set_courts"; pins: MapPin[]; fit: boolean }
  | { type: "select"; id: string | null }
  | { type: "set_user"; lat: number; lng: number; center: boolean }
  | { type: "fit" };

export const TAGUM_LATITUDE = 7.4478;
export const TAGUM_LONGITUDE = 125.8083;
export const TAGUM_ZOOM = 13;

// Matches the legend in CourtsMapPanel.
export const PIN_COLORS = { Available: "#3DD68C", Full: "#F0605D", Closed: "#8A938F" } as const;

// "4:00 PM" -> "4PM", "6:30 AM" -> "6:30AM" (pins have little room).
export function shortTime(label: string): string {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(String(label).trim());
  if (!match) return String(label);
  return `${match[1]}${match[2] && match[2] !== "00" ? `:${match[2]}` : ""}${match[3].toUpperCase()}`;
}

// Price when the court has one (most useful at a glance), else a short name,
// plus today's next open slot when there is one: "₱150 · 4PM".
export function pinLabel(court: CourtLocation): string {
  let base: string;
  if (court.hourlyRate !== null && court.hourlyRate !== undefined && Number.isFinite(Number(court.hourlyRate))) {
    base = `₱${Math.round(Number(court.hourlyRate))}`;
  } else {
    const name = (court.name || "Court").trim();
    base = name.length > 16 ? `${name.slice(0, 15)}…` : name;
  }
  return court.status === "Available" && court.nextSlot?.today ? `${base} · ${shortTime(court.nextSlot.label)}` : base;
}

// Number(null) is 0, so missing coordinates must become NaN to be dropped.
function coord(value: number | string | null | undefined): number {
  return value === null || value === undefined || value === "" ? NaN : Number(value);
}

export function toMapPins(courts: CourtLocation[]): MapPin[] {
  return courts
    .map((c) => ({ id: String(c.id), lat: coord(c.latitude), lng: coord(c.longitude), status: c.status || "Available", label: pinLabel(c), name: c.name || "Court" }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
}

export function insideBounds(court: CourtLocation, bounds: MapBounds | null): boolean {
  if (!bounds) return true;
  const lat = Number(court.latitude);
  const lng = Number(court.longitude);
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

// CARTO's raster basemaps need a key since Aug 2026 (requests without one get
// an "API KEY REQUIRED" watermark). It's a client-side key by design, read
// from EXPO_PUBLIC_CARTO_BASEMAP_KEY. Without a key we fall back to Esri's
// keyless Dark Gray canvas rather than show the watermark.
export function tileLayers(cartoKey?: string | null) {
  const key = typeof cartoKey === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(cartoKey.trim()) ? cartoKey.trim() : null;
  if (key) {
    return [{
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${key}`,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }];
  }
  return [
    { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri" },
    { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", attribution: "" },
  ];
}

export function generateLeafletHtml(cartoKey?: string | null): string {
  // Escaping "<" keeps the JSON from closing the inline <script> early.
  const layers = JSON.stringify(tileLayers(cartoKey)).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Tagum City Courts Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0B1F1A; overflow: hidden;
      -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    #map { width: 100%; height: 100%; background: #0B1F1A; }
    .leaflet-control-attribution { background: rgba(6,35,29,0.7) !important; color: rgba(255,253,238,0.55) !important; font-size: 9px !important; }
    .leaflet-control-attribution a { color: rgba(227,239,38,0.8) !important; }
    .leaflet-div-icon { background: transparent; border: none; }

    /* Price / name pill with a pointer underneath. */
    .pin { position: relative; display: inline-flex; align-items: center; gap: 4px; transform: translate(-50%, -100%);
      padding: 4px 9px; border-radius: 999px; border: 2px solid #06231D; white-space: nowrap;
      font-size: 12px; font-weight: 800; color: #06231D; box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      transition: transform 120ms ease; }
    .pin::after { content: ""; position: absolute; left: 50%; bottom: -7px; margin-left: -5px;
      border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #06231D; }
    .pin .dot { width: 6px; height: 6px; border-radius: 3px; background: #06231D; opacity: 0.55; }
    .pin.closed { color: #FFFDEE; opacity: 0.85; }
    .pin.selected { transform: translate(-50%, -100%) scale(1.18); border-color: #E3EF26; z-index: 1000; }

    .cluster { width: 40px; height: 40px; border-radius: 20px; background: #E3EF26; color: #06231D;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;
      border: 3px solid rgba(6,35,29,0.85); box-shadow: 0 0 0 4px rgba(227,239,38,0.25); }

    .me { width: 18px; height: 18px; border-radius: 9px; background: #4DA3FF; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(77,163,255,0.25); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    // Surface page errors to the app (the iframe/WebView console is hidden).
    window.addEventListener('error', function(e) {
      var payload = JSON.stringify({ type: 'map_error', message: String(e.message || e.type) + (e.filename ? ' @' + e.filename + ':' + e.lineno : '') });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      else if (window.parent !== window) window.parent.postMessage(payload, '*');
    }, true);
    (function() {
      var COLORS = ${JSON.stringify(PIN_COLORS)};
      var map = L.map('map', { zoomControl: false, attributionControl: true })
        .setView([${TAGUM_LATITUDE}, ${TAGUM_LONGITUDE}], ${TAGUM_ZOOM});

      // Muted dark basemap (see tileLayers() for the provider choice).
      var tiles = ${layers}.map(function(layer) {
        return L.tileLayer(layer.url, { maxZoom: 19, subdomains: 'abcd', attribution: layer.attribution }).addTo(map);
      });

      function send(message) {
        var payload = JSON.stringify(message);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(payload);
        else if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
      }

      // Court names come from the database: escape before building HTML.
      function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
      }

      var cluster = L.markerClusterGroup({
        maxClusterRadius: 72, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 16,
        iconCreateFunction: function(c) {
          return L.divIcon({ html: '<div class="cluster">' + c.getChildCount() + '</div>', className: '', iconSize: [40, 40] });
        }
      }).addTo(map);

      var markers = {};
      var pins = [];
      var selectedId = null;
      var me = null;
      // Programmatic moves (fit, centering) must not show "Search this area".
      var quiet = 0;

      function pinIcon(pin) {
        var cls = 'pin' + (pin.status === 'Closed' ? ' closed' : '') + (pin.id === selectedId ? ' selected' : '');
        var html = '<div class="' + cls + '" style="background:' + (COLORS[pin.status] || COLORS.Available) + '"><span class="dot"></span>' + esc(pin.label) + '</div>';
        return L.divIcon({ html: html, className: '', iconSize: [0, 0] });
      }

      function quietly(fn) { quiet += 1; fn(); setTimeout(function() { quiet = Math.max(0, quiet - 1); }, 600); }

      function fitAll() {
        // Fitting a frame smaller than its padding gives Leaflet a NaN zoom,
        // which blanks the map for good. Wait for a real size (onResize retries).
        var size = map.getSize();
        if (size.x < 160 || size.y < 160) return;
        var points = pins.map(function(p) { return [p.lat, p.lng]; });
        if (me) points.push([me.lat, me.lng]);
        // Pins are pills centered on their point, so the right padding covers
        // half a pill plus the map buttons; the bottom clears the legend.
        quietly(function() {
          if (points.length > 1) map.fitBounds(points, { paddingTopLeft: [56, 64], paddingBottomRight: [100, 48], maxZoom: 15 });
          else if (points.length === 1) map.setView(points[0], 15);
        });
      }

      function setCourts(next, fit) {
        pins = next;
        cluster.clearLayers();
        markers = {};
        pins.forEach(function(pin) {
          var marker = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin), title: pin.name, alt: pin.name + ', ' + pin.status, keyboard: true });
          marker.on('click', function(e) { L.DomEvent.stopPropagation(e); send({ type: 'court_selected', courtId: pin.id }); });
          markers[pin.id] = marker;
          cluster.addLayer(marker);
        });
        if (fit) fitAll();
      }

      function select(id) {
        var previous = selectedId;
        selectedId = id;
        [previous, id].forEach(function(key) {
          var pin = pins.find(function(p) { return p.id === key; });
          if (pin && markers[key]) markers[key].setIcon(pinIcon(pin));
        });
        if (id && markers[id]) {
          // Reveal it if it's hidden in a cluster, then pan it into view.
          quietly(function() { cluster.zoomToShowLayer(markers[id], function() { map.panTo(markers[id].getLatLng()); }); });
        }
      }

      function setUser(lat, lng, center) {
        me = { lat: lat, lng: lng };
        if (!window.__meMarker) window.__meMarker = L.marker([lat, lng], { icon: L.divIcon({ html: '<div class="me"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(map);
        else window.__meMarker.setLatLng([lat, lng]);
        if (center) quietly(function() { map.setView([lat, lng], Math.max(map.getZoom(), 14)); });
      }

      function receive(message) {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'set_courts') setCourts(message.pins || [], message.fit);
        else if (message.type === 'select') select(message.id);
        else if (message.type === 'set_user') setUser(message.lat, message.lng, message.center);
        else if (message.type === 'fit') fitAll();
      }

      // Native injects calls to this; web posts messages from the parent page.
      window.__dtReceive = receive;
      window.addEventListener('message', function(event) {
        if (event.source !== window.parent) return;
        try { receive(typeof event.data === 'string' ? JSON.parse(event.data) : event.data); } catch (e) {}
      });

      // The WebView/iframe often starts at 0 or a partial size while the
      // React Native layout settles; re-measure on every resize, and re-fit
      // the pins as long as the player hasn't moved the map themselves.
      var userMoved = false;
      // Only real gestures count as "the player moved the map": Leaflet also
      // fires move events for fits, resizes and cluster zooms.
      var gesture = false;
      function markGesture() { gesture = true; userMoved = true; }
      map.on('dragstart', markGesture);
      var container = map.getContainer();
      container.addEventListener('wheel', markGesture, { passive: true });
      container.addEventListener('dblclick', markGesture);
      container.addEventListener('touchstart', function(e) { if (e.touches && e.touches.length > 1) markGesture(); }, { passive: true });
      function onResize() {
        map.invalidateSize();
        if (!userMoved && pins.length) fitAll();
      }
      if (window.ResizeObserver) new ResizeObserver(onResize).observe(document.getElementById('map'));
      else window.addEventListener('resize', onResize);

      map.on('click', function() { send({ type: 'map_tap' }); });
      map.on('moveend', function() {
        if (quiet || !gesture) return;
        gesture = false;
        var b = map.getBounds();
        send({ type: 'map_moved', bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() } });
      });

      send({ type: 'ready' });
      // The app keeps its loading skeleton up until the basemap has drawn
      // (or 8s pass, so a slow tile server can't hide the pins forever).
      var tilesAnnounced = false;
      function announceTiles() { if (!tilesAnnounced) { tilesAnnounced = true; send({ type: 'tiles_ready' }); } }
      tiles[0].once('load', announceTiles);
      setTimeout(announceTiles, 8000);
    })();
  </script>
</body>
</html>`;
}
