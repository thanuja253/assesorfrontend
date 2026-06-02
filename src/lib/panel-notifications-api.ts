import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

export type PanelNotificationRole = "facilitator" | "assessor";

export type PanelNotification = {
  id: string;
  title: string;
  message: string;
  seen: boolean;
  createdAt: string;
  projectId?: string;
};

export type PanelNotificationsListResult = {
  notifications: PanelNotification[];
  unreadCount: number;
};

const LIST_PATH: Record<PanelNotificationRole, string> = {
  facilitator: "/api/facilitator/notifications",
  assessor: "/api/assessor/notifications",
};

const LAST_TOAST_KEY: Record<PanelNotificationRole, string> = {
  facilitator: "gc_facilitator_notification_last_toast_id",
  assessor: "gc_assessor_notification_last_toast_id",
};

const TOASTED_IDS_KEY: Record<PanelNotificationRole, string> = {
  facilitator: "gc_facilitator_notification_toasted_ids",
  assessor: "gc_assessor_notification_toasted_ids",
};

function getStoredToken(): string | null {
  if (globalThis.window === undefined) return null;
  return globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function pickRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return "";
}

function pickBool(source: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const raw = source[key];
    if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
    if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  }
  return false;
}

function normalizeNotification(row: Record<string, unknown>): PanelNotification | null {
  const id = pickString(row, ["id", "_id", "notification_id", "notificationId"]);
  if (!id) return null;
  const title = pickString(row, ["title", "subject", "heading"]) || pickString(row, ["message", "body", "content"]);
  const message = pickString(row, ["message", "body", "content", "description"]) || title;
  if (!title && !message) return null;
  const seen = pickBool(row, ["seen", "is_seen", "isSeen", "read", "is_read", "isRead"]);
  const createdAt =
    pickString(row, ["created_at", "createdAt", "created_on", "createdOn", "timestamp"]) || "";
  const projectId = pickString(row, ["project_id", "projectId", "projectid"]) || undefined;
  return {
    id,
    title: title || message,
    message: message || title,
    seen,
    createdAt,
    projectId,
  };
}

function normalizeListPayload(data: unknown): PanelNotificationsListResult {
  const root = pickRecord(data);
  const inner = pickRecord(root.data ?? root.payload ?? root.result);
  const container = Object.keys(inner).length > 0 ? inner : root;

  const listRaw =
    container.notifications ??
    container.notification_list ??
    container.items ??
    container.rows ??
    root.notifications;
  const rows = Array.isArray(listRaw) ? listRaw : [];

  const notifications = rows
    .map((entry) => normalizeNotification(pickRecord(entry)))
    .filter((row): row is PanelNotification => row !== null);

  const unreadFromCount = container.notificationsCount ?? container.notifications_count;
  const unreadFromTotal = container.unread_count ?? container.unreadCount;
  let unreadCount = 0;
  if (typeof unreadFromCount === "number" && Number.isFinite(unreadFromCount)) {
    unreadCount = Math.max(0, unreadFromCount);
  } else if (typeof unreadFromCount === "string" && unreadFromCount.trim()) {
    const parsed = Number(unreadFromCount);
    if (Number.isFinite(parsed)) unreadCount = Math.max(0, parsed);
  } else if (typeof unreadFromTotal === "number" && Number.isFinite(unreadFromTotal)) {
    unreadCount = Math.max(0, unreadFromTotal);
  } else {
    unreadCount = notifications.filter((n) => !n.seen).length;
  }

  return { notifications, unreadCount };
}

export function panelNotificationsRefreshEvent(role: PanelNotificationRole): string {
  return `gc_${role}_notifications_refresh`;
}

const PRIMARY_DATA_REJECTION_HINT_KEY = "gc_facilitator_primary_data_rejection_hint";

function parseRejectionBlob(blob: string): { rejected: boolean; sectionCode: string } {
  const text = blob.trim().toLowerCase();
  const isPrimaryDataRejection =
    text.includes("primary data section not accepted") ||
    text.includes("primary-data section not accepted") ||
    text.includes("section not accepted") ||
    text.includes("primary data has been rejected") ||
    text.includes("primary data form has been rejected") ||
    ((text.includes("primary data") || text.includes("primary-data")) &&
      (text.includes("not accepted") || text.includes("rejected") || text.includes("not approved")));
  if (!isPrimaryDataRejection) {
    return { rejected: false, sectionCode: "" };
  }
  const sectionMatch =
    text.match(/not accepted\s*\(([a-z0-9_]+)\)/i) ??
    text.match(/section not accepted\s*\(([a-z0-9_]+)\)/i) ??
    text.match(/primary data[^()]*\(([a-z0-9_]+)\)/i);
  return {
    rejected: true,
    sectionCode: sectionMatch?.[1]?.toUpperCase() ?? "",
  };
}

