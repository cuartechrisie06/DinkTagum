import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { confirmAction, notify } from "../utils/confirm";
import { uploadImageAsync } from "../utils/uploadImage";
import { reservationTime } from "../utils/format";
import {
  Button,
  C,
  EmptyCard,
  ErrorNote,
  Icon,
  OverlayHeader,
  R,
  S,
  SectionTitle,
  StatusPill,
  styles,
} from "./shared";

// ─── Constants ────────────────────────────────────────────────────────────────

const COURT_COLUMNS =
  "id, name, area, address, status, court_count, opening_hours, amenities, rating, latitude, longitude, contact_name, contact_phone, hourly_rate, schedule_note, photo_urls";
const STATUSES = ["Available", "Full", "Closed"];
const COURT_PHOTOS_BUCKET = "court-photos";

const emptyCourt = {
  name: "",
  area: "",
  address: "",
  status: "Available",
  court_count: "1",
  opening_hours: "",
  amenities: "",
  rating: "",
  latitude: "",
  longitude: "",
  contact_name: "",
  contact_phone: "",
  hourly_rate: "",
  schedule_note: "",
  // photo_urls is now managed as a string[] directly, not a comma-separated string
  photo_urls: [],
};

function courtToForm(court) {
  const text = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    name: text(court.name),
    area: text(court.area),
    address: text(court.address),
    status: court.status || "Available",
    court_count: text(court.court_count || 1),
    opening_hours: text(court.opening_hours),
    amenities: (court.amenities || []).join(", "),
    rating: text(court.rating),
    latitude: text(court.latitude),
    longitude: text(court.longitude),
    contact_name: text(court.contact_name),
    contact_phone: text(court.contact_phone),
    hourly_rate: text(court.hourly_rate),
    schedule_note: text(court.schedule_note),
    // Keep as array so the photo manager can work directly with it
    photo_urls: Array.isArray(court.photo_urls) ? court.photo_urls : [],
  };
}

