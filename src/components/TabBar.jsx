import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R, S } from "../screens/shared";

const ICONS = {
  index: ["home", "home-outline"],
  courts: ["tennisball", "tennisball-outline"],
  feed: ["chatbubbles", "chatbubbles-outline"],
  history: ["time", "time-outline"],
  directory: ["people", "people-outline"],
  profile: ["person-circle", "person-circle-outline"],
};

// Floating "dock" tab bar. Sized from its content plus the safe-area inset
// rather than a fixed height, so labels are never clipped on small screens.
export function TabBar({ state, descriptors, navigation, hidden }) {
  const insets = useSafeAreaInsets();
  if (hidden) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, S.sm) + 4 }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // expo-router turns `href: null` into a hidden item style.
          if (options.tabBarItemStyle?.display === "none") return null;
          const label = options.title ?? route.name;
          const focused = state.index === index;
          const [activeIcon, idleIcon] = ICONS[route.name] || ["ellipse", "ellipse-outline"];

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.tab, focused && styles.tabActive, pressed && { transform: [{ scale: 0.94 }] }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <Ionicons name={focused ? activeIcon : idleIcon} size={21} color={focused ? C.volt : C.textDim} />
              <Text style={[styles.label, { color: focused ? C.volt : C.textDim }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: C.ink, paddingHorizontal: S.md, paddingTop: S.sm },
  dock: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.line,
    padding: 5,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, paddingVertical: 7, borderRadius: R.lg, minWidth: 0 },
  tabActive: { backgroundColor: C.voltSoft },
  label: { fontSize: 11, fontWeight: "700", marginTop: 3 },
});
