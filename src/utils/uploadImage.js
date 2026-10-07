import { supabase } from "../../lib/supabase";

// Image formats the storage buckets accept, recognised by their first bytes.
const SIGNATURES = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/webp", ext: "webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

export function detectImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  return SIGNATURES.find((signature) => signature.test(bytes)) || null;
}

export function base64ToBytes(base64) {
  const binary = atob(String(base64).replace(/^data:[^,]*,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Prefer the base64 the picker already returned (pass `base64: true` to
// launchImageLibraryAsync). Re-reading asset.uri with fetch() can fail on
// some devices; it then resolves with an error page ("File not found"), which
// used to be uploaded as if it were a photo.
async function readAssetBytes(asset) {
  if (asset.base64) return base64ToBytes(asset.base64);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error(`Couldn't read that photo (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

// Uploads a picked image (from expo-image-picker) to a public Storage bucket
// under the current user's own folder (required by the bucket's owner-write
// RLS policy), and returns its public URL.
export async function uploadImageAsync(bucket, userId, asset) {
  if (!supabase) return { url: null, error: new Error("Supabase is not configured") };
  try {
    const bytes = await readAssetBytes(asset);
    const kind = detectImageType(bytes);
    if (!kind) return { url: null, error: new Error("Couldn't read that photo. Try a JPEG, PNG or WebP image.") };
    const path = `${userId}/${Date.now()}.${kind.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: kind.type, upsert: false });
    if (uploadError) return { url: null, error: uploadError };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (error) {
    return { url: null, error };
  }
}
