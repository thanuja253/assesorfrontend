import { getApiUrl } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";
import { shouldKeepFormDataFilesWithS3 } from "@/lib/storage/config";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";

export type PresignedUploadResult = { key: string; url: string };

/** Backend folder prefixes — keep aligned with API expectations. */
export const S3_FOLDERS = {
  launchTraining: (projectId: string) =>
    `uploads/companyproject/launchAndTraining/${projectId}`,
  registration: (projectId: string) =>
    `uploads/companyproject/registration/${projectId}`,
  workOrder: (projectId: string) => `uploads/companyproject/${projectId}`,
  financePayment: (projectId: string) =>
    `uploads/company/${projectId}/finance-v2-payments`,
  facilitatorContract: (projectId: string) =>
    `uploads/facilitator-signed-contracts/${projectId}`,
  generic: (segment: string) => `uploads/${segment.replace(/^\/+|\/+$/g, "")}`,
} as const;

function resolveToken(token?: string): string {
  const resolved =
    token?.trim() ||
    (typeof globalThis.window !== "undefined"
      ? globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim()
      : "");
  if (!resolved) {
    throw new Error("You are not signed in. Please log in again.");
  }
  return resolved;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return `Request failed (${response.status}).`;
  try {
    const data = JSON.parse(text) as { message?: string; error?: string };
    return data.message?.trim() || data.error?.trim() || text;
  } catch {
    return text;
  }
}

function normalizePresignPayload(data: unknown): PresignedUploadResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid presigned upload response.");
  }
  const record = data as Record<string, unknown>;
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const url =
    (typeof record.url === "string" ? record.url : "") ||
    (typeof record.uploadUrl === "string" ? record.uploadUrl : "");
  if (!key || !url) {
    throw new Error("Invalid presigned upload response.");
  }
  return { key, url };
}

/** Step 1: presigned PUT url + final S3 key from the business API. */
export async function getPresignedUpload(
  file: File,
  folder: string,
  token?: string,
): Promise<PresignedUploadResult> {
  const authToken = resolveToken(token);
  const response = await fetch(getApiUrl("/s3/presigned-upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      folder,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return normalizePresignPayload(await response.json().catch(() => null));
}

/** Step 2: upload file bytes directly to S3. */
export async function putFileToS3(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    throw new Error("S3 upload failed");
  }
}

/** Steps 1 + 2 — returns key for step 3 (feature API). */
export async function uploadFileToS3(
  file: File,
  folder: string,
  token?: string,
): Promise<string> {
  const { key, url } = await getPresignedUpload(file, folder, token);
  await putFileToS3(url, file);
  return key;
}

/**
 * Step 3 bridge: append S3 keys on FormData; omit file blob unless
 * NEXT_PUBLIC_S3_KEEP_FORMDATA_FILES=true.
 */
export async function appendS3FileToFormData(
  formData: FormData,
  input: {
    file: File;
    folder: string;
    field: string;
    extraKeyFields?: string[];
    token?: string;
  },
): Promise<string> {
  const key = await uploadFileToS3(input.file, input.folder, input.token);
  const keyFields = new Set([
    "s3_key",
    `${input.field}_s3_key`,
    `${input.field}_key`,
    ...(input.extraKeyFields ?? []),
  ]);
  for (const name of keyFields) {
    formData.set(name, key);
  }
  if (shouldKeepFormDataFilesWithS3()) {
    formData.set(input.field, input.file);
  }
  return key;
}

/** Prefer API `document_url`; else CloudFront from key. */
export function resolveDocumentUrl(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const direct =
    (typeof row.document_url === "string" && row.document_url) ||
    (typeof row.file_url === "string" && row.file_url) ||
    (typeof row.url === "string" && row.url) ||
    "";
  if (direct.trim()) return direct.trim();

  const key =
    (typeof row.s3_key === "string" && row.s3_key) ||
    (typeof row.document_key === "string" && row.document_key) ||
    (typeof row.key === "string" && row.key) ||
    "";
  return key.trim() ? resolvePublicFileUrl(key.trim()) : "";
}

/** Temporary download when only a private key exists (~1 hour). */
export async function getS3DownloadUrl(key: string, token?: string): Promise<string> {
  const authToken = resolveToken(token);
  const qs = new URLSearchParams({ key });
  const response = await fetch(getApiUrl(`/s3/download-url?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json().catch(() => null)) as { url?: string } | null;
  const url = data?.url?.trim();
  if (!url) throw new Error("Invalid download URL response.");
  return url;
}

export { resolvePublicFileUrl };
