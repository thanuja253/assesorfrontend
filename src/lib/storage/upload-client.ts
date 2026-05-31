import { AUTH_TOKEN_KEY } from "@/lib/auth-user";
import { isS3StorageEnabled } from "@/lib/storage/config";
import type { BuildObjectKeyInput } from "@/lib/storage/s3-paths";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";

export type UploadedFileResult = {
  key: string;
  url: string;
  bucket: string;
  contentType: string;
  size: number;
};

function getAuthHeader(): HeadersInit {
  const token =
    typeof globalThis.window !== "undefined"
      ? globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY)
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadFileToStorage(
  file: File,
  meta: Omit<BuildObjectKeyInput, "fileName">,
): Promise<UploadedFileResult> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("scope", meta.scope);
  if (meta.entityId) formData.set("entityId", meta.entityId);
  if (meta.projectId) formData.set("projectId", meta.projectId);
  if (meta.subfolder) formData.set("subfolder", meta.subfolder);
  if (meta.fieldName) formData.set("fieldName", meta.fieldName);

  const response = await fetch("/api/storage/upload", {
    method: "POST",
    headers: getAuthHeader(),
    body: formData,
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | (UploadedFileResult & { message?: string })
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : "Could not upload file to storage.";
    throw new Error(message);
  }

  if (!data || typeof data !== "object" || !("key" in data) || !("url" in data)) {
    throw new Error("Invalid storage upload response.");
  }

  return data as UploadedFileResult;
}

export async function uploadFileToStorageIfEnabled(
  file: File,
  meta: Omit<BuildObjectKeyInput, "fileName">,
): Promise<UploadedFileResult | null> {
  if (!isS3StorageEnabled()) return null;
  return uploadFileToStorage(file, meta);
}

export { isS3StorageEnabled, resolvePublicFileUrl };
