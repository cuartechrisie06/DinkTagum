import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { notify } from "../../utils/confirm";
import { uploadImageAsync } from "../../utils/uploadImage";
import { C, Icon, styles } from "../shared";
import { adminStyles } from "./adminStyles";
import { COURT_PHOTOS_BUCKET } from "./courtRules";

// Upload, paste, reorder and remove court photos; the first one is the cover.
export function PhotoGalleryManager({ photos, onPhotosChange, userId }) {
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
      mediaTypes: ["images"],
      allowsMultipleSelection: true, // pick several at once where supported
      quality: 0.85,
      base64: true, // uploadImageAsync reads the bytes from here (see utils/uploadImage)
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
