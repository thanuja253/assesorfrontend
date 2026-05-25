"use client";

import { useEffect, useRef, useState } from "react";
import { usePanelNotifications } from "@/components/panel-notifications/PanelNotificationsProvider";

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function PanelNotificationBell() {
  const { role, notifications, unreadCount, loading, apiAvailable, markSeen, markAllSeen, refresh } =
    usePanelNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const badge =
    unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#28303a] hover:bg-[#f0f4f2]"
        aria-label={
          badge
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon />
        {badge ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[#e67e22] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-[#d5e8dc] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[#e8ece9] px-3 py-2">
            <span className="text-sm font-semibold text-[#28303a]">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs text-[#166534] hover:underline"
                onClick={() => {
                  void markAllSeen();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!apiAvailable ? (
              <p className="px-3 py-4 text-xs text-[#747d89]">
                Notifications API is not available yet. Backend should expose GET /api/{role}
                /notifications on staging.
              </p>
            ) : loading && notifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[#747d89]">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[#747d89]">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-[#e8ece9]">
                {notifications.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2.5 text-left hover:bg-[#f8faf9] ${
                        row.seen ? "opacity-70" : "bg-[#f0fdf4]/40"
                      }`}
                      onClick={() => {
                        if (!row.seen) void markSeen(row.id);
                      }}
                    >
                      <p className="text-xs font-semibold text-[#28303a]">{row.title}</p>
                      {row.message !== row.title ? (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-[#747d89]">{row.message}</p>
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
