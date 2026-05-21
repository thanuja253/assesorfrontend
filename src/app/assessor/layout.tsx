import type { ReactNode } from "react";
import { AssessorAppShell } from "@/components/assessor/AssessorAppShell";

export default function AssessorLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <AssessorAppShell>{children}</AssessorAppShell>;
}
