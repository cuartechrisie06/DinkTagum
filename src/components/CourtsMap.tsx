import React, { useCallback, useMemo, useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { generateLeafletHtml, MapCommand } from "./leafletMapHtml";
import { CourtsMapProps, useMapBridge } from "./useMapBridge";

export type { CourtLocation, MapBounds } from "./leafletMapHtml";
export type { CourtsMapProps } from "./useMapBridge";

// Native (Android/iOS): the Leaflet page runs in a WebView, so the same map
// works in Expo Go without a Maps SDK or API key.
export default function CourtsMap(props: CourtsMapProps) {
  const webViewRef = useRef<WebView>(null);
  const html = useMemo(() => generateLeafletHtml(process.env.EXPO_PUBLIC_CARTO_BASEMAP_KEY), []);

  const post = useCallback((command: MapCommand) => {
    // JSON.stringify output is a valid JS expression; `true;` keeps Android quiet.
    webViewRef.current?.injectJavaScript(`window.__dtReceive && window.__dtReceive(${JSON.stringify(command)}); true;`);
  }, []);
  const { handleMessage } = useMapBridge(post, props);

  // Map attribution links open in the system browser, not inside the map.
  const handleShouldStartLoadWithRequest = (request: { url: string }) => {
    if (request.url && !request.url.startsWith("about:") && !request.url.startsWith("data:")) {
      Linking.openURL(request.url).catch(() => {});
      return false;
    }
    return true;
  };

  return (
    <View style={styles.fill}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.fill}
        onMessage={(event: WebViewMessageEvent) => handleMessage(event.nativeEvent.data)}
        javaScriptEnabled
        domStorageEnabled
        // Lets the map pan inside the Courts list on Android instead of the
        // list stealing the drag.
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0B1F1A" },
});
