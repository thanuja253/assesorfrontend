"use client";

import { useParams } from "next/navigation";
import FinanceV2InvoiceList from "../FinanceV2InvoiceList";

export default function AssessorFinanceTaxInvoicePage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";

  return <FinanceV2InvoiceList projectId={projectId} filterMode="tax" heading="Tax invoice" />;
}
