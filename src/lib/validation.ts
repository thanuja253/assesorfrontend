/** Basic format check for typical login / registration emails. */
export function isValidEmailFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return false;
  }

  const domain = trimmed.split("@")[1]?.toLowerCase() ?? "";
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) {
    return false;
  }

  // Business rule: reject repeated terminal TLD segments like `.com.com`.
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    if (last === prev && /^[a-z]{2,10}$/.test(last)) {
      return false;
    }
  }

  return true;
}