/** Written when toast shows — quick-view reads the same rejection the user sees. */
export function recordPrimaryDataRejectionHint(
  projectId: string,
  title: string,
  message: string,
): void {
  if (globalThis.window === undefined) return;
  const blob = `${title} ${message}`;
  const parsed = parseRejectionBlob(blob);
  if (!parsed.rejected) return;
  globalThis.window.sessionStorage.setItem(
    PRIMARY_DATA_REJECTION_HINT_KEY,
    JSON.stringify({
      projectId: projectId.trim(),
      sectionCode: parsed.sectionCode,
      at: Date.now(),
    }),
  );
}

export function readPrimaryDataRejectionHint(projectId: string): { rejected: boolean; sectionCode: string } {
  if (globalThis.window === undefined) return { rejected: false, sectionCode: "" };
  const raw = globalThis.window.sessionStorage.getItem(PRIMARY_DATA_REJECTION_HINT_KEY);
  if (!raw) return { rejected: false, sectionCode: "" };
  try {
    const parsed = JSON.parse(raw) as { projectId?: string; sectionCode?: string; at?: number };
    const hintProjectId = typeof parsed.projectId === "string" ? parsed.projectId.trim().toLowerCase() : "";
    const pid = projectId.trim().toLowerCase();
    if (hintProjectId && pid && hintProjectId !== pid) {
      return { rejected: false, sectionCode: "" };
    }
    const sectionCode =
      typeof parsed.sectionCode === "string" ? parsed.sectionCode.trim().toUpperCase() : "";
    return { rejected: true, sectionCode };
  } catch {
    return { rejected: false, sectionCode: "" };
  }
}

export type PrimaryDataNotificationState = "none" | "rejected" | "resubmitted" | "accepted";

function classifyPrimaryDataNotification(blob: string): { state: PrimaryDataNotificationState; sectionCode: string } {
  const isReupload =
    blob.includes("re-uploaded primary data") ||
    blob.includes("re uploaded primary data") ||
    blob.includes("reuploaded primary data") ||
    blob.includes("company re-uploaded primary") ||
    blob.includes("company reuploaded primary") ||
    blob.includes("resubmitted primary data") ||
    blob.includes("primary data resubmitted") ||
    blob.includes("primary data re-uploaded") ||
    blob.includes("primary data reuploaded") ||
    blob.includes("primary data re-submitted");
  const isAcceptance =
    !blob.includes("not accepted") &&
    !blob.includes("not approved") &&
    (blob.includes("primary data") || blob.includes("primary-data")) &&
    (blob.includes("accepted") || blob.includes("approved"));
  const isRejection =
    blob.includes("primary data section not accepted") ||
    blob.includes("primary-data section not accepted") ||
    blob.includes("section not accepted") ||
    blob.includes("primary data has been rejected") ||
    blob.includes("primary data form has been rejected") ||
    ((blob.includes("primary data") || blob.includes("primary-data")) &&
      (blob.includes("not accepted") || blob.includes("rejected") || blob.includes("not approved")));

  const sectionMatch =
    blob.match(/not accepted\s*\(([a-z0-9_]+)\)/i) ??
    blob.match(/section not accepted\s*\(([a-z0-9_]+)\)/i) ??
    blob.match(/re-?uploaded\s+primary\s+data\s*\(([a-z0-9_ ]+)\)/i) ??
    blob.match(/primary data[^()]*\(([a-z0-9_]+)\)/i);
  const sectionCode = sectionMatch?.[1]?.trim().toUpperCase() ?? "";

  if (isReupload) return { state: "resubmitted", sectionCode };
  if (isAcceptance) return { state: "accepted", sectionCode };
  if (isRejection) return { state: "rejected", sectionCode };
  return { state: "none", sectionCode: "" };
}

/**
 * Walk notifications newest-first and return the **latest** primary-data event
 * for this project: rejection, re-upload, acceptance, or none.
 */
