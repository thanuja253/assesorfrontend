import { NextResponse } from "next/server";
import { buildObjectKey, type StorageScope } from "@/lib/storage/s3-paths";
import { assertUploadSize, uploadBufferToS3 } from "@/lib/storage/s3-server";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";

const ALLOWED_SCOPES = new Set<StorageScope>([
  "profiles/assessor",
  "profiles/facilitator",
  "profiles/company",
  "projects/expenses",
  "projects/launch-training",
  "projects/contracts",
  "projects/checklist",
  "projects/general",
  "notifications",
  "uploads",
]);

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) {
    return unauthorized();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Invalid multipart body.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return badRequest("Missing file.");
  }

  const scopeRaw = String(formData.get("scope") ?? "").trim() as StorageScope;
  if (!ALLOWED_SCOPES.has(scopeRaw)) {
    return badRequest("Invalid storage scope.");
  }

  const entityId = String(formData.get("entityId") ?? "").trim() || undefined;
  const projectId = String(formData.get("projectId") ?? "").trim() || undefined;
  const subfolder = String(formData.get("subfolder") ?? "").trim() || undefined;
  const fieldName = String(formData.get("fieldName") ?? "").trim() || undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    assertUploadSize(buffer.byteLength);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "File too large.";
    return badRequest(message);
  }

  const key = buildObjectKey({
    scope: scopeRaw,
    fileName: file.name,
    entityId,
    projectId,
    subfolder,
    fieldName,
  });

  try {
    const { bucket } = await uploadBufferToS3({
      key,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });

    const url = resolvePublicFileUrl(key);

    return NextResponse.json({
      bucket,
      key,
      url,
      contentType: file.type || "application/octet-stream",
      size: buffer.byteLength,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "S3 upload failed.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
