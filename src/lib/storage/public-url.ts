import { getCloudfrontBaseUrl } from "@/lib/storage/config";

/** Resolve stored S3 key or path to a public CDN URL (no AWS secrets in the client). */
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
