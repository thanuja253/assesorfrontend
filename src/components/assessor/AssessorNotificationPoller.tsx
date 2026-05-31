"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import {
  getLastToastedNotificationId,
  markAssessorNotificationSeen,
  refreshAssessorNotifications,
  setLastToastedNotificationId,
  type AssessorNotification,
} from "@/lib/assessor-notifications-api";
import { AssessorNotificationToast } from "@/components/assessor/AssessorNotificationToast";
import { useAssessorNotifications } from "@/components/assessor/AssessorNotificationsProvider";

function notificationSortKey(n: AssessorNotification): number {
  const idNum = Number(n.id);
  if (!Number.isNaN(idNum)) return idNum;
  const time = n.createdAt ? Date.parse(n.createdAt) : 0;
  return Number.isNaN(time) ? 0 : time;
}

export function AssessorNotificationPoller() {
  const { notifications } = useAssessorNotifications();
  const [activeToast, setActiveToast] = useState<AssessorNotification | null>(null);
  const queueRef = useRef<AssessorNotification[]>([]);
  const showingRef = useRef(false);

  const dequeueNext = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setActiveToast(null);
      return;
    }
    showingRef.current = true;
    setLastToastedNotificationId(next.id);
    setActiveToast(next);
  }, []);

  useEffect(() => {
    const lastId = getLastToastedNotificationId();
    const pending = notifications
      .filter((n) => !n.seen)
      .filter((n) => {
        const idNum = Number(n.id);
        if (!Number.isNaN(idNum)) return idNum > lastId;
        return true;
      })
      .sort((a, b) => notificationSortKey(a) - notificationSortKey(b));

    if (pending.length === 0) return;

    const queuedIds = new Set(queueRef.current.map((n) => n.id));
    if (activeToast) queuedIds.add(activeToast.id);

    for (const item of pending) {
      if (queuedIds.has(item.id)) continue;
      queueRef.current.push(item);
      queuedIds.add(item.id);
    }

    dequeueNext();
  }, [notifications, activeToast, dequeueNext]);

  const dismissToast = useCallback(async () => {
    const current = activeToast;
    setActiveToast(null);
    showingRef.current = false;
    if (current) {
      try {
        await markAssessorNotificationSeen(current.id);
        refreshAssessorNotifications();
      } catch (e: unknown) {
        if (!(e instanceof AuthApiError && e.status === 401)) {
          // sessionStorage last id already prevents duplicate toasts
        }
      }
    }
    dequeueNext();
  }, [activeToast, dequeueNext]);

  const dismissToastRef = useRef(dismissToast);
  dismissToastRef.current = dismissToast;

  useEffect(() => {
    if (!activeToast) return;

    const timerId = globalThis.window.setTimeout(() => {
      void dismissToastRef.current();
    }, 2000);

    return () => {
      globalThis.window.clearTimeout(timerId);
    };
  }, [activeToast?.id]);

  if (!activeToast) return null;

  return (
    <AssessorNotificationToast
      title={activeToast.title}
      message={activeToast.message}
      onClose={() => {
        void dismissToast();
      }}
    />
  );
}
