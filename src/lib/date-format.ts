/** Standard display format for dates across the app: DD-MM-YY */
export const DISPLAY_DATE_FORMAT_LABEL = "DD-MM-YY";

const EMPTY = "—";

function formatParts(day: number, month: number, year: number): string {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return EMPTY;
  }
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const yy = String(year % 100).padStart(2, "0");
  return `${dd}-${mm}-${yy}`;
}

function formatFromYmdParts(a: string, b: string, c: string): string | null {
  let day: number;
  let month: number;
  let year: number;

  if (a.length === 4) {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (c.length === 4) {
    day = Number(a);
    month = Number(b);
    year = Number(c);
  } else if (c.length === 2) {
    day = Number(a);
    month = Number(b);
    year = 2000 + Number(c);
  } else {
    return null;
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }
  return formatParts(day, month, year);
}

/**
 * Formats API / user date values for display as DD-MM-YY.
 * Returns "—" when empty; returns the original string when parsing fails.
 */
export function formatDisplayDate(value: unknown): string {
  if (value === null || value === undefined) return EMPTY;

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => formatDisplayDate(item))
      .filter((item) => item !== EMPTY)
      .join(", ");
    return joined || EMPTY;
  }

  const raw =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value).trim()
      : "";
  if (!raw || raw === EMPTY || raw === "-") {
    return raw === "-" ? "-" : EMPTY;
  }

  const onlyDatePart = raw.includes("T") ? raw.split("T")[0] : raw.split(" ")[0];
  const parts = onlyDatePart.split(/[-/.]/).filter(Boolean);
  if (parts.length >= 3) {
    const fromParts = formatFromYmdParts(parts[0], parts[1], parts[2]);
    if (fromParts) return fromParts;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return formatParts(parsed.getDate(), parsed.getMonth() + 1, parsed.getFullYear());
}

/** Whether a KV/detail label should be shown as a formatted date. */
export function isDateFieldLabel(label: string): boolean {
  return /\bdate\b/i.test(label);
}
