"use client";

import { AssessorHeaderUser } from "@/components/assessor/AssessorHeaderUser";
import { PanelNotificationBell } from "@/components/panel-notifications/PanelNotificationBell";
export function PanelHeaderBar({
  roleLabel,
}: Readonly<{ roleLabel: "Facilitator" | "Assessor" }>) {
  return (
    <div className="flex items-center gap-4">
      <PanelNotificationBell />
      <AssessorHeaderUser roleLabel={roleLabel} />
    </div>
  );
}
