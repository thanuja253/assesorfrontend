"use client";

import { useStoredAuthUser } from "@/components/assessor/use-stored-auth-user";

export function AssessorDashboardWelcome() {
  const { loginName, displayHandle } = useStoredAuthUser();

  return (
    <p className="mb-2 text-3xl font-medium text-[#4b5363]" title={loginName || undefined}>
      Welcome {displayHandle || "—"}
    </p>
  );
}
