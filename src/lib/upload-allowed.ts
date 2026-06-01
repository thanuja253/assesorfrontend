/** Shared upload rules — keep UI hints, `accept`, and validation aligned. */

export type UploadAllowedRule = {
  /** Human-readable extensions, e.g. `.pdf` */
  extensions: readonly string[];
  /** Value for `<input accept="...">` */
  accept: string;
  /** Max file size in megabytes (omit when not enforced in UI). */
  maxMb?: number;
};

export const UPLOAD_ALLOWED = {
  profileImage: {
    extensions: [".png", ".jpg", ".jpeg"],
    accept: "image/png,image/jpeg,image/jpg",
  },
  profileDocument: {
    extensions: [".pdf", ".jpg", ".jpeg", ".png"],
    accept: "application/pdf,image/jpeg,image/jpg,image/png",
    maxMb: 10,
  },
  expenseDocument: {
    extensions: [".pdf"],
    accept: "application/pdf",
    maxMb: 10,
  },
} as const satisfies Record<string, UploadAllowedRule>;

export function formatUploadAllowedHint(rule: UploadAllowedRule): string {
  const types = rule.extensions.join(", ");
  if (rule.maxMb !== undefined) {
    return `Allowed: ${types} (max ${rule.maxMb} MB)`;
  }
  return `Allowed: ${types}`;
}
