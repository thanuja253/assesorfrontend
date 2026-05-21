"use client";

import { useEffect, useRef, useState } from "react";
import { useAssessorNotifications } from "@/components/assessor/AssessorNotificationsProvider";

function formatWhen(createdAt?: string): string {
  if (!createdAt) return "";
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function AssessorNotificationBell() {
  const { notifications, notificationsCount, loading, error, refresh, markSeen, markAllSeen } =
    useAssessorNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    globalThis.window.addEventListener("mousedown", onPointerDown);
    return () => globalThis.window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const unread = notifications.filter((n) => !n.seen);
  const badge = notificationsCount > 0 ? (notificationsCount > 99 ? "99+" : String(notificationsCount)) : null;

  return (
    <div ref={panelRef} className="relative mr-4">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) void refresh();
        }}
        className="relative rounded-full border border-[#d5e8dc] bg-[#f4faf6] p-2 text-[#2d6a3e] hover:bg-[#e8f6ea]"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        {badge ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#c0392b] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] rounded border border-[#d5e8dc] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[#e8f0eb] px-3 py-2">
            <p className="text-sm font-semibold text-[#28303a]">Notifications</p>
            {unread.length > 0 ? (
              <button
                type="button"
                className="text-xs text-[#2d6a3e] hover:underline"
                onClick={() => {
                  void markAllSeen();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-sm text-[#747d89]">Loading…</p>
            ) : error ? (
              <p className="px-3 py-4 text-sm text-[#c0392b]">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[#747d89]">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-[#eef4f0]">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left hover:bg-[#f4faf6] ${item.seen ? "opacity-70" : ""}`}
                      onClick={() => {
                        if (!item.seen) void markSeen(item.id);
                        setOpen(false);
                      }}
                    >
                      <p className="text-sm font-medium text-[#28303a]">{item.title}</p>
                      {item.message !== item.title ? (
                        <p className="mt-0.5 text-xs text-[#5a6672]">{item.message}</p>
                      ) : null}
                      {item.createdAt ? (
                        <p className="mt-1 text-[10px] text-[#9aa5b1]">{formatWhen(item.createdAt)}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
