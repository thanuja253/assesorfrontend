import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

export type AssessorNotification = {
  id: string;
  title: string;
  message: string;
  seen: boolean;
  createdAt?: string;
};

export type AssessorNotificationsListResult = {
  notifications: AssessorNotification[];
  notificationsCount: number;
};

const LAST_TOAST_ID_KEY = "gc_assessor_notification_last_toast_id";

function getStoredToken(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }
  return globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
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

function toBoolSeen(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "seen" || lower === "read" || lower === "true" || lower === "yes") return true;
    if (lower === "unseen" || lower === "unread" || lower === "false" || lower === "no") return false;
  }
  return Boolean(value);
}

function pickNotificationId(raw: Record<string, unknown>): string {
  const id = raw.id ?? raw.notification_id ?? raw._id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  return "";
}

function normalizeNotification(raw: unknown): AssessorNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = pickNotificationId(rec);
  if (!id) return null;

  const title =
    (typeof rec.title === "string" && rec.title.trim()) ||
    (typeof rec.subject === "string" && rec.subject.trim()) ||
    (typeof rec.heading === "string" && rec.heading.trim()) ||
    "";

  const message =
    (typeof rec.message === "string" && rec.message.trim()) ||
    (typeof rec.content === "string" && rec.content.trim()) ||
    (typeof rec.body === "string" && rec.body.trim()) ||
    (typeof rec.description === "string" && rec.description.trim()) ||
    (typeof rec.notification === "string" && rec.notification.trim()) ||
    "";

  const seen = toBoolSeen(
    rec.seen ?? rec.is_seen ?? rec.isSeen ?? rec.read ?? rec.is_read ?? rec.status,
  );

  const createdAt =
    (typeof rec.created_at === "string" && rec.created_at) ||
    (typeof rec.createdAt === "string" && rec.createdAt) ||
    (typeof rec.created_on === "string" && rec.created_on) ||
    undefined;

  return {
    id,
    title: title || message || "Notification",
    message: message || title || "Notification",
    seen,
    createdAt,
  };
}

function extractNotificationsList(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const payload = root.data ?? root.payload ?? root.result ?? root;
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") {
    if (Array.isArray(root.notifications)) return root.notifications;
    return [];
  }
  const rec = payload as Record<string, unknown>;
  const candidates = [rec.notifications, rec.items, rec.rows, rec.data, root.notifications];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractNotificationsCount(data: unknown, notifications: AssessorNotification[]): number {
  if (!data || typeof data !== "object") {
    return notifications.filter((n) => !n.seen).length;
  }
  const root = data as Record<string, unknown>;
  const payload = root.data ?? root.payload ?? root.result;
  const sources = [root, payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null];
  for (const source of sources) {
    if (!source) continue;
    const count = source.notificationsCount ?? source.notifications_count ?? source.unread_count;
    if (typeof count === "number" && !Number.isNaN(count)) return Math.max(0, count);
    if (typeof count === "string" && count.trim()) {
      const n = Number(count);
      if (!Number.isNaN(n)) return Math.max(0, n);
    }
  }
  return notifications.filter((n) => !n.seen).length;
}

function normalizeListResult(data: unknown): AssessorNotificationsListResult {
  const rawList = extractNotificationsList(data);
  const notifications = rawList
    .map((item) => normalizeNotification(item))
    .filter((item): item is AssessorNotification => item !== null);
  const notificationsCount = extractNotificationsCount(data, notifications);
  return { notifications, notificationsCount };
}

function throwNotificationError(status: number, data: unknown, fallback: string): never {
  if (status === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(data) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (status === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(data) ?? "Access denied.");
  }
  throw new AuthApiError(status || 500, parseApiErrorMessage(data) ?? fallback);
}

/**
 * GET /api/assessor/notifications?skip=0&limit=50
 */
export async function listAssessorNotifications(
  params: { skip?: number; limit?: number } = {},
): Promise<AssessorNotificationsListResult> {
  const skip = Math.max(0, params.skip ?? 0);
  const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
  const query = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });

  let response: Response;
  try {
    response = await fetch(getApiUrl(`/api/assessor/notifications?${query.toString()}`), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throwNotificationError(response.status, data, "Could not load notifications.");
  }
  return normalizeListResult(data);
}

/**
 * PATCH /api/assessor/notifications/:id/seen
 */
export async function markAssessorNotificationSeen(notificationId: string): Promise<void> {
  const id = notificationId?.trim();
  if (!id) {
    throw new AuthApiError(400, "Invalid notification id.");
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl(`/api/assessor/notifications/${encodeURIComponent(id)}/seen`), {
      method: "PATCH",
      headers: authHeaders(),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throwNotificationError(response.status, data, "Could not mark notification as seen.");
  }
}

/**
 * PATCH /api/assessor/notifications/seen
 */
export async function markAllAssessorNotificationsSeen(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(getApiUrl("/api/assessor/notifications/seen"), {
      method: "PATCH",
      headers: authHeaders(),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throwNotificationError(response.status, data, "Could not mark notifications as seen.");
  }
}

export function getLastToastedNotificationId(): number {
  if (globalThis.window === undefined) return 0;
  const raw = globalThis.window.sessionStorage.getItem(LAST_TOAST_ID_KEY) ?? "0";
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

export function setLastToastedNotificationId(id: string): void {
  if (globalThis.window === undefined) return;
  const n = Number(id);
  if (Number.isNaN(n)) return;
  const prev = getLastToastedNotificationId();
  if (n > prev) {
    globalThis.window.sessionStorage.setItem(LAST_TOAST_ID_KEY, String(n));
  }
}

export const ASSESSOR_NOTIFICATIONS_REFRESH_EVENT = "gc_assessor_notifications_refresh";

export function refreshAssessorNotifications(): void {
  if (globalThis.window === undefined) return;
  globalThis.window.dispatchEvent(new Event(ASSESSOR_NOTIFICATIONS_REFRESH_EVENT));
}
