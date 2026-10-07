import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { C, CourtArt, Icon, S, StatusPill, styles } from "../shared";
import { adminStyles } from "./adminStyles";

export function AdminRow({ title, hint, children, right }) {
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
export function CourtAdminRow({ court, onEdit, onToggleStatus, onDelete, savingId }) {
  const isBusy = savingId === court.id;
  const cover = court.photo_urls?.[0];
  const amenities = Array.isArray(court.amenities) ? court.amenities : [];

  return (
    <View style={adminStyles.courtRow}>
      {/* Thumbnail + name + status: the thumbnail is a small square so the
          name and actions get the card's full width on narrow phones. */}
      <View style={adminStyles.courtRowHeader}>
        <View style={adminStyles.courtThumb}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={adminStyles.courtThumbImg}
              resizeMode="cover"
              accessibilityLabel={`${court.name} photo`}
            />
          ) : (
            <CourtArt compact />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={adminStyles.courtRowName} numberOfLines={2}>
            {court.name}
          </Text>
          <View style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <StatusPill status={court.status} />
          </View>
        </View>
      </View>

      <View>

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
            contentContainerStyle={{ gap: S.xs, paddingHorizontal: S.md }}
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
