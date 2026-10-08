import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { buildDayOptions, canCancelReservation, slotHasStarted, slotOverlapsBusy, useDashboard } from "../context/DashboardContext";
import { BackButton, Button, C, CourtArt, ErrorNote, Icon, R, S, SectionTitle, StatusPill, styles, useTopInset } from "./shared";
import { CourtOpenPlay } from "./OpenPlay";
import { SLOT_COLORS, SLOT_LEGEND } from "./slotColors";
import { openDirections } from "../utils/directions";
import { BOOKING_SLOTS, distanceFromCenterLabel, ratingLabel } from "../utils/courts";
import { bookingPrice, findNextAvailable, partitionSlots, peso, reviewBarText, selectionAvailable, selectionSlots, slotStart, timeRangeLabel, toggleSlot } from "../utils/booking";
import { addBookingToCalendar, remindersSupported, scheduleBookingReminder, shareBooking } from "../utils/bookingActions";
import { confirmAction, notify } from "../utils/confirm";
import { calendarBookingFor, canAddToCalendar } from "../utils/reservations";
import { RESERVATION_STATUS } from "./reservationStatus";
import { reservationTime } from "../utils/format";

const SLOTS = BOOKING_SLOTS;
const BOOKING_DAYS = 7;

function firstFree(dayDate, busy, now) {
  return SLOTS.find((s) => !slotHasStarted(dayDate, s, now) && !slotOverlapsBusy(dayDate, s, busy)) || null;
}

