import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { buildDayOptions, slotHasStarted, slotOverlapsBusy } from "../context/DashboardContext";
import { BackButton, Button, C, ErrorNote, Icon, S, SectionTitle, StatusPill, styles } from "./shared";

// A slot can't be booked once it has started or when it overlaps a reservation.
function slotUnavailable(dayDate, timeLabel, busyRanges, now) {
  return slotHasStarted(dayDate, timeLabel, now) || slotOverlapsBusy(dayDate, timeLabel, busyRanges);
}

const SLOTS = ["6:00 AM", "7:00 AM", "8:00 AM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"];

export function CourtDetail({ court, onBack, reserve, reserving, loadBusySlots }) {
  const dayOptions = useMemo(() => buildDayOptions(3), []);
  const [dayKey, setDayKey] = useState(dayOptions[0].key);
  const [slot, setSlot] = useState("4:00 PM");
  const [notice, setNotice] = useState("");
  const [booked, setBooked] = useState(false);
  const [busyRanges, setBusyRanges] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const selectedDay = dayOptions.find((day) => day.key === dayKey) || dayOptions[0];
  // Refreshed whenever availability reloads, so slots that started while the
  // screen was open are disabled too.
  const [now, setNow] = useState(() => Date.now());
  const bookingDisabled = reserving || availabilityLoading || court.status === "Closed" || court.status === "Full";

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAvailabilityLoading(true);
      const ranges = await loadBusySlots(court.id, dayKey);
      if (!active) return;
      const loadedAt = Date.now();
      setNow(loadedAt);
      setBusyRanges(ranges);
      setAvailabilityLoading(false);
      setBooked(false);
      setNotice("");
      setSlot((currentSlot) => {
        if (!slotUnavailable(selectedDay.date, currentSlot, ranges, loadedAt)) return currentSlot;
        return SLOTS.find((candidate) => !slotUnavailable(selectedDay.date, candidate, ranges, loadedAt)) || currentSlot;
      });
    };
    load();
    return () => { active = false; };
  }, [court.id, dayKey, loadBusySlots, selectedDay.date]);

  const submitReservation = async () => {
    setNotice("");
    if (slotOverlapsBusy(selectedDay.date, slot, busyRanges)) {
      setNotice("That slot is already reserved. Pick another time.");
      return;
    }
    const result = await reserve(court, dayKey, slot);
    if (result.ok) {
      setBooked(true);
      setNotice("Reservation submitted. We will notify you when it is confirmed.");
      const ranges = await loadBusySlots(court.id, dayKey);
      setBusyRanges(ranges);
    } else {
      setNotice(result.message || "We could not submit this reservation. Please try again.");
      setNow(Date.now());
    }
  };

  const slotTaken = slotUnavailable(selectedDay.date, slot, busyRanges, now);
  const dayFullyUnavailable = SLOTS.every((s) => slotUnavailable(selectedDay.date, s, busyRanges, now));
  const hasCoords = Number.isFinite(court.latitude) && Number.isFinite(court.longitude);
  const openDirections = () => {
    // OpenStreetMap directions URL — works on all platforms (iOS, Android, web)
    const osmUrl = `https://www.openstreetmap.org/directions?engine=osrm_car&route=;${court.latitude},${court.longitude}#map=16/${court.latitude}/${court.longitude}`;
    Linking.openURL(osmUrl).catch(() => {
      // Fallback: plain OSM map centered on the court
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${court.latitude}&mlon=${court.longitude}&zoom=17`);
    });
  };
  const cover = court.photoUrls[0];
  const infoRows = [
    ["location-outline", "ADDRESS", court.address],
    court.contactPhone ? ["call-outline", "CONTACT", `${court.contactName ? `${court.contactName} · ` : ""}${court.contactPhone}`] : null,
    court.hourlyRate !== null ? ["cash-outline", "HOURLY RATE", `₱${court.hourlyRate.toFixed(2)} per hour`] : null,
    court.scheduleNote ? ["calendar-outline", "SCHEDULE", court.scheduleNote] : null,
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.detailHero}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFillObject} /> : (
            <LinearGradient colors={[C.brand, C.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
              <Icon name="tennisball" size={56} color="rgba(227,239,38,0.35)" />
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", C.ink]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }} />
          <View style={styles.detailBack}><BackButton onPress={onBack} /></View>
        </View>

        <View style={{ paddingHorizontal: S.xl, marginTop: -S.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, paddingRight: S.md }}>
              <Text style={styles.detailName} accessibilityRole="header">{court.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <Icon name="location-outline" size={14} color={C.textDim} />
                <Text style={styles.detailSub}>{court.area} · {court.dist}</Text>
              </View>
            </View>
            <StatusPill status={court.status} />
          </View>

          <View style={styles.statRow}>
            {[["time-outline", court.hours], ["grid-outline", `${court.courts} court${court.courts === 1 ? "" : "s"}`], ["star", `${Number(court.rating || 0).toFixed(1)} rating`]].map(([g, t], i) => (
              <View key={i} style={styles.statBox}>
                <Icon name={g} size={18} color={C.volt} />
                <Text style={styles.statText} numberOfLines={2}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={styles.courtInfoCard}>
            {infoRows.map(([icon, label, text]) => (
              <View key={label} style={styles.infoRow}>
                <View style={styles.infoIcon}><Icon name={icon} size={16} color={C.volt} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courtInfoLabel}>{label}</Text>
                  <Text style={styles.courtInfoText}>{text}</Text>
                </View>
              </View>
            ))}
          </View>

          {hasCoords ? (
            <Button variant="secondary" icon="navigate-outline" label="Get directions" onPress={openDirections} style={{ marginTop: S.md }} />
          ) : null}

          {court.amenities.length ? (
            <View style={styles.amenitiesRow}>
              {court.amenities.map((a) => (
                <View key={a} style={styles.amenityPill}><Icon name="checkmark-circle" size={14} color={C.volt} /><Text style={styles.amenityText}>{a}</Text></View>
              ))}
            </View>
          ) : null}

          {court.photoUrls.length > 1 ? <View style={{ marginTop: S.xl }}><SectionTitle>Photos</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>{court.photoUrls.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.courtGalleryImage} />)}</ScrollView></View> : null}

          <View style={{ marginTop: S.xxl }}>
            <SectionTitle>Reserve a slot</SectionTitle>
          </View>
          {court.status === "Full" || court.status === "Closed" ? (
            <ErrorNote style={{ marginHorizontal: 0 }}>This court is {court.status.toLowerCase()} and cannot accept new reservations.</ErrorNote>
          ) : null}
          <View style={{ flexDirection: "row", marginTop: S.md, gap: S.sm }}>
            {dayOptions.map((day) => {
              const active = dayKey === day.key;
              return (
                <TouchableOpacity
                  key={day.key}
                  onPress={() => setDayKey(day.key)}
                  style={[styles.dateChip, active && { backgroundColor: C.volt, borderColor: C.volt }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.dateChipText, active && { color: C.ink }]}>{day.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {availabilityLoading ? <ActivityIndicator color={C.volt} style={{ marginTop: S.lg }} /> : (
            <View style={styles.slotGrid}>
              {SLOTS.map((s) => {
                const isBooked = slotOverlapsBusy(selectedDay.date, s, busyRanges);
                const isPast = slotHasStarted(selectedDay.date, s, now);
                const blocked = isBooked || isPast;
                const active = slot === s && !blocked;
                return (
                  <TouchableOpacity
                    key={s}
                    disabled={blocked || bookingDisabled}
                    onPress={() => setSlot(s)}
                    style={[
                      styles.slotBtn,
                      { borderColor: active ? C.volt : C.line },
                      active && { backgroundColor: C.voltSoft },
                      blocked && { backgroundColor: "rgba(255,253,238,0.03)", borderColor: "transparent" },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: blocked || bookingDisabled }}
                    accessibilityLabel={isBooked ? `${s}, already booked` : isPast ? `${s}, already started` : s}
                  >
                    <Text style={[
                      styles.slotText,
                      { color: blocked ? "rgba(255,253,238,0.25)" : active ? C.volt : C.paper },
                      isBooked && { textDecorationLine: "line-through" },
                    ]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {!availabilityLoading && dayFullyUnavailable ? (
            <Text style={[styles.mapDescription, { marginTop: S.sm }]}>No open slots left on this day — try another day.</Text>
          ) : null}
          {notice ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: S.md }}>
              <Icon name={booked ? "checkmark-circle" : "information-circle-outline"} size={18} color={booked ? C.volt : C.butter} />
              <Text style={{ color: C.mist, fontSize: 13.5, lineHeight: 19, marginLeft: S.sm, flex: 1 }}>{notice}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.bookingBar}>
        <Button
          icon={booked ? "checkmark-circle" : "calendar"}
          label={booked ? `Reserved for ${slot}` : dayFullyUnavailable ? "No open slots on this day" : `Book ${selectedDay.label} · ${slot}`}
          onPress={submitReservation}
          loading={reserving}
          disabled={bookingDisabled || slotTaken}
        />
      </SafeAreaView>
    </View>
  );
}
