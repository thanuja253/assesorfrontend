import { shouldKeepFormDataFilesWithS3, isS3StorageEnabled } from "@/lib/storage/config";
import type { BuildObjectKeyInput } from "@/lib/storage/s3-paths";
import { uploadFileToS3WithContext } from "@/lib/s3-upload";

export type FormDataS3Context = {
  scope: BuildObjectKeyInput["scope"];
  entityId?: string;
  projectId?: string;
  subfolder?: string;
};

/**
 * Upload File entries to S3 (presigned PUT via API), then append `{field}_key` (+ optional URL).
 * Removes file blobs unless NEXT_PUBLIC_S3_KEEP_FORMDATA_FILES=true (multipart bridge).
 */
export async function augmentFormDataWithS3Uploads(
  formData: FormData,
  context: FormDataS3Context,
): Promise<FormData> {
  if (!isS3StorageEnabled()) return formData;

  const keepFiles = shouldKeepFormDataFilesWithS3();
  const next = new FormData();

  const fileEntries: Array<{ field: string; file: File }> = [];

  for (const [field, value] of formData.entries()) {
    if (value instanceof File) {
      fileEntries.push({ field, file: value });
      continue;
    }
    next.append(field, value);
  }

  for (const { field, file } of fileEntries) {
    const uploaded = await uploadFileToS3WithContext(file, {
      scope: context.scope,
      entityId: context.entityId,
      projectId: context.projectId,
      subfolder: context.subfolder,
      fieldName: field,
    });

    next.append(`${field}_key`, uploaded.key);
    next.append(`${field}_s3_key`, uploaded.key);
    next.append(`${field}_url`, uploaded.url);
    next.append(`${field}_storage`, "s3");

    if (keepFiles) {
      next.append(field, file);
    }
  }

  return next;
}
