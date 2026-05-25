"use client";

import { useEffect, useRef, useState } from "react";
import { addToastedNotificationId, getToastedNotificationIds } from "@/lib/panel-notifications-api";
import { PanelNotificationToast } from "@/components/panel-notifications/PanelNotificationToast";
import { usePanelNotifications } from "@/components/panel-notifications/PanelNotificationsProvider";

export function PanelNotificationPoller() {
  const { role, notifications, apiAvailable, markSeen } = usePanelNotifications();
  const [activeToast, setActiveToast] = useState<{ id: string; title: string; message: string } | null>(
    null,
  );
  const queueRef = useRef<Array<{ id: string; title: string; message: string }>>([]);
  const showingRef = useRef(false);

  useEffect(() => {
    if (!apiAvailable || showingRef.current) return;

    const toastedIds = getToastedNotificationIds(role);
    const unread = notifications.filter((n) => !n.seen);
    const fresh = unread.filter((n) => !toastedIds.has(n.id));

    if (fresh.length === 0) return;

    queueRef.current = fresh.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
    }));

    const next = queueRef.current.shift();
    if (!next) return;

    showingRef.current = true;
    setActiveToast(next);
  }, [notifications, apiAvailable, role]);

  const dismissActive = async () => {
    if (!activeToast) return;
    const { id, title, message } = activeToast;
    addToastedNotificationId(role, id);
    try {
      await markSeen(id);
    } catch {
      /* polling will retry; still advance queue */
    }
    setActiveToast(null);
    showingRef.current = false;

    const next = queueRef.current.shift();
    if (next) {
      showingRef.current = true;
      setActiveToast(next);
    }
  };

  if (!activeToast) return null;

  return (
    <PanelNotificationToast
      title={activeToast.title}
      message={activeToast.message}
      onDismiss={() => {
        void dismissActive();
      }}
    />
  );
}
