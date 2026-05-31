import { getCloudfrontBaseUrl } from "@/lib/storage/config";

/**
 * Resolve a stored path or key to a public CDN URL.
 * - Full http(s) URLs are returned as-is.
 * - Keys/paths are prefixed with CloudFront (or S3 virtual-host fallback).
 */
export function resolvePublicFileUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return "";
  if (/^(blob:|data:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  const key = trimmed.replace(/^\/+/, "");
  const cdn = getCloudfrontBaseUrl();
  if (cdn) {
    return `${cdn}/${key}`;
  }

  if (typeof process !== "undefined" && process.env.AWS_S3_BUCKET) {
    const bucket = process.env.AWS_S3_BUCKET.trim();
    const region = process.env.AWS_REGION?.trim() || "ap-south-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  return `/${key}`;
}
