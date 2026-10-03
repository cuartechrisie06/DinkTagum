import { supabase } from "../../lib/supabase";

// Uploads a picked image (from expo-image-picker) to a public Storage bucket
// under the current user's own folder (required by the bucket's owner-write
// RLS policy), and returns its public URL.
export async function uploadImageAsync(bucket, userId, asset) {
  if (!supabase) return { url: null, error: new Error("Supabase is not configured") };
  try {
    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();
    const extension = (asset.uri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, { contentType: asset.mimeType || "image/jpeg", upsert: true });
    if (uploadError) return { url: null, error: uploadError };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (error) {
    return { url: null, error };
  }
}
