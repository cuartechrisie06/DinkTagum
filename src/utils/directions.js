import { Linking } from "react-native";
import { chooseAction } from "./confirm";

// Universal https links: they open the Google Maps / Waze app when installed
// and fall back to the browser otherwise, on Android, iOS and web alike.
export function directionsUrls(latitude, longitude) {
  const ll = `${latitude},${longitude}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
  };
}

export function hasCoordinates(court) {
  return Number.isFinite(Number(court?.latitude)) && Number.isFinite(Number(court?.longitude))
    && court?.latitude !== null && court?.longitude !== null;
}

const open = (url) => Linking.openURL(url).catch(() => {});

// Google Maps or Waze, as a bottom sheet on every platform.
export function openDirections(court) {
  if (!hasCoordinates(court)) return;
  const urls = directionsUrls(court.latitude, court.longitude);
  chooseAction(`Directions to ${court.name}`, "Open with", [
    { label: "Google Maps", icon: "map-outline", onPress: () => open(urls.google) },
    { label: "Waze", icon: "car-outline", onPress: () => open(urls.waze) },
  ]);
}
