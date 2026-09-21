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

  const courtsJson = JSON.stringify(mappableCourts);

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
    .court-popup-btn {
      display: block;
      width: 100%;
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

      // OpenStreetMap standard tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

        var popupContent = '<div class="court-popup-title">' + (court.name || 'Pickleball Court') + '</div>' +
          '<div class="court-popup-meta">' +
          '  <span class="court-popup-badge" style="background-color: ' + court.statusColor + ';">' + (court.status || 'Available') + '</span>' +
          '  <span class="court-popup-rating">★ ' + (court.rating || '—') + '</span>' +
          '</div>' +
          '<button class="court-popup-btn" onclick="notifyCourtSelected(\\'' + court.id + '\\')">View Details</button>';

        var marker = L.marker([court.latitude, court.longitude], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);

        marker.on('click', function() {
          notifyCourtSelected(court.id);
        });
      });
    })();
  </script>
</body>
</html>`;
}
