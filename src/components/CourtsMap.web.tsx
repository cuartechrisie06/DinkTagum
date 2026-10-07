import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { generateLeafletHtml, MapCommand } from "./leafletMapHtml";
import { CourtsMapProps, useMapBridge } from "./useMapBridge";

export type { CourtLocation, MapBounds } from "./leafletMapHtml";
export type { CourtsMapProps } from "./useMapBridge";

// Web: the same Leaflet page in a sandboxed iframe, talking over postMessage.
export default function CourtsMap(props: CourtsMapProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => generateLeafletHtml(process.env.EXPO_PUBLIC_CARTO_BASEMAP_KEY), []);

  const post = useCallback((command: MapCommand) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(command), "*");
  }, []);
  const { handleMessage } = useMapBridge(post, props);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only trust messages from our own map frame.
      if (event.source !== frameRef.current?.contentWindow) return;
      handleMessage(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleMessage]);

  return (
    <View style={styles.fill}>
      <iframe
        ref={frameRef}
        srcDoc={html}
        // No allow-same-origin: the map runs in an opaque origin and can only
        // reach this page via postMessage. allow-popups lets attribution links open.
        sandbox="allow-scripts allow-popups"
        style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#0B1F1A", display: "block" }}
        title="Map of pickleball courts in Tagum City"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0B1F1A" },
});
