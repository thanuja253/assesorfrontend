export const AUTH_TOKEN_KEY = "authToken";
export const AUTH_USER_STORAGE_KEY = "authUser";
/** Same string the user typed on the login form (your assessor login uses email here). */
export const AUTH_LOGIN_EMAIL_KEY = "authLoginEmail";

/** Clears assessor client session (localStorage). */
export function clearAssessorSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_LOGIN_EMAIL_KEY);
}

export type StoredAuthUser = Record<string, unknown>;

export function parseAuthUserFromStorage(): StoredAuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as StoredAuthUser;
    }
    return null;
  } catch {
    return null;
  }
}

/** Mongo id from login `user` payload (id, _id, or { _id: { $oid } }). */
export function getAssessorIdFromStoredUser(): string | null {
  const user = parseAuthUserFromStorage();
  if (!user) {
    return null;
  }
  const candidates = [user.id, user._id, user.assessorId, user.assessor_id];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === "object" && "$oid" in (value as Record<string, unknown>)) {
      const oid = (value as { $oid?: string }).$oid;
      if (typeof oid === "string" && oid.trim()) {
        return oid.trim();
      }
    }
  }
  return null;
}

/** Text before @ for display (e.g. login email); if no @, returns trimmed input. */
export function loginHandleFromStoredEmail(emailOrLogin: string): string {
  const trimmed = emailOrLogin.trim();
  if (!trimmed) {
    return "";
  }
  const at = trimmed.indexOf("@");
  if (at > 0) {
    return trimmed.slice(0, at);
  }
  return trimmed;
}

/** Avatar initials from login name (uses part before @ when it looks like an email). */
export function initialsFromLoginName(loginName: string): string {
  const trimmed = loginName.trim();
  if (!trimmed) {
    return "?";
  }
  const local = trimmed.includes("@") ? (trimmed.split("@")[0] ?? trimmed) : trimmed;
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return local.slice(0, 1).toUpperCase() || "?";
}
