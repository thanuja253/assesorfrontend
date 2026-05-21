"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AuthApiError } from "@/lib/auth-api";
import {
  ASSESSOR_NOTIFICATIONS_REFRESH_EVENT,
  listAssessorNotifications,
  markAllAssessorNotificationsSeen,
  markAssessorNotificationSeen,
  type AssessorNotification,
} from "@/lib/assessor-notifications-api";

const POLL_MS = 45_000;

type AssessorNotificationsContextValue = {
  notifications: AssessorNotification[];
  notificationsCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markSeen: (id: string) => Promise<void>;
  markAllSeen: () => Promise<void>;
};

const AssessorNotificationsContext = createContext<AssessorNotificationsContextValue | null>(null);

export function useAssessorNotifications(): AssessorNotificationsContextValue {
  const ctx = useContext(AssessorNotificationsContext);
  if (!ctx) {
    throw new Error("useAssessorNotifications must be used within AssessorNotificationsProvider");
  }
  return ctx;
}

export function AssessorNotificationsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [notifications, setNotifications] = useState<AssessorNotification[]>([]);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await listAssessorNotifications({ skip: 0, limit: 50 });
      setNotifications(result.notifications);
      setNotificationsCount(result.notificationsCount);
      setError("");
    } catch (e: unknown) {
      if (e instanceof AuthApiError && e.status === 401) {
        setError("");
        setNotifications([]);
        setNotificationsCount(0);
      } else {
        setError(e instanceof AuthApiError ? e.message : "Could not load notifications.");
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  const markSeen = useCallback(
    async (id: string) => {
      await markAssessorNotificationSeen(id);
      await refresh();
    },
    [refresh],
  );

  const markAllSeen = useCallback(async () => {
    await markAllAssessorNotificationsSeen();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const intervalId = globalThis.window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onRefreshEvent = () => {
      void refresh();
    };
    globalThis.window.addEventListener(ASSESSOR_NOTIFICATIONS_REFRESH_EVENT, onRefreshEvent);

    return () => {
      globalThis.window.clearInterval(intervalId);
      globalThis.window.removeEventListener(ASSESSOR_NOTIFICATIONS_REFRESH_EVENT, onRefreshEvent);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      notifications,
      notificationsCount,
      loading,
      error,
      refresh,
      markSeen,
      markAllSeen,
    }),
    [notifications, notificationsCount, loading, error, refresh, markSeen, markAllSeen],
  );

  return (
    <AssessorNotificationsContext.Provider value={value}>
      {children}
    </AssessorNotificationsContext.Provider>
  );
}
