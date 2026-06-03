/**
 * Client-safe storage flags and public CDN URL.
 * When true: files go to S3 via API presigned PUT; feature APIs receive `*_s3_key` fields.
 * Env: NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_CLOUDFRONT_URL, auth token only (no AWS keys in Next.js).
 */
export function isS3StorageEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_S3_STORAGE === "true";
}

export function shouldKeepFormDataFilesWithS3(): boolean {
  return process.env.NEXT_PUBLIC_S3_KEEP_FORMDATA_FILES === "true";
}

export function getCloudfrontBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "").replace(/\/$/, "");
}
