import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SURFACES } from "../../utils/courts";
import { Button, C, FieldError, S, styles } from "../shared";
import { adminStyles } from "./adminStyles";
import { courtFieldErrors, STATUSES } from "./courtRules";
import { PhotoGalleryManager } from "./PhotoGalleryManager";

function Field({ label, value, onChangeText, hint, error, style, ...props }) {
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
        style={[styles.profileInput, { marginTop: 6 }, error && styles.inputError]}
        accessibilityLabel={label}
        accessibilityHint={error || undefined}
        {...props}
      />
      <FieldError message={error} />
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

export function CourtForm({ initial, saving, onSubmit, onCancel, userId, details }) {
  const [form, setForm] = useState(initial);
  // Errors appear after the first save attempt, then update as the admin types.
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? courtFieldErrors(form, { details }) : {};
  const errorCount = Object.keys(errors).length;
  const set = (key) => (value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (Object.keys(courtFieldErrors(form, { details })).length) {
      setShowErrors(true);
      return;
    }
    onSubmit(form);
  };

  return (
    <View style={[styles.profileForm, { marginTop: S.md }]}>

      {/* ── Basic info ── */}
      <FormSection title="Basic info">
        <Field
          label="Court name *"
          value={form.name}
          onChangeText={set("name")}
          error={errors.name}
          placeholder="e.g. Magugpo Pickleball Court"
          maxLength={120}
        />
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Field
            label="Area / neighbourhood"
            value={form.area}
            onChangeText={set("area")}
            error={errors.area}
            placeholder="Magugpo"
          />
          <Field
            label="No. of courts"
            value={form.court_count}
            onChangeText={set("court_count")}
            error={errors.court_count}
            keyboardType="number-pad"
            style={{ maxWidth: 110 }}
          />
        </View>
        <Field
          label="Full address"
          value={form.address}
          onChangeText={set("address")}
          error={errors.address}
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
        {details ? (
          <View>
            <Text style={styles.profileFieldLabel}>Surface</Text>
            <View style={[styles.choiceRow, { marginTop: 6 }]}>
              {["", ...SURFACES].map((surface) => (
                <TouchableOpacity
                  key={surface || "unset"}
                  onPress={() => set("surface")(surface)}
                  style={[styles.chip, { marginRight: 0, minHeight: 44, justifyContent: "center" }, form.surface === surface && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.surface === surface }}
                >
                  <Text style={[styles.chipText, form.surface === surface && styles.chipTextActive]}>{surface || "Not set"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        <Field
          label="Amenities"
          value={form.amenities}
          onChangeText={set("amenities")}
          error={errors.amenities}
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
            error={errors.opening_hours}
            placeholder="6:00 AM – 9:00 PM"
          />
          <Field
            label="Hourly rate (₱)"
            value={form.hourly_rate}
            onChangeText={set("hourly_rate")}
            error={errors.hourly_rate}
            keyboardType="decimal-pad"
            placeholder="150"
            hint="Leave blank if free"
          />
        </View>
        {details ? (
          <View style={{ flexDirection: "row", gap: S.md }}>
            <Field
              label="Opens at"
              value={form.opens_at}
              onChangeText={set("opens_at")}
              error={errors.opens_at}
              placeholder="6:00 AM"
              hint="Powers “Open now”"
            />
            <Field
              label="Closes at"
              value={form.closes_at}
              onChangeText={set("closes_at")}
              error={errors.closes_at}
              placeholder="10:00 PM"
            />
          </View>
        ) : null}
        <Field
          label="Schedule note"
          value={form.schedule_note}
          onChangeText={set("schedule_note")}
          error={errors.schedule_note}
          placeholder="e.g. Closed on public holidays"
        />
        <Field
          label="Rating (0 – 5)"
          value={form.rating}
          onChangeText={set("rating")}
          error={errors.rating}
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
            error={errors.latitude}
            keyboardType="numbers-and-punctuation"
            placeholder="7.4478"
            hint="−90 to 90"
          />
          <Field
            label="Longitude"
            value={form.longitude}
            onChangeText={set("longitude")}
            error={errors.longitude}
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
            error={errors.contact_name}
            placeholder="Court manager name"
          />
          <Field
            label="Contact phone"
            value={form.contact_phone}
            onChangeText={set("contact_phone")}
            error={errors.contact_phone}
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
        <FieldError message={errors.photo_urls} />
      </FormSection>

      {errorCount ? (
        <View style={{ marginTop: S.lg }}>
          <FieldError message={`Fix ${errorCount === 1 ? "the highlighted field" : `the ${errorCount} highlighted fields`} before saving.`} />
        </View>
      ) : null}

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
          onPress={submit}
          loading={saving}
          style={{ flex: 2, minHeight: 44 }}
        />
      </View>
    </View>
  );
}