export function parsePrimaryDataLatestStateFromNotifications(
  notifications: PanelNotification[],
  projectId = "",
): { state: PrimaryDataNotificationState; sectionCode: string } {
  const pid = projectId.trim().toLowerCase();
  const ordered = [...notifications].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    return tb - ta;
  });
  for (const row of ordered) {
    const rowProjectId = row.projectId?.trim().toLowerCase() ?? "";
    if (pid && rowProjectId && rowProjectId !== pid) continue;
    const blob = `${row.title} ${row.message}`.trim().toLowerCase();
    const result = classifyPrimaryDataNotification(blob);
    if (result.state !== "none") return result;
  }
  return { state: "none", sectionCode: "" };
}

/** Backwards-compatible: returns rejection only when latest event IS a rejection (not superseded by re-upload). */
export function parsePrimaryDataRejectionFromNotifications(
  notifications: PanelNotification[],
  projectId = "",
): { rejected: boolean; sectionCode: string } {
  const latest = parsePrimaryDataLatestStateFromNotifications(notifications, projectId);
  if (latest.state === "rejected") return { rejected: true, sectionCode: latest.sectionCode };
  return { rejected: false, sectionCode: "" };
}

/** True when the most recent notification for this project is a re-upload (company resubmitted after rejection). */
export function parsePrimaryDataResubmissionFromNotifications(
  notifications: PanelNotification[],
  projectId = "",
): { resubmitted: boolean; sectionCode: string } {
  const latest = parsePrimaryDataLatestStateFromNotifications(notifications, projectId);
  if (latest.state === "resubmitted") return { resubmitted: true, sectionCode: latest.sectionCode };
  return { resubmitted: false, sectionCode: "" };
}

export type ChecklistNotificationState = "none" | "uploaded" | "rejected" | "accepted";

/**
 * Parse facilitator notifications for assessment checklist events.
 * Returns the latest event: uploaded, rejected, accepted, or none.
 */
export function parseChecklistLatestStateFromNotifications(
  notifications: PanelNotification[],
  projectId = "",
): { state: ChecklistNotificationState; category: string; remarks: string } {
  const pid = projectId.trim().toLowerCase();
  const ordered = [...notifications].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    return tb - ta;
  });
  for (const row of ordered) {
    const rowProjectId = row.projectId?.trim().toLowerCase() ?? "";
    if (pid && rowProjectId && rowProjectId !== pid) continue;
    const blob = `${row.title} ${row.message}`.trim().toLowerCase();
    const isChecklist =
      blob.includes("assessment checklist") ||
      blob.includes("checklist document") ||
      blob.includes("assessment submittal");
    if (!isChecklist) continue;

    const categoryMatch = blob.match(/categor(?:y|ies)[:\s]*([^.]+)/i);
    const remarksMatch = blob.match(/remarks?[:\s]*([^.]+)/i);
    const category = categoryMatch?.[1]?.trim() ?? "";
    const remarks = remarksMatch?.[1]?.trim() ?? "";

    if (blob.includes("not accepted") || blob.includes("rejected") || blob.includes("not approved")) {
      return { state: "rejected", category, remarks };
    }
    if (
      !blob.includes("not accepted") &&
      !blob.includes("not approved") &&
      (blob.includes("accepted") || blob.includes("approved"))
    ) {
      return { state: "accepted", category, remarks };
    }
    if (blob.includes("uploaded") || blob.includes("submitted")) {
      return { state: "uploaded", category, remarks };
    }
  }
  return { state: "none", category: "", remarks: "" };
}

export type ProformaNotificationState =
  | "none"
  | "2nd_proforma_uploaded"
  | "supporting_docs_uploaded"
  | "supporting_docs_awaiting_review"
  | "supporting_docs_rejected"
  | "supporting_docs_reuploaded"
  | "supporting_docs_approved"
  | "plaque_dispatched"
  | "feedback_uploaded";

