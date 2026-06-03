import { getApiUrl } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";

/** Presigned PUT target + final object key returned by the API. */
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
  assessorProfile: (assessorId: string) => `uploads/profiles/assessor/${assessorId}`,
  facilitatorProfile: (facilitatorId: string) =>
    `uploads/profiles/facilitator/${facilitatorId}`,
  generic: (segment: string) => `uploads/${segment.replace(/^\/+|\/+$/g, "")}`,
} as const;

export type StorageUploadContext = {
  scope: string;
  entityId?: string;
  projectId?: string;
  subfolder?: string;
  fieldName?: string;
};

export function folderForStorageContext(context: StorageUploadContext): string {
  const { scope, entityId, projectId, subfolder, fieldName } = context;

  if (scope === "projects/expenses" && projectId) {
    return S3_FOLDERS.financePayment(projectId);
  }
  if (scope === "projects/launch-training" && projectId) {
    return S3_FOLDERS.launchTraining(projectId);
  }
  if (scope === "projects/contracts" && projectId) {
    return S3_FOLDERS.facilitatorContract(projectId);
  }
  if (scope === "projects/checklist" && projectId) {
    return S3_FOLDERS.workOrder(projectId);
  }
  if (scope === "profiles/assessor" && entityId) {
    return S3_FOLDERS.assessorProfile(entityId);
  }
  if (scope === "profiles/facilitator" && entityId) {
    return S3_FOLDERS.facilitatorProfile(entityId);
  }
  if (scope === "profiles/company" && projectId) {
    return S3_FOLDERS.registration(projectId);
  }

  const segment = [scope.replace(/\//g, "-"), projectId, entityId, subfolder, fieldName]
    .filter(Boolean)
    .join("/");
  return S3_FOLDERS.generic(segment || "misc");
}

function getStoredToken(token?: string): string {
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
  if (!text.trim()) {
    return `Request failed (${response.status}).`;
  }
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

/** Step 1: get presigned PUT url + final S3 key from the business API. */
export async function getPresignedUpload(
  file: File,
  folder: string,
  token?: string,
): Promise<PresignedUploadResult> {
  const authToken = getStoredToken(token);
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
    throw new Error("S3 upload failed.");
  }
}

/** Steps 1 + 2 — returns the S3 key to send on the feature API (step 3). */
export async function uploadFileToS3(
  file: File,
  folder: string,
  token?: string,
): Promise<string> {
  const { key, url } = await getPresignedUpload(file, folder, token);
  await putFileToS3(url, file);
  return key;
}

/** Upload using legacy scope metadata (profile / project forms). */
export async function uploadFileToS3WithContext(
  file: File,
  context: StorageUploadContext,
  token?: string,
): Promise<{ key: string; url: string }> {
  const key = await uploadFileToS3(file, folderForStorageContext(context), token);
  return { key, url: resolvePublicFileUrl(key) };
}

/** Prefer API `document_url`; otherwise CloudFront from key; else short-lived download URL. */
export function resolveDocumentUrl(
  row: Record<string, unknown> | null | undefined,
): string {
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

/** When only a private key exists, fetch a temporary download URL (~1 hour). */
export async function getS3DownloadUrl(key: string, token?: string): Promise<string> {
  const authToken = getStoredToken(token);
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
  if (!url) {
    throw new Error("Invalid download URL response.");
  }
  return url;
}
