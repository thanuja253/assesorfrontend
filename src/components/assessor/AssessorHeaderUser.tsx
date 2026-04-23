"use client";

import { useStoredAuthUser } from "@/components/assessor/use-stored-auth-user";

export function AssessorHeaderUser() {
  const { loginName, displayHandle } = useStoredAuthUser();

  return (
    <div className="text-right">
      <p
        className="max-w-[200px] truncate text-xs font-semibold text-[#28303a]"
        title={loginName || undefined}
      >
        {displayHandle || "—"}
      </p>
      <p className="text-[10px] text-[#747d89]">Assessor</p>
    </div>
  );
}
