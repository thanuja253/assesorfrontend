/** Client-safe storage flags and public CDN URL. */
export function isS3StorageEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_S3_STORAGE === "true";
}

export function shouldKeepFormDataFilesWithS3(): boolean {
  return process.env.NEXT_PUBLIC_S3_KEEP_FORMDATA_FILES === "true";
}

export function getCloudfrontBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? "").replace(/\/$/, "");
}

export function getMaxUploadBytes(): number {
  const mb = Number(process.env.STORAGE_MAX_UPLOAD_MB ?? "25");
  if (!Number.isFinite(mb) || mb <= 0) return 25 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}
