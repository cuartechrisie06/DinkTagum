export type CourtLocation = {
  id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  status: "Available" | "Full" | "Closed" | null;
  rating: number | string | null;
};

export const TAGUM_LATITUDE = 7.4478;
export const TAGUM_LONGITUDE = 125.8083;
export const TAGUM_ZOOM = 14;

const statusColor = (status: CourtLocation["status"]) => {
  if (status === "Full") return "#D94D4D";
  if (status === "Closed") return "#89928F";
  return "#078B68";
};

export function generateLeafletHtml(courts: CourtLocation[]): string {
  const mappableCourts = courts
    .map((c) => ({
      ...c,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      statusColor: statusColor(c.status),
    }))
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

  // Escaping "<" prevents a court field containing "</script>" from breaking out of the
  // inline <script> tag below when this JSON is embedded directly into the HTML document.
  const courtsJson = JSON.stringify(mappableCourts).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Tagum City Courts Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #06231D;
      overflow: hidden;
      -webkit-user-select: none;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    #map {
      width: 100%;
      height: 100%;
    }
    /* Dark / DinkTagum themed popups */
    .leaflet-popup-content-wrapper {
      background: #06231D !important;
      color: #FFFDEE !important;
      border-radius: 12px !important;
      border: 1px solid rgba(226, 251, 206, 0.25) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
      padding: 4px !important;
    }
    .leaflet-popup-tip {
      background: #06231D !important;
    }
    .leaflet-popup-content {
      margin: 8px 12px !important;
      line-height: 1.4 !important;
    }
    .court-popup-title {
      font-size: 13px;
      font-weight: 700;
      color: #FFFDEE;
      margin-bottom: 4px;
    }
    .court-popup-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .court-popup-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 10px;
      color: #FFFDEE;
    }
    .court-popup-rating {
      color: #E3EF26;
      font-weight: 600;
      font-size: 11px;
    }
    .court-popup-actions {
      display: flex;
      gap: 6px;
    }
    .court-popup-btn {
      flex: 1;
      background-color: #078B68;
      color: #FFFDEE;
      text-align: center;
      padding: 6px 0;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: background-color 0.15s ease;
    }
    .court-popup-btn:active {
      background-color: #05664d;
    }
    .court-popup-dir-btn {
      flex: 1;
      background-color: rgba(226,251,206,0.10);
      color: #E2FBCE;
      text-align: center;
      padding: 6px 0;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(226,251,206,0.25);
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease;
    }
    .court-popup-dir-btn:active {
      background-color: rgba(226,251,206,0.18);
    }
    /* Custom Pin Marker */
    .custom-court-marker {
      background: none;
      border: none;
    }
    .court-pin {
      width: 26px;
      height: 26px;
      border-radius: 50% 50% 50% 0;
      position: absolute;
      transform: rotate(-45deg);
      left: 50%;
      top: 50%;
      margin: -20px 0 0 -13px;
      border: 2px solid #FFFDEE;
      box-shadow: 0 3px 8px rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .court-pin-inner {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background-color: #FFFDEE;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      var TAGUM_LAT = ${TAGUM_LATITUDE};
      var TAGUM_LNG = ${TAGUM_LONGITUDE};
      var TAGUM_ZOOM = ${TAGUM_ZOOM};
      var courts = ${courtsJson};

      // Initialize map centered at Tagum City, Davao del Norte
      var map = L.map('map', {
        zoomControl: true,
        attributionControl: true
      }).setView([TAGUM_LAT, TAGUM_LNG], TAGUM_ZOOM);

      // Esri "World Street Map" basemap: free, no API key required, and colorful
      // (roads, parks, water) instead of the flat dark-gray canvas previously used
      // here. Both tile.openstreetmap.org and Wikimedia's OSM mirror were tried
      // first but return 403 Forbidden for this app's requests; this Esri REST
      // tile service (same host family as the dark-gray canvas it replaces) was
      // verified working (confirmed HTTP 200) and does not require a key, unlike
      // Esri's newer vector basemap/location services.
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom'
      }).addTo(map);

      // Post message back to React Native or Web parent
      function notifyCourtSelected(courtId) {
        var payload = JSON.stringify({ type: 'court_selected', courtId: courtId });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(payload);
        }
        if (window.parent && window.parent.postMessage) {
          window.parent.postMessage(payload, '*');
        }
      }

      window.notifyCourtSelected = notifyCourtSelected;

      // Escape any court field before it is concatenated into an HTML string, since
      // court data comes from the database and must never be trusted as raw markup.
      function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function(ch) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
      }

      // Add markers for Tagum courts
      courts.forEach(function(court) {
        var markerHtml = '<div class="court-pin" style="background-color: ' + court.statusColor + ';">' +
                         '  <div class="court-pin-inner"></div>' +
                         '</div>';

        var customIcon = L.divIcon({
          className: 'custom-court-marker',
          html: markerHtml,
          iconSize: [26, 36],
          iconAnchor: [13, 36],
          popupAnchor: [0, -32]
        });

        var osmUrl = 'https://www.openstreetmap.org/directions?engine=osrm_car&route=;' + court.latitude + ',' + court.longitude + '#map=16/' + court.latitude + '/' + court.longitude;

        var popupContent = '<div class="court-popup-title">' + escapeHtml(court.name || 'Pickleball Court') + '</div>' +
          '<div class="court-popup-meta">' +
          '  <span class="court-popup-badge" style="background-color: ' + court.statusColor + ';">' + escapeHtml(court.status || 'Available') + '</span>' +
          '  <span class="court-popup-rating">★ ' + escapeHtml(court.rating || '—') + '</span>' +
          '</div>' +
          '<div class="court-popup-actions">' +
          '  <button class="court-popup-btn" data-court-id="' + escapeHtml(String(court.id)) + '">View Details</button>' +
          '  <a class="court-popup-dir-btn" href="' + osmUrl + '" target="_blank" rel="noopener noreferrer">Directions</a>' +
          '</div>';

        var marker = L.marker([court.latitude, court.longitude], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);

        // The button's click is wired up after the popup opens (rather than an inline
        // onclick attribute) so the court id never has to be embedded as HTML markup.
        marker.on('popupopen', function(e) {
          var btn = e.popup.getElement() && e.popup.getElement().querySelector('.court-popup-btn');
          if (btn) btn.addEventListener('click', function() { notifyCourtSelected(court.id); });
        });

        marker.on('click', function() {
          notifyCourtSelected(court.id);
        });
      });
    })();
  </script>
</body>
</html>`;
}