export function parse2ndProformaLatestStateFromNotifications(
  notifications: PanelNotification[],
  projectId = "",
): { state: ProformaNotificationState; remarks: string } {
  const pid = projectId.trim().toLowerCase();
  const ordered = [...notifications].sort((a, b) => {
    const ta = Date.parse(a.createdAt || "") || 0;
    const tb = Date.parse(b.createdAt || "") || 0;
    return tb - ta;
  });
  for (const row of ordered) {
    const rowProjectId = row.projectId?.trim().toLowerCase() ?? "";
    if (pid && rowProjectId && rowProjectId !== pid) continue;
    const blob = `${row.title} ${row.message}`.trim().toLowerCase();
    const isSupportingDoc = blob.includes("supporting document") || blob.includes("supporting doc");
    const remarksMatch = /remarks?[:\s–—-]*([^–—]+)/i.exec(blob);
    const remarks = remarksMatch?.[1]?.trim() ?? "";

    if (blob.includes("feedback") && (blob.includes("uploaded") || blob.includes("submitted") || blob.includes("done"))) {
      return { state: "feedback_uploaded", remarks };
    }

    if (
      (blob.includes("plaque") && (blob.includes("dispatched") || blob.includes("done") || blob.includes("raised"))) ||
      (blob.includes("plaque") && blob.includes("certificate") && blob.includes("dispatched"))
    ) {
      return { state: "plaque_dispatched", remarks };
    }

    if (isSupportingDoc && (blob.includes("approved") || blob.includes("accepted")) && !blob.includes("not approved") && !blob.includes("not accepted")) {
      return { state: "supporting_docs_approved", remarks };
    }

    if (isSupportingDoc && (blob.includes("rejected") || blob.includes("not approved") || blob.includes("not accepted"))) {
      return { state: "supporting_docs_rejected", remarks };
    }

    if (isSupportingDoc && (blob.includes("re-upload") || blob.includes("reupload") || blob.includes("re upload"))) {
      return { state: "supporting_docs_reuploaded", remarks };
    }

    if (isSupportingDoc && (blob.includes("uploaded") || blob.includes("submitted"))) {
      if (blob.includes("awaiting") && blob.includes("review")) {
        return { state: "supporting_docs_awaiting_review", remarks };
      }
      return { state: "supporting_docs_uploaded", remarks };
    }

    if (
      blob.includes("2nd proforma") ||
      (blob.includes("proforma invoice") && blob.includes("uploaded"))
    ) {
      return { state: "2nd_proforma_uploaded", remarks };
    }
  }
  return { state: "none", remarks: "" };
}

export function refreshPanelNotifications(role: PanelNotificationRole): void {
  if (globalThis.window === undefined) return;
  globalThis.window.dispatchEvent(new CustomEvent(panelNotificationsRefreshEvent(role)));
}

export function getLastToastNotificationId(role: PanelNotificationRole): string {
  if (globalThis.window === undefined) return "";
  return globalThis.window.sessionStorage.getItem(LAST_TOAST_KEY[role]) ?? "";
}

export function setLastToastNotificationId(role: PanelNotificationRole, id: string): void {
  if (globalThis.window === undefined) return;
  globalThis.window.sessionStorage.setItem(LAST_TOAST_KEY[role], id);
}

export function getToastedNotificationIds(role: PanelNotificationRole): Set<string> {
  if (globalThis.window === undefined) return new Set();
  const raw = globalThis.window.sessionStorage.getItem(TOASTED_IDS_KEY[role]);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function addToastedNotificationId(role: PanelNotificationRole, id: string): void {
  if (globalThis.window === undefined) return;
  const next = getToastedNotificationIds(role);
  next.add(id);
  const list = [...next].slice(-100);
  globalThis.window.sessionStorage.setItem(TOASTED_IDS_KEY[role], JSON.stringify(list));
  setLastToastNotificationId(role, id);
}

export async function listPanelNotifications(
  role: PanelNotificationRole,
  options?: { skip?: number; limit?: number },
): Promise<PanelNotificationsListResult> {
  const skip = options?.skip ?? 0;
  const limit = options?.limit ?? 50;
  const path = `${LIST_PATH[role]}?skip=${skip}&limit=${limit}`;

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(response.status, parseApiErrorMessage(data) ?? "Could not load notifications.");
  }

  return normalizeListPayload(data);
}

export async function markPanelNotificationSeen(
  role: PanelNotificationRole,
  notificationId: string,
): Promise<void> {
  const id = notificationId.trim();
  if (!id) return;

  let response: Response;
  try {
    response = await fetch(getApiUrl(`${LIST_PATH[role]}/${encodeURIComponent(id)}/seen`), {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  if (!response.ok) {
    const data = await parseJsonSafe(response);
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not update notification.",
    );
  }
}

export async function markAllPanelNotificationsSeen(role: PanelNotificationRole): Promise<void> {
  let response: Response;
  try {
    response = await fetch(getApiUrl(`${LIST_PATH[role]}/seen`), {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  if (!response.ok) {
    const data = await parseJsonSafe(response);
    throw new AuthApiError(response.status, parseApiErrorMessage(data) ?? "Could not update notifications.");
  }
}
