// After-booking actions: calendar, reminder notification, share/invite.
import { Linking, Platform, Share } from "react-native";
import { googleCalendarUrl, reminderTime } from "./booking";

// expo-notifications local reminders work in Expo Go and builds on
// Android/iOS (push needs a build; we don't use push). Not on web.
export const remindersSupported = Platform.OS !== "web";

const CHANNEL_ID = "booking-reminders";
let notificationsReady = null;

// Loaded lazily so the web bundle never touches the native module.
function setUpNotifications() {
  if (!notificationsReady) {
    notificationsReady = (async () => {
      const Notifications = require("expo-notifications");
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Booking reminders", importance: Notifications.AndroidImportance.HIGH });
      }
      return Notifications;
    })().catch((error) => { notificationsReady = null; throw error; });
  }
  return notificationsReady;
}

export function bookingDescription({ courtName, start, end }) {
  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${courtName} · ${date} · ${fmt(start)} – ${fmt(end)}`;
}

// { ok, message } — message is user-facing either way.
export async function scheduleBookingReminder({ courtName, start }) {
  if (!remindersSupported) return { ok: false, message: "Reminders are available in the phone app." };
  const at = reminderTime(start);
  if (!at) return { ok: false, message: "Your game starts too soon for a reminder." };
  try {
    const Notifications = await setUpNotifications();
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return { ok: false, message: "Allow notifications for DinkTagum in your phone settings to get reminders." };
    await Notifications.scheduleNotificationAsync({
      content: { title: "Pickleball soon 🏓", body: `${courtName} at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Time to head out!` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
    const minutes = Math.round((start.getTime() - at.getTime()) / 60000);
    return { ok: true, message: `We'll remind you ${minutes >= 60 ? "1 hour" : `${minutes} minutes`} before.` };
  } catch (error) {
    return { ok: false, message: error?.message || "The reminder could not be scheduled." };
  }
}

export function addBookingToCalendar({ courtName, address, start, end }) {
  const url = googleCalendarUrl({ title: `Pickleball at ${courtName}`, details: "Booked with DinkTagum.", location: address, start, end });
  return Linking.openURL(url).catch(() => {});
}

export function shareBooking({ courtName, start, end }) {
  const message = `I booked a pickleball court! ${bookingDescription({ courtName, start, end })}. Join me on DinkTagum 🏓`;
  return Share.share({ message, title: "Join my game" }).catch(() => {});
}
