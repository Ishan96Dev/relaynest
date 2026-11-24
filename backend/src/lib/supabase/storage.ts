import { publicEnv } from "../env/public";

/** Buckets created by migration 20260101000200_settings_storage.sql. Object names start with the owner folder. */
export const BUCKETS = { avatars: "avatars", workspaceLogos: "workspace-logos" } as const;
export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Public image rules, mirrored by the bucket's own `file_size_limit` and `allowed_mime_types`. */
export const IMAGE_UPLOAD = { maxBytes: 2 * 1024 * 1024, mimeTypes: ["image/webp", "image/png", "image/jpeg"] as string[] };

/** Public URL of an object in a public bucket, or null when there is no object or Supabase is not configured. */
export function publicStorageUrl(bucket: BucketName, path: string | null | undefined): string | null {
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
