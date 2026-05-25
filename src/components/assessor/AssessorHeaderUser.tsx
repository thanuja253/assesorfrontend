"use client";

import { useStoredAuthUser } from "@/components/assessor/use-stored-auth-user";

export function AssessorHeaderUser({
  roleLabel = "Facilitator",
}: Readonly<{ roleLabel?: "Facilitator" | "Assessor" }>) {
  const { loginName, displayHandle, initials } = useStoredAuthUser();

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e67e22] text-sm font-semibold text-white"
        aria-hidden
      >
        {initials}
      </div>
      <div className="text-right">
        <p
          className="max-w-[200px] truncate text-xs font-semibold text-[#28303a]"
          title={loginName || undefined}
        >
          {displayHandle || "—"}
        </p>
        <p className="text-[10px] text-[#747d89]">{roleLabel}</p>
      </div>
    </div>
  );
}
