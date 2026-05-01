"use client";

import { useParams } from "next/navigation";
import FinanceInvoiceTabs from "./FinanceInvoiceTabs";

export default function AssessorProjectExpensesPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 rounded border border-[#dbe3ef] bg-white px-2 py-1 text-xs font-medium text-[#4e5a6b]">
        <span className="text-[#8f9bad]">⊟</span>
        <span>Finance</span>
      </div>
      <FinanceInvoiceTabs projectId={projectId} useFacilitatorApi />
    </div>
  );
}
