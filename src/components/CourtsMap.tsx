import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { CourtLocation, generateLeafletHtml } from "./leafletMapHtml";

export type { CourtLocation };

type CourtsMapProps = {
  courts: CourtLocation[];
  onCourtPress: (court: CourtLocation) => void;
};

export default function CourtsMap({ courts, onCourtPress }: CourtsMapProps) {
  const htmlContent = useMemo(() => generateLeafletHtml(courts), [courts]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "court_selected" && data.courtId) {
        const found = courts.find((c) => c.id === data.courtId);
        if (found) {
          onCourtPress(found);
        }
      }
    } catch {
      // ignore malformed message
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#E3EF26" />
            <Text style={styles.loadingText}>Loading Tagum Map...</Text>
          </View>
        )}
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
  map: {
    width: "100%",
    height: "100%",
    backgroundColor: "#06231D",
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#06231D",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#FFFDEE",
    fontSize: 12,
    marginTop: 8,
  },
});
