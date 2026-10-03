import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { CourtLocation, generateLeafletHtml } from "./leafletMapHtml";

export type { CourtLocation };

type CourtsMapProps = {
  courts: CourtLocation[];
  onCourtPress: (court: CourtLocation) => void;
};

export default function CourtsMap({ courts, onCourtPress }: CourtsMapProps) {
  const htmlContent = useMemo(() => generateLeafletHtml(courts), [courts]);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "court_selected" && data.courtId) {
          const found = courts.find((c) => c.id === data.courtId);
          if (found) {
            onCourtPress(found);
          }
        }
      } catch {
        // ignore non-JSON or other window messages
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [courts, onCourtPress]);

  return (
    <View style={styles.container}>
      <iframe
        srcDoc={htmlContent}
        // No allow-same-origin: the map iframe runs in an isolated opaque origin and can
        // only talk back to this page via postMessage, even if its content were ever compromised.
        // allow-popups is added so the "Directions" link can open OSM in a new tab.
        sandbox="allow-scripts allow-popups"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#06231D",
        }}
        title="Tagum City Pickleball Courts Leaflet Map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 240,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#06231D",
    borderWidth: 1,
    borderColor: "rgba(226,251,206,0.14)",
  },
});
