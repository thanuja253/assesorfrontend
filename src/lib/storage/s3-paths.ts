export type StorageScope =
  | "profiles/assessor"
  | "profiles/facilitator"
  | "profiles/company"
  | "projects/expenses"
  | "projects/launch-training"
  | "projects/contracts"
  | "projects/checklist"
  | "projects/general"
  | "notifications"
  | "uploads";

export type BuildObjectKeyInput = {
  scope: StorageScope;
  fileName: string;
  entityId?: string;
  projectId?: string;
  subfolder?: string;
  fieldName?: string;
};

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "file";
}

/**
 * S3 object key layout:
 *   {scope}/{entityId|projectId|general}/{subfolder?}/{field?}/{timestamp}-{uuid}-{filename}
 */
export function buildObjectKey(input: BuildObjectKeyInput): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stamp = now.getTime();
  const uuid = crypto.randomUUID();

  const scope = sanitizeSegment(input.scope);
  const safeName = sanitizeFileName(input.fileName);

  const root =
    sanitizeSegment(input.projectId ?? "") ||
    sanitizeSegment(input.entityId ?? "") ||
    "general";

  const parts = [scope, root];

  const subfolder = sanitizeSegment(input.subfolder ?? "");
  if (subfolder) parts.push(subfolder);

  const field = sanitizeSegment(input.fieldName ?? "");
  if (field) parts.push(field);

  parts.push(year, month, `${stamp}-${uuid}-${safeName}`);

  return parts.filter(Boolean).join("/");
}
