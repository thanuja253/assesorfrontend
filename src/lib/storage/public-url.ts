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

  return `/${key}`;
}
