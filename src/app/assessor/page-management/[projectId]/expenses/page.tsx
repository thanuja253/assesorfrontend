"use client";

import { useParams } from "next/navigation";
import FinanceInvoiceTabs from "./FinanceInvoiceTabs";

export default function AssessorProjectExpensesPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";

  return (
    <div className="space-y-2">
      <FinanceInvoiceTabs projectId={projectId} useFacilitatorApi />
    </div>
  );
}
