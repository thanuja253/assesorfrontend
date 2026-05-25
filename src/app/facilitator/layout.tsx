import type { ReactNode } from "react";
import { GreencoLogo } from "@/components/GreencoLogo";
import { AssessorSideNav } from "@/components/assessor/AssessorSideNav";
import { PanelAppShell } from "@/components/panel-notifications/PanelAppShell";
import { PanelHeaderBar } from "@/components/panel-notifications/PanelHeaderBar";

export default function FacilitatorLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <PanelAppShell role="facilitator">
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
              <PanelHeaderBar roleLabel="Facilitator" />
            </header>
            <main className="flex-1 p-4">{children}</main>
          </div>
        </div>
      </div>
    </PanelAppShell>
  );
}