// Converts the text form into a courts DB row, mirroring table check constraints.
export function courtFormToRow(form) {
  const optNum = (v) => (String(v).trim() === "" ? null : Number(v));
  const optText = (v) => String(v).trim() || null;

  const row = {
    name: form.name.trim(),
    area: optText(form.area),
    address: optText(form.address),
    status: form.status,
    court_count: Number(form.court_count),
    opening_hours: optText(form.opening_hours),
    amenities: form.amenities
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    rating: optNum(form.rating),
    latitude: optNum(form.latitude),
    longitude: optNum(form.longitude),
    contact_name: optText(form.contact_name),
    contact_phone: optText(form.contact_phone),
    hourly_rate: optNum(form.hourly_rate),
    schedule_note: optText(form.schedule_note),
    // photo_urls is already a clean string[]
    photo_urls: (form.photo_urls || []).filter(
      (u) => typeof u === "string" && u.trim(),
    ),
  };

  if (!row.name || row.name.length > 120)
    return { error: "Court name is required (up to 120 characters)." };
  if (!STATUSES.includes(row.status))
    return { error: "Choose a valid status." };
  if (!Number.isInteger(row.court_count) || row.court_count < 1)
    return { error: "Number of courts must be a whole number of at least 1." };
  if (row.rating !== null && !(row.rating >= 0 && row.rating <= 5))
    return { error: "Rating must be between 0 and 5." };
  if (row.latitude !== null && !(row.latitude >= -90 && row.latitude <= 90))
    return { error: "Latitude must be between −90 and 90." };
  if (
    row.longitude !== null &&
    !(row.longitude >= -180 && row.longitude <= 180)
  )
    return { error: "Longitude must be between −180 and 180." };
  if (row.hourly_rate !== null && !(row.hourly_rate >= 0))
    return { error: "Hourly rate must be a positive number." };
  if (row.photo_urls.some((u) => !/^https?:\/\//i.test(u)))
    return { error: "All photo URLs must start with https://." };

  return { value: row };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Field({ label, value, onChangeText, hint, style, ...props }) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      {hint ? (
        <Text style={adminStyles.fieldHint}>{hint}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={C.textFaint}
        style={[styles.profileInput, { marginTop: 6 }]}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

function FormSection({ title, children }) {
  return (
    <View style={adminStyles.formSection}>
      <View style={adminStyles.formSectionHeader}>
        <View style={adminStyles.formSectionLine} />
        <Text style={adminStyles.formSectionTitle}>{title}</Text>
        <View style={adminStyles.formSectionLine} />
      </View>
      {children}
    </View>
  );
}

// ─── Photo gallery manager ────────────────────────────────────────────────────

function PhotoGalleryManager({ photos, onPhotosChange, userId }) {
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const pickAndUpload = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(
        "Photo access needed",
        "Allow photo access in your device settings to upload court images.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, // pick several at once where supported
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    const newUrls = [];
    for (const asset of result.assets) {
      const { url, error } = await uploadImageAsync(
        COURT_PHOTOS_BUCKET,
        userId,
        asset,
      );
      if (error) {
        notify("Upload failed", error.message);
      } else if (url) {
        newUrls.push(url);
      }
    }
    setUploading(false);
    if (newUrls.length) onPhotosChange([...photos, ...newUrls]);
  };

  const addUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      notify("Invalid URL", "Photo URLs must start with https://.");
      return;
    }
    if (photos.includes(trimmed)) {
      notify("Duplicate", "That URL is already in the list.");
      return;
    }
    onPhotosChange([...photos, trimmed]);
    setUrlDraft("");
  };

  const removePhoto = (index) =>
    onPhotosChange(photos.filter((_, i) => i !== index));

  const movePhoto = (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= photos.length) return;
    const updated = [...photos];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    onPhotosChange(updated);
  };

  return (
    <View style={adminStyles.galleryManager}>
      {/* Existing photos grid */}
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={adminStyles.galleryScroll}
          contentContainerStyle={adminStyles.galleryScrollContent}
        >
          {photos.map((url, index) => (
            <View key={`${url}-${index}`} style={adminStyles.galleryThumbWrapper}>
              <Image
                source={{ uri: url }}
                style={adminStyles.galleryThumb}
                accessibilityLabel={`Court photo ${index + 1}`}
                resizeMode="cover"
              />
              {/* Cover badge on first photo */}
              {index === 0 ? (
                <View style={adminStyles.coverBadge}>
                  <Text style={adminStyles.coverBadgeText}>COVER</Text>
                </View>
              ) : null}
              {/* Reorder arrows */}
              <View style={adminStyles.thumbActions}>
                {index > 0 ? (
                  <TouchableOpacity
                    onPress={() => movePhoto(index, -1)}
                    style={adminStyles.thumbActionBtn}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel="Move photo left"
                  >
                    <Icon name="chevron-back" size={13} color={C.paper} />
                  </TouchableOpacity>
                ) : <View style={adminStyles.thumbActionBtn} />}
                <TouchableOpacity
                  onPress={() => removePhoto(index)}
                  style={[adminStyles.thumbActionBtn, adminStyles.thumbRemoveBtn]}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                >
                  <Icon name="close" size={13} color={C.paper} />
                </TouchableOpacity>
                {index < photos.length - 1 ? (
                  <TouchableOpacity
                    onPress={() => movePhoto(index, 1)}
                    style={adminStyles.thumbActionBtn}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel="Move photo right"
                  >
                    <Icon name="chevron-forward" size={13} color={C.paper} />
                  </TouchableOpacity>
                ) : <View style={adminStyles.thumbActionBtn} />}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={adminStyles.galleryEmpty}>
          <Icon name="images-outline" size={28} color={C.textFaint} />
          <Text style={adminStyles.galleryEmptyText}>No photos yet</Text>
        </View>
      )}

      {/* Upload button */}
      <TouchableOpacity
        onPress={pickAndUpload}
        disabled={uploading}
        style={[adminStyles.uploadBtn, uploading && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Pick photos from library"
      >
        {uploading ? (
          <ActivityIndicator color={C.volt} size="small" />
        ) : (
          <Icon name="cloud-upload-outline" size={18} color={C.volt} />
        )}
        <Text style={adminStyles.uploadBtnText}>
          {uploading ? "Uploading…" : "Upload from library"}
        </Text>
      </TouchableOpacity>

      {/* URL paste fallback */}
      <View style={adminStyles.urlPasteRow}>
        <TextInput
          value={urlDraft}
          onChangeText={setUrlDraft}
          placeholder="Or paste an https:// URL"
          placeholderTextColor={C.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.profileInput, { flex: 1 }]}
          onSubmitEditing={addUrl}
          returnKeyType="done"
          accessibilityLabel="Paste a photo URL"
        />
        <TouchableOpacity
          onPress={addUrl}
          disabled={!urlDraft.trim()}
          style={[adminStyles.urlAddBtn, !urlDraft.trim() && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Add URL"
        >
          <Icon name="add" size={20} color={C.ink} />
        </TouchableOpacity>
      </View>
      <Text style={adminStyles.fieldHint}>
        First photo becomes the cover image. Tap arrows to reorder.
      </Text>
    </View>
  );
}

// ─── Court form ───────────────────────────────────────────────────────────────

function CourtForm({ initial, saving, onSubmit, onCancel, userId }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <View style={[styles.profileForm, { marginTop: S.md }]}>

      {/* ── Basic info ── */}
      <FormSection title="Basic info">
        <Field
          label="Court name *"
          value={form.name}
          onChangeText={set("name")}
          placeholder="e.g. Magugpo Pickleball Court"
          maxLength={120}
        />
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Field
            label="Area / neighbourhood"
            value={form.area}
            onChangeText={set("area")}
            placeholder="Magugpo"
          />
          <Field
            label="No. of courts"
            value={form.court_count}
            onChangeText={set("court_count")}
            keyboardType="number-pad"
            style={{ maxWidth: 110 }}
          />
        </View>
        <Field
          label="Full address"
          value={form.address}
          onChangeText={set("address")}
          placeholder="Street, barangay, city"
        />
        <View>
          <Text style={styles.profileFieldLabel}>Status</Text>
          <View style={[styles.choiceRow, { marginTop: 6 }]}>
            {STATUSES.map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => set("status")(status)}
                style={[
                  styles.chip,
                  { marginRight: 0 },
                  form.status === status && styles.chipActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: form.status === status }}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.status === status && styles.chipTextActive,
                  ]}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Field
          label="Amenities"
          value={form.amenities}
          onChangeText={set("amenities")}
          placeholder="Lights, Parking, Restrooms, Bleachers"
          hint="Comma-separated list"
        />
      </FormSection>

      {/* ── Pricing & hours ── */}
      <FormSection title="Pricing & hours">
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Field
            label="Opening hours"
            value={form.opening_hours}
            onChangeText={set("opening_hours")}
            placeholder="6:00 AM – 9:00 PM"
          />
          <Field
            label="Hourly rate (₱)"
            value={form.hourly_rate}
            onChangeText={set("hourly_rate")}
            keyboardType="decimal-pad"
            placeholder="150"
            hint="Leave blank if free"
          />
        </View>
        <Field
          label="Schedule note"
          value={form.schedule_note}
          onChangeText={set("schedule_note")}
          placeholder="e.g. Closed on public holidays"
        />
        <Field
          label="Rating (0 – 5)"
          value={form.rating}
          onChangeText={set("rating")}
          keyboardType="decimal-pad"
          placeholder="4.5"
          hint="Leave blank to hide rating"
          style={{ maxWidth: 160 }}
        />
      </FormSection>

      {/* ── Location ── */}
      <FormSection title="Location">
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Field
            label="Latitude"
            value={form.latitude}
            onChangeText={set("latitude")}
            keyboardType="numbers-and-punctuation"
            placeholder="7.4478"
            hint="−90 to 90"
          />
          <Field
            label="Longitude"
            value={form.longitude}
            onChangeText={set("longitude")}
            keyboardType="numbers-and-punctuation"
            placeholder="125.8083"
            hint="−180 to 180"
          />
        </View>
      </FormSection>

      {/* ── Contact ── */}
      <FormSection title="Contact">
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Field
            label="Contact name"
            value={form.contact_name}
            onChangeText={set("contact_name")}
            placeholder="Court manager name"
          />
          <Field
            label="Contact phone"
            value={form.contact_phone}
            onChangeText={set("contact_phone")}
            keyboardType="phone-pad"
            placeholder="+63 9XX XXX XXXX"
          />
        </View>
      </FormSection>

      {/* ── Photos ── */}
      <FormSection title="Photos">
        <PhotoGalleryManager
          photos={form.photo_urls}
          onPhotosChange={set("photo_urls")}
          userId={userId}
        />
      </FormSection>

      {/* ── Actions ── */}
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
        <Button
          variant="ghost"
          label="Cancel"
          onPress={onCancel}
          disabled={saving}
          style={{ flex: 1 }}
        />
        <Button
          label="Save court"
          icon="checkmark"
          onPress={() => onSubmit(form)}
          loading={saving}
          style={{ flex: 2, minHeight: 44 }}
        />
      </View>
    </View>
  );
}

// ─── Admin row ────────────────────────────────────────────────────────────────

function AdminRow({ title, hint, children, right }) {
  return (
    <View style={[styles.adminAction, { alignItems: "flex-start" }]}>
      <View style={{ flex: 1, paddingRight: S.md }}>
        <Text style={styles.adminActionTitle} numberOfLines={2}>
          {title}
        </Text>
        {hint ? (
          <Text style={styles.adminActionHint} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
        {children ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: S.sm,
              marginTop: S.md,
            }}
          >
            {children}
          </View>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// Court admin row — shows thumbnail, status, amenity pills, and action buttons
function CourtAdminRow({ court, onEdit, onToggleStatus, onDelete, savingId }) {
  const isBusy = savingId === court.id;
  const cover = court.photo_urls?.[0];
  const amenities = Array.isArray(court.amenities) ? court.amenities : [];

  return (
    <View style={adminStyles.courtRow}>
      {/* Thumbnail */}
      <View style={adminStyles.courtThumb}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={adminStyles.courtThumbImg}
            resizeMode="cover"
            accessibilityLabel={`${court.name} photo`}
          />
        ) : (
          <View style={adminStyles.courtThumbPlaceholder}>
            <Icon name="tennisball-outline" size={22} color={C.textFaint} />
          </View>
        )}
      </View>

      {/* Details */}
      <View style={{ flex: 1 }}>
        {/* Name + status badge */}
        <View style={adminStyles.courtRowHeader}>
          <Text style={adminStyles.courtRowName} numberOfLines={1}>
            {court.name}
          </Text>
          <StatusPill status={court.status} />
        </View>

        {/* Area · courts count · hours */}
        <Text style={adminStyles.courtRowMeta} numberOfLines={1}>
          {[
            court.area,
            court.court_count
              ? `${court.court_count} court${court.court_count === 1 ? "" : "s"}`
              : null,
            court.opening_hours,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        {/* Rating + hourly rate */}
        {(court.rating != null || court.hourly_rate != null) ? (
          <View style={adminStyles.courtRowPricing}>
            {court.rating != null ? (
              <View style={adminStyles.courtRowPricingItem}>
                <Icon name="star" size={12} color={C.volt} />
                <Text style={adminStyles.courtRowPricingText}>
                  {Number(court.rating).toFixed(1)}
                </Text>
              </View>
            ) : null}
            {court.hourly_rate != null ? (
              <View style={adminStyles.courtRowPricingItem}>
                <Icon name="cash-outline" size={12} color={C.textDim} />
                <Text style={adminStyles.courtRowPricingText}>
                  ₱{Number(court.hourly_rate).toFixed(0)}/hr
                </Text>
              </View>
            ) : (
              <View style={adminStyles.courtRowPricingItem}>
                <Icon name="cash-outline" size={12} color={C.textDim} />
                <Text style={adminStyles.courtRowPricingText}>Free</Text>
              </View>
            )}
            {court.photo_urls?.length > 0 ? (
              <View style={adminStyles.courtRowPricingItem}>
                <Icon name="images-outline" size={12} color={C.textDim} />
                <Text style={adminStyles.courtRowPricingText}>
                  {court.photo_urls.length} photo{court.photo_urls.length === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Amenity pills */}
        {amenities.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: S.sm }}
            contentContainerStyle={{ gap: S.xs }}
          >
            {amenities.slice(0, 6).map((a) => (
              <View key={a} style={adminStyles.amenityPill}>
                <Text style={adminStyles.amenityPillText}>{a}</Text>
              </View>
            ))}
            {amenities.length > 6 ? (
              <View style={adminStyles.amenityPill}>
                <Text style={adminStyles.amenityPillText}>
                  +{amenities.length - 6}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {/* Action buttons */}
        <View style={adminStyles.courtRowActions}>
          <TouchableOpacity
            onPress={onEdit}
            disabled={isBusy}
            style={adminStyles.courtActionBtn}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${court.name}`}
          >
            <Icon name="create-outline" size={14} color={C.volt} />
            <Text style={adminStyles.courtActionBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onToggleStatus}
            disabled={isBusy}
            style={adminStyles.courtActionBtn}
            accessibilityRole="button"
            accessibilityLabel={
              court.status === "Closed"
                ? `Reopen ${court.name}`
                : `Close ${court.name}`
            }
          >
            <Icon
              name={court.status === "Closed" ? "checkmark-circle-outline" : "ban-outline"}
              size={14}
              color={court.status === "Closed" ? C.volt : C.butter}
            />
            <Text
              style={[
                adminStyles.courtActionBtnText,
                { color: court.status === "Closed" ? C.volt : C.butter },
              ]}
            >
              {isBusy ? "Saving…" : court.status === "Closed" ? "Reopen" : "Close"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDelete}
            disabled={isBusy}
            style={adminStyles.courtActionBtn}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${court.name}`}
          >
            <Icon name="trash-outline" size={14} color={C.textDim} />
            <Text style={[adminStyles.courtActionBtnText, { color: C.textDim }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main AdminTab ────────────────────────────────────────────────────────────

const small = { minHeight: 34, paddingHorizontal: S.md };

export function AdminTab({ user, onBack }) {
  const { reload: reloadDashboard } = useDashboard();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [authorized, setAuthorized] = useState(null);
  const [counts, setCounts] = useState(null);
  const [reportedPosts, setReportedPosts] = useState([]);
  const [courts, setCourts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [savingId, setSavingId] = useState("");
  // null = list view, "new" = add form, string uuid = edit form
  const [courtEditor, setCourtEditor] = useState(null);
  const [error, setError] = useState("");

  const namesById = Object.fromEntries(
    profiles.map((p) => [p.id, p.display_name || "Unnamed player"]),
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const isAdmin =
      !authError &&
      authData.user?.id === user?.id &&
      authData.user?.app_metadata?.role === "admin";
    setAuthorized(isAdmin);
    if (!isAdmin) return;

    const [
      reservationCount,
      reportCount,
      postRows,
      courtRows,
      profileRows,
      reservationRows,
    ] = await Promise.all([
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_reported", true),
      supabase
        .from("community_posts")
        .select("id, body, author_id, created_at")
        .eq("is_reported", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("courts")
        .select(COURT_COLUMNS)
        .order("name", { ascending: true })
        .limit(200),
      supabase
        .from("profiles")
        .select("id, display_name, is_directory_visible")
        .order("display_name", { ascending: true })
        .limit(200),
      supabase
        .from("reservations")
        .select(
          "id, user_id, court_id, start_time, end_time, status, courts(name)",
        )
        .in("status", ["pending", "confirmed"])
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(100),
    ]);

    const queryError = [
      reservationCount.error,
      reportCount.error,
      postRows.error,
      courtRows.error,
      profileRows.error,
      reservationRows.error,
    ].find(Boolean);

    if (queryError) {
      setError(`Admin data could not be loaded: ${queryError.message}`);
      return;
    }
    setError("");
    setCounts({
      reservations: reservationCount.count || 0,
      reports: reportCount.count || 0,
    });
    setReportedPosts(postRows.data || []);
    setCourts(courtRows.data || []);
    setProfiles(profileRows.data || []);
    setReservations(reservationRows.data || []);
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Generic mutation wrapper
  const mutate = async (id, request, onSuccess, failTitle = "Could not save change") => {
    setSavingId(id);
    const { data, error: reqError } = await request;
    setSavingId("");
    if (reqError) {
      const inUse = /foreign key|23503|violates/i.test(reqError.message);
      notify(
        failTitle,
        inUse
          ? "This court still has reservations. Close it instead, or remove its reservations first."
          : reqError.message,
      );
      return false;
    }
    onSuccess(data);
    return true;
  };

  // ── Courts CRUD ──────────────────────────────────────────────────────────────

  const saveCourt = async (form) => {
    const { value, error: invalid } = courtFormToRow(form);
    if (invalid) { notify("Check the court details", invalid); return; }

    const isNew = courtEditor === "new";
    const request = isNew
      ? supabase.from("courts").insert(value).select(COURT_COLUMNS).single()
      : supabase
          .from("courts")
          .update(value)
          .eq("id", courtEditor)
          .select(COURT_COLUMNS)
          .single();

    const ok = await mutate(
      courtEditor,
      request,
      (row) => {
        setCourts((items) =>
          (isNew
            ? [...items, row]
            : items.map((item) => (item.id === row.id ? row : item))
          ).sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      isNew ? "Could not add court" : "Could not update court",
    );

    if (ok) {
      setCourtEditor(null);
      reloadDashboard();
    }
  };

  const setCourtStatus = (court, status) =>
    mutate(
      court.id,
      supabase.from("courts").update({ status }).eq("id", court.id),
      () => {
        setCourts((items) =>
          items.map((item) =>
            item.id === court.id ? { ...item, status } : item,
          ),
        );
        reloadDashboard();
      },
    );

  const deleteCourt = async (court) => {
    if (
      !(await confirmAction(
        "Delete court?",
        `Permanently delete "${court.name}"? Courts with active reservations cannot be deleted — close them instead.`,
      ))
    )
      return;
    mutate(
      court.id,
      supabase.from("courts").delete().eq("id", court.id),
      () => {
        setCourts((items) => items.filter((item) => item.id !== court.id));
        reloadDashboard();
      },
      "Could not delete court",
    );
  };

  // ── Reservations ─────────────────────────────────────────────────────────────

  const setReservationStatus = async (r, status) => {
    if (
      status === "cancelled" &&
      !(await confirmAction(
        "Cancel reservation?",
        `Cancel ${namesById[r.user_id] || "this player"}'s booking at ${r.courts?.name || "this court"}?`,
        "Cancel reservation",
      ))
    )
      return;

    const ok = await mutate(
      r.id,
      supabase.from("reservations").update({ status }).eq("id", r.id),
      () => {
        setReservations((items) =>
          status === "cancelled"
            ? items.filter((item) => item.id !== r.id)
            : items.map((item) =>
                item.id === r.id ? { ...item, status } : item,
              ),
        );
      },
    );

    if (!ok) return;
    const title =
      status === "confirmed" ? "Reservation confirmed" : "Reservation cancelled";
    const { error: notifyError } = await supabase.from("notifications").insert({
      recipient_id: r.user_id,
      kind: "reservation",
      title,
      body: `${r.courts?.name || "Your court"} · ${reservationTime(r)}`,
      related_id: r.id,
    });
    if (notifyError) console.warn("Could not notify player:", notifyError.message);
  };

  // ── Reported posts ───────────────────────────────────────────────────────────

  const dropReport = (post) => {
    setReportedPosts((items) => items.filter((item) => item.id !== post.id));
    setCounts((v) => ({ ...v, reports: Math.max(0, v.reports - 1) }));
  };

  const restorePost = (post) =>
    mutate(
      post.id,
      supabase
        .from("community_posts")
        .update({ is_reported: false })
        .eq("id", post.id),
      () => dropReport(post),
    );

  const deletePost = async (post) => {
    if (
      !(await confirmAction("Delete post?", "Permanently remove this reported post?"))
    )
      return;
    mutate(
      post.id,
      supabase.from("community_posts").delete().eq("id", post.id),
      () => dropReport(post),
      "Could not delete post",
    );
  };

  // ── Directory ────────────────────────────────────────────────────────────────

  const toggleDirectory = (profile) => {
    const is_directory_visible = !profile.is_directory_visible;
    mutate(
      profile.id,
      supabase
        .from("profiles")
        .update({ is_directory_visible })
        .eq("id", profile.id),
      () =>
        setProfiles((items) =>
          items.map((item) =>
            item.id === profile.id
              ? { ...item, is_directory_visible }
              : item,
          ),
        ),
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // While a court form is open, render it full-screen so the keyboard doesn't
  // fight the outer ScrollView.
  if (courtEditor !== null && authorized) {
    const editingCourt =
      courtEditor === "new"
        ? null
        : courts.find((c) => c.id === courtEditor);
    return (
      <View style={styles.screen}>
        <OverlayHeader
          title={courtEditor === "new" ? "Add court" : "Edit court"}
          subtitle={editingCourt?.name}
          onBack={() => setCourtEditor(null)}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={{ padding: S.xl, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <CourtForm
            initial={
              courtEditor === "new" ? emptyCourt : courtToForm(editingCourt)
            }
            saving={savingId === courtEditor}
            onSubmit={saveCourt}
            onCancel={() => setCourtEditor(null)}
            userId={userId}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title="Admin"
        subtitle="Courts, reservations and moderation"
        onBack={onBack}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: S.xl, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {authorized === null ? (
          <ActivityIndicator color={C.volt} style={{ marginTop: 28 }} />
        ) : !authorized ? (
          <ErrorNote style={{ marginHorizontal: 0 }}>
            This screen is restricted to administrators.
          </ErrorNote>
        ) : (
          <View>
            {/* Stat cards */}
            <View style={styles.adminGrid}>
              {[
                ["Courts", courts.length],
                ["Reservations", counts?.reservations],
                ["Reported", counts?.reports],
              ].map(([label, value]) => (
                <View key={label} style={styles.adminStatCard}>
                  <Text style={styles.statValue}>{value ?? "…"}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>

            {/* ── Courts section ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle
                action="+ Add court"
                onAction={() => setCourtEditor("new")}
              >
                Courts
              </SectionTitle>
            </View>

            {courts.length === 0 ? (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="tennisball-outline"
                  title="No courts yet"
                  message="Add the first court so players can start booking."
                />
              </View>
            ) : (
              courts.map((court) => (
                <CourtAdminRow
                  key={court.id}
                  court={court}
                  savingId={savingId}
                  onEdit={() => setCourtEditor(court.id)}
                  onToggleStatus={() =>
                    setCourtStatus(
                      court,
                      court.status === "Closed" ? "Available" : "Closed",
                    )
                  }
                  onDelete={() => deleteCourt(court)}
                />
              ))
            )}

            {/* ── Upcoming reservations ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Upcoming reservations</SectionTitle>
            </View>
            {reservations.length ? (
              reservations.map((r) => (
                <AdminRow
                  key={r.id}
                  title={`${r.courts?.name || "Court"} · ${namesById[r.user_id] || "Player"}`}
                  hint={reservationTime(r)}
                  right={
                    <Text
                      style={{
                        color:
                          r.status === "confirmed" ? C.volt : C.butter,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      {r.status.toUpperCase()}
                    </Text>
                  }
                >
                  {r.status === "pending" ? (
                    <Button
                      variant="secondary"
                      icon="checkmark"
                      label="Confirm"
                      onPress={() => setReservationStatus(r, "confirmed")}
                      disabled={savingId === r.id}
                      style={small}
                    />
                  ) : null}
                  <Button
                    variant="ghost"
                    label="Cancel"
                    onPress={() => setReservationStatus(r, "cancelled")}
                    disabled={savingId === r.id}
                    style={small}
                  />
                </AdminRow>
              ))
            ) : (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="calendar-outline"
                  title="Nothing upcoming"
                  message="New bookings will appear here for confirmation."
                />
              </View>
            )}

            {/* ── Reported posts ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Reported posts</SectionTitle>
            </View>
            {reportedPosts.length ? (
              reportedPosts.map((post) => (
                <AdminRow
                  key={post.id}
                  title={post.body}
                  hint={`By ${namesById[post.author_id] || post.author_id}`}
                >
                  <Button
                    variant="secondary"
                    label="Restore"
                    onPress={() => restorePost(post)}
                    disabled={savingId === post.id}
                    style={small}
                    accessibilityLabel="Restore this reported post"
                  />
                  <Button
                    variant="ghost"
                    icon="trash-outline"
                    label="Delete"
                    onPress={() => deletePost(post)}
                    disabled={savingId === post.id}
                    style={small}
                    accessibilityLabel="Delete this reported post"
                  />
                </AdminRow>
              ))
            ) : (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="checkmark-done-outline"
                  title="Queue is clear"
                  message="No posts are awaiting moderation."
                />
              </View>
            )}

            {/* ── Directory visibility ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Directory visibility</SectionTitle>
            </View>
            {profiles.map((profile) => (
              <View key={profile.id} style={styles.adminAction}>
                <View style={{ flex: 1, paddingRight: S.md }}>
                  <Text style={styles.adminActionTitle} numberOfLines={1}>
                    {profile.display_name || "Unnamed player"}
                  </Text>
                  <Text style={styles.adminActionHint}>
                    {profile.is_directory_visible
                      ? "Visible in directory"
                      : "Hidden from directory"}
                  </Text>
                </View>
                <Switch
                  value={profile.is_directory_visible}
                  onValueChange={() => toggleDirectory(profile)}
                  disabled={savingId === profile.id}
                  trackColor={{ false: C.surface2, true: C.brand }}
                  thumbColor={
                    profile.is_directory_visible ? C.volt : C.paper
                  }
                  accessibilityLabel={`Show ${profile.display_name || "player"} in directory`}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const adminStyles = StyleSheet.create({
  // Form section dividers
  formSection: {
    marginTop: S.xl,
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: S.md,
    gap: S.sm,
  },
  formSectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.line,
  },
  formSectionTitle: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  // Field hint text
  fieldHint: {
    color: C.textFaint,
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },

  // Photo gallery manager
  galleryManager: {
    gap: S.md,
  },
  galleryScroll: {
    marginHorizontal: -S.xs,
  },
  galleryScrollContent: {
    paddingHorizontal: S.xs,
    gap: S.sm,
  },
  galleryThumbWrapper: {
    width: 100,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: C.surface2,
  },
  galleryThumb: {
    width: "100%",
    height: "100%",
  },
  coverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: C.volt,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  coverBadgeText: {
    color: C.ink,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  thumbActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(6,35,29,0.72)",
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  thumbActionBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveBtn: {
    backgroundColor: "rgba(220,50,50,0.7)",
    borderRadius: 12,
  },
  galleryEmpty: {
    height: 80,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderStyle: "dashed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: S.xs,
  },
  galleryEmptyText: {
    color: C.textFaint,
    fontSize: 12.5,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.sm,
    borderWidth: 1.5,
    borderColor: C.volt,
    borderRadius: 10,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
  },
  uploadBtnText: {
    color: C.volt,
    fontSize: 14,
    fontWeight: "700",
  },
  urlPasteRow: {
    flexDirection: "row",
    gap: S.sm,
    alignItems: "center",
  },
  urlAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.volt,
    alignItems: "center",
    justifyContent: "center",
  },

  // Court admin row
  courtRow: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    marginTop: S.md,
    overflow: "hidden",
  },
  courtThumb: {
    width: 80,
    flexShrink: 0,
  },
  courtThumbImg: {
    width: "100%",
    height: "100%",
  },
  courtThumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
  },
  courtRowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: S.md,
    paddingHorizontal: S.md,
    gap: S.sm,
  },
  courtRowName: {
    flex: 1,
    color: C.paper,
    fontSize: 15,
    fontWeight: "700",
  },
  courtRowMeta: {
    color: C.textDim,
    fontSize: 12.5,
    marginTop: 3,
    paddingHorizontal: S.md,
  },
  courtRowPricing: {
    flexDirection: "row",
    gap: S.md,
    paddingHorizontal: S.md,
    marginTop: S.xs,
  },
  courtRowPricingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  courtRowPricingText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: "600",
  },
  courtRowActions: {
    flexDirection: "row",
    gap: 0,
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    borderTopWidth: 1,
    borderColor: C.line,
    marginTop: S.sm,
  },
  courtActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
  },
  courtActionBtnText: {
    color: C.volt,
    fontSize: 12.5,
    fontWeight: "700",
  },
  amenityPill: {
    backgroundColor: C.surface2,
    borderRadius: 20,
    paddingHorizontal: S.sm,
    paddingVertical: 3,
  },
  amenityPillText: {
    color: C.mist,
    fontSize: 11,
    fontWeight: "600",
  },
});
