import { NextResponse } from "next/server";
import { buildObjectKey, type StorageScope } from "@/lib/storage/s3-paths";
import { createPresignedUploadUrl } from "@/lib/storage/s3-server";
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

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const scope = String(body.scope ?? "").trim() as StorageScope;
  const fileName = String(body.fileName ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream").trim();

  if (!ALLOWED_SCOPES.has(scope) || !fileName) {
    return NextResponse.json({ message: "Invalid presign request." }, { status: 400 });
  }

  const key = buildObjectKey({
    scope,
    fileName,
    entityId: String(body.entityId ?? "").trim() || undefined,
    projectId: String(body.projectId ?? "").trim() || undefined,
    subfolder: String(body.subfolder ?? "").trim() || undefined,
    fieldName: String(body.fieldName ?? "").trim() || undefined,
  });

  try {
    const uploadUrl = await createPresignedUploadUrl({ key, contentType });
    return NextResponse.json({
      key,
      uploadUrl,
      publicUrl: resolvePublicFileUrl(key),
      contentType,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Could not create presigned URL.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
