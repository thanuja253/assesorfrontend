"use client";

import { useParams } from "next/navigation";
import FinanceV2InvoiceList from "../FinanceV2InvoiceList";

export default function AssessorFinanceProformaInvoicePage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";

  return (
    <FinanceV2InvoiceList projectId={projectId} filterMode="proforma" heading="Proforma / Invoice" />
  );
}
