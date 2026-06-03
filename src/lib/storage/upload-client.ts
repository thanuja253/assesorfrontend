import { isS3StorageEnabled } from "@/lib/storage/config";
import type { BuildObjectKeyInput } from "@/lib/storage/s3-paths";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";
import { uploadFileToS3WithContext } from "@/lib/s3-upload";

export type UploadedFileResult = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};

/**
 * @deprecated Prefer `uploadFileToS3` / `uploadFileToS3WithContext` from `@/lib/s3-upload`.
 * Uploads via API presigned URL (no Next.js / AWS env on the client).
 */
export async function uploadFileToStorage(
  file: File,
  meta: Omit<BuildObjectKeyInput, "fileName">,
): Promise<UploadedFileResult> {
  const uploaded = await uploadFileToS3WithContext(file, {
    scope: meta.scope,
    entityId: meta.entityId,
    projectId: meta.projectId,
    subfolder: meta.subfolder,
    fieldName: meta.fieldName,
  });

  return {
    key: uploaded.key,
    url: uploaded.url,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function uploadFileToStorageIfEnabled(
  file: File,
  meta: Omit<BuildObjectKeyInput, "fileName">,
): Promise<UploadedFileResult | null> {
  if (!isS3StorageEnabled()) return null;
  return uploadFileToStorage(file, meta);
}

export { isS3StorageEnabled, resolvePublicFileUrl };
