"use client";

import type { ReactNode } from "react";
import { GreencoLogo } from "@/components/GreencoLogo";
import { AssessorHeaderUser } from "@/components/assessor/AssessorHeaderUser";
import { AssessorNotificationBell } from "@/components/assessor/AssessorNotificationBell";
import { AssessorNotificationPoller } from "@/components/assessor/AssessorNotificationPoller";
import { AssessorNotificationsProvider } from "@/components/assessor/AssessorNotificationsProvider";
import { AssessorSideNav } from "@/components/assessor/AssessorSideNav";

export function AssessorAppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AssessorNotificationsProvider>
      <AssessorNotificationPoller />
      <div className="min-h-screen bg-[var(--gc-page)]">
        <div className="flex min-h-screen">
          <aside className="w-[220px] shrink-0 bg-[var(--gc-sidebar)] text-white">
            <div className="flex h-24 items-center justify-center border-b border-white/20 px-4">
              <GreencoLogo width={72} height={72} alt="Greenco" />
            </div>
            <AssessorSideNav />
          </aside>

          <div className="flex min-h-screen flex-1 flex-col">
            <header className="flex h-14 items-center justify-end border-b border-[#d5e8dc] bg-white px-6">
              <AssessorNotificationBell />
              <AssessorHeaderUser />
            </header>
            <main className="flex-1 p-4">{children}</main>
          </div>
        </div>
      </div>
    </AssessorNotificationsProvider>
  );
}
