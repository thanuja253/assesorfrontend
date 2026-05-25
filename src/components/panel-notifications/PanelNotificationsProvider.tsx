"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  listPanelNotifications,
  markAllPanelNotificationsSeen,
  markPanelNotificationSeen,
  panelNotificationsRefreshEvent,
  type PanelNotification,
  type PanelNotificationRole,
} from "@/lib/panel-notifications-api";

type PanelNotificationsContextValue = {
  role: PanelNotificationRole;
  notifications: PanelNotification[];
  unreadCount: number;
  loading: boolean;
  apiAvailable: boolean;
  refresh: () => Promise<void>;
  markSeen: (id: string) => Promise<void>;
  markAllSeen: () => Promise<void>;
};

const PanelNotificationsContext = createContext<PanelNotificationsContextValue | null>(null);

const POLL_MS = 45_000;

export function usePanelNotifications(): PanelNotificationsContextValue {
  const ctx = useContext(PanelNotificationsContext);
  if (!ctx) {
    throw new Error("usePanelNotifications must be used within PanelNotificationsProvider");
  }
  return ctx;
}

/** Same notifications as bell/toast when inside panel layout; null otherwise. */
export function useOptionalPanelNotifications(): PanelNotificationsContextValue | null {
  return useContext(PanelNotificationsContext);
}

export function PanelNotificationsProvider({
  role,
  children,
}: Readonly<{ role: PanelNotificationRole; children: ReactNode }>) {
  const [notifications, setNotifications] = useState<PanelNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await listPanelNotifications(role, { skip: 0, limit: 50 });
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const markSeen = useCallback(
    async (id: string) => {
      await markPanelNotificationSeen(role, id);
      setNotifications((prev) =>
        prev.map((row) => (row.id === id ? { ...row, seen: true } : row)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    },
    [role],
  );

  const markAllSeen = useCallback(async () => {
    await markAllPanelNotificationsSeen(role);
    setNotifications((prev) => prev.map((row) => ({ ...row, seen: true })));
    setUnreadCount(0);
  }, [role]);

  useEffect(() => {
    void refresh();
    const intervalId = globalThis.window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onRefresh = () => {
      void refresh();
    };
    globalThis.window.addEventListener(panelNotificationsRefreshEvent(role), onRefresh);

    return () => {
      globalThis.window.clearInterval(intervalId);
      globalThis.window.removeEventListener(panelNotificationsRefreshEvent(role), onRefresh);
    };
  }, [refresh, role]);

  const value = useMemo(
    () => ({
      role,
      notifications,
      unreadCount,
      loading,
      apiAvailable,
      refresh,
      markSeen,
      markAllSeen,
    }),
    [role, notifications, unreadCount, loading, apiAvailable, refresh, markSeen, markAllSeen],
  );

  return (
    <PanelNotificationsContext.Provider value={value}>{children}</PanelNotificationsContext.Provider>
  );
}