// Court, date, time and status for one reservation.
export function BookingStatusCard({ reservation, courtName, onCancel, onAddToCalendar, cancelling }) {
  const status = RESERVATION_STATUS[reservation.status] || RESERVATION_STATUS.pending;
  const actions = onCancel || onAddToCalendar;
  return (
    <View style={detailStyles.statusCard} accessibilityLabel={`${courtName}, ${reservationTime(reservation)}, ${status.label}`}>
      <View style={styles.infoIcon}><Icon name="calendar" size={16} color={C.volt} /></View>
      <View style={{ flex: 1 }}>
        <Text style={detailStyles.statusCourt} numberOfLines={1}>{courtName}</Text>
        <Text style={styles.playerSub}>{reservationTime(reservation)}</Text>
        <View style={[detailStyles.statusPill, { backgroundColor: status.bg }]}>
          <Icon name={status.icon} size={12} color={status.fg} />
          <Text style={[detailStyles.statusPillText, { color: status.fg }]}>{status.label}</Text>
        </View>
        {actions ? (
          <View style={detailStyles.cardActions}>
            {onAddToCalendar ? <Button variant="ghost" icon="calendar-outline" label="Add to calendar" onPress={onAddToCalendar} style={detailStyles.cardActionBtn} accessibilityLabel={`Add ${courtName} booking to calendar`} /> : null}
            {onCancel ? <Button variant="ghost" icon="close-circle-outline" label={cancelling ? "Cancelling…" : "Cancel"} onPress={onCancel} disabled={cancelling} style={detailStyles.cardActionBtn} accessibilityLabel={`Cancel ${courtName} booking`} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SummaryRow({ label, value, strong }) {
  return (
    <View style={detailStyles.summaryRow}>
      <Text style={[detailStyles.summaryLabel, strong && { color: C.paper, fontWeight: "800" }]}>{label}</Text>
      <Text style={[detailStyles.summaryValue, strong && { color: C.volt, fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

function FollowUp({ icon, label, hint, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={detailStyles.followUp} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}>
      <View style={styles.infoIcon}><Icon name={icon} size={16} color={C.volt} /></View>
      <View style={{ flex: 1 }}>
        <Text style={detailStyles.followUpLabel}>{label}</Text>
        {hint ? <Text style={styles.profileHint}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={C.textDim} />
    </TouchableOpacity>
  );
}

// Review step, then the result with calendar / reminder / invite follow-ups.
// Mounted only while open: react-native-web stacks Modals by mount order.
function ConfirmBookingSheet({ court, day, selection, reserving, onConfirm, onClose, result }) {
  const start = slotStart(day.date, selection.start);
  const end = new Date(start.getTime() + selection.hours * 3600 * 1000);
  const price = bookingPrice(court.hourlyRate, selection.hours);
  const booking = { courtName: court.name, address: court.address, start, end };
  const remind = async () => {
    const outcome = await scheduleBookingReminder(booking);
    notify(outcome.ok ? "Reminder set" : "Couldn't set a reminder", outcome.message, outcome.ok ? "success" : "error");
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={detailStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <SafeAreaView edges={["bottom"]} style={detailStyles.sheet}>
          <View style={detailStyles.handle} />
          {result ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <Icon name="checkmark-circle" size={24} color={C.volt} />
                <Text style={detailStyles.sheetTitle} accessibilityRole="header">Booking requested</Text>
              </View>
              <Text style={[styles.profileHint, { marginTop: 4 }]}>The venue confirms bookings. We&apos;ll notify you when it&apos;s confirmed.</Text>
              <View style={{ marginTop: S.lg }}><BookingStatusCard reservation={result} courtName={court.name} /></View>
              <View style={{ marginTop: S.md, gap: S.sm }}>
                <FollowUp icon="calendar-outline" label="Add to calendar" hint="Opens Google Calendar with the details filled in" onPress={() => addBookingToCalendar(booking)} />
                {remindersSupported ? <FollowUp icon="notifications-outline" label="Remind me" hint="A notification before your game" onPress={remind} /> : null}
                <FollowUp icon="share-social-outline" label="Invite friends" hint="Share the time and place" onPress={() => shareBooking(booking)} />
              </View>
              <Button label="Done" onPress={onClose} style={{ marginTop: S.lg }} />
            </>
          ) : (
            <>
              <Text style={detailStyles.sheetTitle} accessibilityRole="header">Confirm your booking</Text>
              <View style={detailStyles.summary}>
                <SummaryRow label="Court" value={court.name} />
                <SummaryRow label="Date" value={start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} />
                <SummaryRow label="Time" value={`${timeRangeLabel(day.date, selection)} (${selection.hours} hr${selection.hours === 1 ? "" : "s"})`} />
                {price ? (
                  <>
                    <SummaryRow label="Price" value={`${peso(price.perHour)} × ${price.hours}`} />
                    <View style={detailStyles.summaryDivider} />
                    <SummaryRow label="Total" value={peso(price.total)} strong />
                  </>
                ) : <SummaryRow label="Price" value="Pay at the venue" />}
              </View>
              <Text style={styles.profileHint}>Bookings start as pending until the venue confirms them. You can cancel from History.</Text>
              <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
                <Button variant="ghost" label="Back" onPress={onClose} disabled={reserving} style={{ flex: 1, minHeight: 52 }} />
                <Button icon="checkmark" label={price ? `Book · ${peso(price.total)}` : "Book"} onPress={onConfirm} loading={reserving} style={{ flex: 2 }} />
              </View>
            </>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function CourtDetail({ court: initialCourt, onBack, reserve, reserving, loadBusySlots }) {
  const { courts, reservations, hasLocation, findNearbyCourts, locationLoading, locationMessage, cancelReservation } = useDashboard();
  // The live copy picks up distance once location arrives, favorites, etc.
  const court = courts.find((c) => c.id === initialCourt.id) || initialCourt;
  const top = useTopInset();
  const dayOptions = useMemo(() => buildDayOptions(BOOKING_DAYS), []);
  const [dayKey, setDayKey] = useState(dayOptions[0].key);
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState("");
  const [busyRanges, setBusyRanges] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [nextAvailable, setNextAvailable] = useState(null);
  const [searchingNext, setSearchingNext] = useState(false);
  // Snapshot of { day, selection } while the confirm sheet is open, so the
  // sheet keeps showing what was booked after the selection resets.
  const [review, setReview] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);
  const selectedDay = dayOptions.find((day) => day.key === dayKey) || dayOptions[0];
  // Refreshed whenever availability reloads, so slots that started while the
  // screen was open are disabled too.
  const [now, setNow] = useState(() => Date.now());
  // Slots that already started today are collapsed unless the player asks.
  const [startedShownFor, setStartedShownFor] = useState(null);
  const showStarted = startedShownFor === dayKey;
  const { upcoming: upcomingSlots, started: startedSlots } = partitionSlots(SLOTS, selectedDay.date, now);
  const gridSlots = showStarted ? SLOTS : upcomingSlots;
  const closedForBooking = court.status === "Closed" || court.status === "Full";
  const bookingDisabled = reserving || availabilityLoading || closedForBooking;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAvailabilityLoading(true);
      setNextAvailable(null);
      const ranges = await loadBusySlots(court.id, dayKey);
      if (!active) return;
      const loadedAt = Date.now();
      setNow(loadedAt);
      setBusyRanges(ranges);
      setAvailabilityLoading(false);
      setNotice("");
      // Keep a still-valid selection; otherwise preselect the first free slot.
      setSelection((current) => {
        if (current && selectionAvailable(selectedDay.date, current, ranges, loadedAt)) return current;
        const free = firstFree(selectedDay.date, ranges, loadedAt);
        return free ? { start: free, hours: 1 } : null;
      });
    };
    load();
    return () => { active = false; };
  }, [court.id, dayKey, loadBusySlots, selectedDay.date]);

  const dayFullyUnavailable = !availabilityLoading && !firstFree(selectedDay.date, busyRanges, now);

  // A full day shouldn't be a dead end: look ahead for the next opening.
  useEffect(() => {
    if (!dayFullyUnavailable || closedForBooking) return undefined;
    let active = true;
    const later = dayOptions.slice(dayOptions.indexOf(selectedDay) + 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- spinner while the async look-ahead runs
    setSearchingNext(true);
    findNextAvailable(later, (day) => loadBusySlots(court.id, day.key)).then((found) => {
      if (!active) return;
      setNextAvailable(found);
      setSearchingNext(false);
    });
    return () => { active = false; };
  }, [dayFullyUnavailable, closedForBooking, dayOptions, selectedDay, loadBusySlots, court.id]);

  const jumpToNext = () => {
    if (!nextAvailable) return;
    setSelection({ start: nextAvailable.label, hours: 1 });
    setDayKey(nextAvailable.day.key);
  };

  const confirmBooking = async () => {
    if (!selection || !selectionAvailable(selectedDay.date, selection, busyRanges, Date.now())) {
      setReview(null);
      setNotice("That time was just taken or has started. Pick another slot.");
      return;
    }
    const result = await reserve(court, dayKey, selection.start, selection.hours);
    if (result.ok) {
      setBookingResult(result.reservation);
      const ranges = await loadBusySlots(court.id, dayKey);
      setBusyRanges(ranges);
      setSelection(null);
    } else {
      setReview(null);
      setNotice(result.message || "We could not submit this reservation. Please try again.");
      setNow(Date.now());
    }
  };

  const closeSheet = () => { setReview(null); setBookingResult(null); };

  const [cancellingId, setCancellingId] = useState("");
  const cancelBooking = async (r) => {
    if (!(await confirmAction("Cancel booking?", `Cancel ${court.name} on ${reservationTime(r)}? The slot opens up for other players.`, "Cancel booking"))) return;
    setCancellingId(r.id);
    const ok = await cancelReservation(r.id);
    setCancellingId("");
    if (ok) setBusyRanges(await loadBusySlots(court.id, dayKey));
  };

  // After "Host + book" reserves a slot, redraw the grid if it's this day.
  const refreshAvailability = async (bookedDayKey) => {
    if (bookedDayKey !== dayKey) return;
    setBusyRanges(await loadBusySlots(court.id, dayKey));
    setSelection(null);
  };

  const myUpcoming = reservations
    .filter((r) => r.court_id === court.id && r.status !== "cancelled" && new Date(r.end_time || r.start_time).getTime() > now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const hasCoords = Number.isFinite(court.latitude) && Number.isFinite(court.longitude);
  const knownDistance = court.dist && court.dist !== "Distance unavailable" ? court.dist : null;
  const centerDistance = knownDistance ? null : distanceFromCenterLabel(court);
  const cover = court.photoUrls[0];
  const infoRows = [
    ["location-outline", "ADDRESS", court.address],
    court.contactPhone ? ["call-outline", "CONTACT", `${court.contactName ? `${court.contactName} · ` : ""}${court.contactPhone}`] : null,
    court.hourlyRate !== null ? ["cash-outline", "HOURLY RATE", `${peso(court.hourlyRate)} per hour`] : null,
    court.scheduleNote ? ["calendar-outline", "SCHEDULE", court.scheduleNote] : null,
  ].filter(Boolean);

  const reviewText = reviewBarText({
    selection,
    hourlyRate: court.hourlyRate,
    dayLabel: selectedDay.label,
    rangeLabel: selection ? timeRangeLabel(selectedDay.date, selection) : "",
  });
  let barLabel = reviewText.label;
  if (closedForBooking) barLabel = `Court ${court.status.toLowerCase()}`;
  else if (dayFullyUnavailable) barLabel = selectedDay.label === "Today" ? "No open slots today" : "No open slots on this day";

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.detailHero}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFillObject} accessibilityIgnoresInvertColors /> : <CourtArt />}
          <LinearGradient colors={["transparent", C.ink]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }} />
          <View style={[styles.detailBack, { top: top + S.sm }]}><BackButton onPress={onBack} /></View>
        </View>

        <View style={{ paddingHorizontal: S.xl, marginTop: -S.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, paddingRight: S.md }}>
              <Text style={styles.detailName} accessibilityRole="header">{court.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <Icon name="location-outline" size={14} color={C.textDim} />
                <Text style={[styles.detailSub, { flexShrink: 1 }]}>{court.area}{knownDistance ? ` · ${knownDistance} away` : centerDistance ? ` · ${centerDistance}` : ""}</Text>
              </View>
            </View>
            <StatusPill status={court.status} />
          </View>

          {!hasLocation ? (
            <TouchableOpacity onPress={findNearbyCourts} disabled={locationLoading} style={detailStyles.locationPrompt} accessibilityRole="button" accessibilityLabel="Show how far this court is from you">
              {locationLoading ? <ActivityIndicator size="small" color={C.volt} /> : <Icon name="navigate" size={15} color={C.volt} />}
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.locationTitle}>{locationLoading ? "Finding your location…" : "How far is this from you?"}</Text>
                <Text style={styles.profileHint}>{locationMessage || "Allow location to see your distance. We only use it while the app is open."}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.statRow}>
            {[["time-outline", court.hours], ["grid-outline", `${court.courts} court${court.courts === 1 ? "" : "s"}`], ["star", ratingLabel(court) === "New" ? "Not rated yet" : `${ratingLabel(court)} rating`]].map(([g, t], i) => (
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
            <Button variant="secondary" icon="navigate-outline" label="Get directions" onPress={() => openDirections(court)} style={{ marginTop: S.md, minHeight: 48 }} />
          ) : null}

          {court.amenities.length ? (
            <View style={styles.amenitiesRow}>
              {court.amenities.map((a) => (
                <View key={a} style={styles.amenityPill}><Icon name="checkmark-circle" size={14} color={C.volt} /><Text style={styles.amenityText}>{a}</Text></View>
              ))}
            </View>
          ) : null}

          {court.photoUrls.length > 1 ? <View style={{ marginTop: S.xl }}><SectionTitle>Photos</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>{court.photoUrls.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.courtGalleryImage} accessibilityLabel={`${court.name} photo ${index + 1}`} />)}</ScrollView></View> : null}

          {myUpcoming.length ? (
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Your bookings here</SectionTitle>
              <View style={{ marginTop: S.md, gap: S.sm }}>
                {myUpcoming.map((r) => (
                  <BookingStatusCard
                    key={r.id}
                    reservation={r}
                    courtName={court.name}
                    cancelling={cancellingId === r.id}
                    onCancel={canCancelReservation(r, now) ? () => cancelBooking(r) : undefined}
                    onAddToCalendar={canAddToCalendar(r, now) ? () => addBookingToCalendar(calendarBookingFor(r, court)) : undefined}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <CourtOpenPlay court={court} onBooked={refreshAvailability} />

          <View style={{ marginTop: S.xxl }}>
            <SectionTitle>Reserve a slot</SectionTitle>
            <Text style={styles.mapDescription}>{court.hourlyRate !== null ? `${peso(court.hourlyRate)} per hour. ` : ""}Tap the next hour to book longer.</Text>
          </View>
          {closedForBooking ? (
            <ErrorNote style={{ marginHorizontal: 0 }}>This court is {court.status.toLowerCase()} and cannot accept new reservations.</ErrorNote>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md, flexGrow: 0 }} contentContainerStyle={{ gap: S.sm }}>
            {dayOptions.map((day) => {
              const active = dayKey === day.key;
              return (
                <TouchableOpacity
                  key={day.key}
                  onPress={() => setDayKey(day.key)}
                  style={[styles.dateChip, detailStyles.dayChip, active && { backgroundColor: C.volt, borderColor: C.volt }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={day.label}
                >
                  <Text style={[styles.dateChipText, active && { color: C.ink }]}>{day.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={detailStyles.legend}>
            {SLOT_LEGEND.map(([label, key]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[detailStyles.legendSwatch, { backgroundColor: SLOT_COLORS[key].bg, borderColor: SLOT_COLORS[key].border, borderStyle: SLOT_COLORS[key].borderStyle }]} />
                <Text style={[styles.profileHint, { color: C.textDim }]}>{label}</Text>
              </View>
            ))}
          </View>

          {!availabilityLoading && startedSlots.length ? (
            <TouchableOpacity onPress={() => setStartedShownFor(showStarted ? null : dayKey)} style={detailStyles.startedToggle} accessibilityRole="button" accessibilityState={{ expanded: showStarted }} accessibilityLabel={showStarted ? "Hide slots that already started" : `Show ${startedSlots.length} slots that already started`}>
              <Icon name={showStarted ? "chevron-up" : "time-outline"} size={15} color={C.textDim} />
              <Text style={detailStyles.startedToggleText}>
                {showStarted ? "Hide earlier slots" : `${startedSlots.length} earlier slot${startedSlots.length === 1 ? " has" : "s have"} started · Show`}
              </Text>
            </TouchableOpacity>
          ) : null}

          {availabilityLoading ? <ActivityIndicator color={C.volt} style={{ marginTop: S.lg }} /> : gridSlots.length ? (
            <View style={styles.slotGrid}>
              {gridSlots.map((s) => {
                const isBooked = slotOverlapsBusy(selectedDay.date, s, busyRanges);
                const isPast = slotHasStarted(selectedDay.date, s, now);
                const blocked = isBooked || isPast;
                const active = selectionSlots(selection).includes(s) && !blocked;
                const look = SLOT_COLORS[isBooked ? "taken" : isPast ? "started" : active ? "selected" : "free"];
                return (
                  <TouchableOpacity
                    key={s}
                    disabled={blocked || bookingDisabled}
                    onPress={() => setSelection((current) => toggleSlot(current, s, selectedDay.date, busyRanges, Date.now()))}
                    style={[
                      styles.slotBtn,
                      detailStyles.slot,
                      { backgroundColor: look.bg, borderColor: look.border, borderStyle: look.borderStyle },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: blocked || bookingDisabled }}
                    accessibilityLabel={isBooked ? `${s}, already booked` : isPast ? `${s}, already started` : `${s}${court.hourlyRate !== null ? `, ${peso(court.hourlyRate)}` : ""}${active ? ", selected" : ""}`}
                  >
                    <Text style={[styles.slotText, { color: look.text }, isBooked && { textDecorationLine: "line-through" }]}>{s}</Text>
                    <Text style={[detailStyles.slotSub, { color: look.sub }]}>
                      {isBooked ? "Taken" : isPast ? "Started" : court.hourlyRate !== null ? peso(court.hourlyRate) : "Free"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {dayFullyUnavailable && !closedForBooking ? (
            <View style={detailStyles.nextCard}>
              <Icon name="calendar-outline" size={18} color={C.butter} />
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.nextTitle}>No open slots {selectedDay.label === "Today" ? "today" : `on ${selectedDay.label}`}</Text>
                <Text style={styles.profileHint}>
                  {searchingNext ? "Looking for the next opening…" : nextAvailable ? `Next available: ${nextAvailable.day.label} · ${nextAvailable.label}` : "Nothing open in the next week. Try open play instead."}
                </Text>
              </View>
              {nextAvailable ? (
                <Button variant="secondary" label={nextAvailable.day.label === "Tomorrow" ? "Tomorrow" : "Next day"} icon="arrow-forward" onPress={jumpToNext} style={{ minHeight: 44 }} accessibilityLabel={`Jump to ${nextAvailable.day.label} at ${nextAvailable.label}`} />
              ) : searchingNext ? <ActivityIndicator color={C.volt} /> : null}
            </View>
          ) : null}

          {notice ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: S.md }} accessibilityLiveRegion="polite">
              <Icon name="information-circle-outline" size={18} color={C.butter} />
              <Text style={{ color: C.mist, fontSize: 13.5, lineHeight: 19, marginLeft: S.sm, flex: 1 }}>{notice}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.bookingBar}>
        {reviewText.summary && !dayFullyUnavailable && !closedForBooking ? (
          <Text style={detailStyles.barPrice} accessibilityLiveRegion="polite">{reviewText.summary}</Text>
        ) : null}
        <Button
          icon="calendar"
          label={barLabel}
          onPress={() => setReview({ day: selectedDay, selection })}
          disabled={bookingDisabled || !selection || dayFullyUnavailable}
        />
      </SafeAreaView>

      {review ? (
        <ConfirmBookingSheet court={court} day={review.day} selection={review.selection} reserving={reserving} onConfirm={confirmBooking} onClose={closeSheet} result={bookingResult} />
      ) : null}
    </View>
  );
}

const detailStyles = StyleSheet.create({
  locationPrompt: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 56, marginTop: S.lg, padding: S.md, borderRadius: R.md, backgroundColor: C.voltSoft, borderWidth: 1, borderColor: "rgba(227,239,38,0.25)" },
  locationTitle: { color: C.paper, fontSize: 14, fontWeight: "700" },
  dayChip: { flex: 0, minWidth: 92, minHeight: 44, paddingHorizontal: S.md, justifyContent: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: S.lg, rowGap: S.xs, marginTop: S.md },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  slot: { minHeight: 56, justifyContent: "center" },
  slotSub: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  nextCard: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: S.md, padding: S.md, borderRadius: R.md, backgroundColor: "rgba(255,239,179,0.08)", borderWidth: 1, borderColor: "rgba(255,239,179,0.25)" },
  nextTitle: { color: C.paper, fontSize: 14, fontWeight: "700" },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.sm },
  cardActionBtn: { minHeight: 40, paddingHorizontal: S.md },
  startedToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, marginTop: S.sm },
  startedToggleText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
  barPrice: { color: C.mist, fontSize: 13, fontWeight: "700", textAlign: "center", marginBottom: S.sm },
  statusCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
  statusCourt: { color: C.paper, fontSize: 15, fontWeight: "700" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3, marginTop: S.sm },
  statusPillText: { fontSize: 11.5, fontWeight: "800" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "90%", backgroundColor: C.ink, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, borderWidth: 1, borderColor: C.lineStrong, paddingHorizontal: S.xl, paddingBottom: S.md },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineStrong, marginTop: S.sm, marginBottom: S.lg },
  sheetTitle: { color: C.paper, fontSize: 19, fontWeight: "800" },
  summary: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, marginTop: S.lg, marginBottom: S.md, gap: S.sm },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md },
  summaryLabel: { color: C.textDim, fontSize: 13.5 },
  summaryValue: { color: C.paper, fontSize: 14, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  summaryDivider: { height: 1, backgroundColor: C.line, marginVertical: 2 },
  followUp: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 56, paddingHorizontal: S.md, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  followUpLabel: { color: C.paper, fontSize: 14.5, fontWeight: "700" },
});
