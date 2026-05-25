"use client";

import type { ReactNode } from "react";
import { PanelNotificationPoller } from "@/components/panel-notifications/PanelNotificationPoller";
import { PanelNotificationsProvider } from "@/components/panel-notifications/PanelNotificationsProvider";
import type { PanelNotificationRole } from "@/lib/panel-notifications-api";

export function PanelAppShell({
  role,
  children,
}: Readonly<{ role: PanelNotificationRole; children: ReactNode }>) {
  return (
    <PanelNotificationsProvider role={role}>
      <PanelNotificationPoller />
      {children}
    </PanelNotificationsProvider>
  );
}
