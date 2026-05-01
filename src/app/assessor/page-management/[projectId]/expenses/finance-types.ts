export type FinanceTabKey = "proforma-tax" | "tax-invoice" | "expenses";

export type ExpenseInvoiceView = {
  id?: string;
  _id?: string;
  invoice_title?: string;
  invoicetitle?: string;
  approval_remarks?: string;
  remarks?: string;
  payment_status?: number | string;
  trans_id?: string;
  transaction_id?: string;
  invoice_document_filename?: string;
  invoice_document_url?: string;
  document_url?: string;
  file_url?: string;
  payment_for?: string;
  type?: string;
  invoice_type?: string;
  status?: string | number;
  approval_status?: string | number;
  approval_status_label?: string;
  approval_status_color?: string;
  payment_mode?: string;
  transaction_mode?: string;
  supporting_document_filename?: string;
  supporting_doc_filename?: string;
  supporting_document_url?: string;
  supporting_doc_url?: string;
  supporting_document?: string;
  supporting_doc?: string;
  supporting_file?: string;
  upload_document?: string;
  offline_tran_doc?: string;
  offline_tran_doc_filename?: string;
  offline_tran_doc_history?: unknown;
  can_resubmit?: boolean;
  can_reupload?: boolean;
  payable_amount?: number | string;
  tax_amount?: number | string;
  total_amount?: number | string;
};

export function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function invoiceId(invoice: ExpenseInvoiceView): string {
  return asText(invoice.id ?? invoice._id);
}

export function invoiceTitle(invoice: ExpenseInvoiceView): string {
  return asText(invoice.invoice_title ?? invoice.invoicetitle) || "Untitled Invoice";
}

export function invoiceRemarks(invoice: ExpenseInvoiceView): string {
  return asText(invoice.approval_remarks ?? invoice.remarks);
}

export function invoiceDocName(invoice: ExpenseInvoiceView): string {
  return asText(invoice.invoice_document_filename);
}

export function invoiceDocUrl(invoice: ExpenseInvoiceView): string {
  return asText(invoice.invoice_document_url ?? invoice.document_url ?? invoice.file_url);
}

export function invoiceType(invoice: ExpenseInvoiceView): string {
  return asText(invoice.invoice_type ?? invoice.type ?? invoice.payment_for).toLowerCase();
}

export function invoiceApprovalText(invoice: ExpenseInvoiceView): string {
  return asText(invoice.approval_status_label ?? invoice.approval_status ?? invoice.status).toLowerCase();
}

export function invoiceApprovalCode(invoice: ExpenseInvoiceView): number | null {
  const raw = invoice.approval_status ?? invoice.status;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export function invoiceTransactionId(invoice: ExpenseInvoiceView): string {
  return asText(invoice.transaction_id ?? invoice.trans_id);
}

export function invoiceSupportingDocumentName(invoice: ExpenseInvoiceView): string {
  const directName = asText(
    invoice.supporting_document_filename ??
      invoice.supporting_doc_filename ??
      invoice.offline_tran_doc_filename ??
      invoice.supporting_document ??
      invoice.supporting_doc ??
      invoice.supporting_file ??
      invoice.upload_document ??
      invoice.offline_tran_doc,
  );
  if (directName) return directName.split("/").pop() ?? directName;

  if (Array.isArray(invoice.offline_tran_doc_history) && invoice.offline_tran_doc_history.length > 0) {
    const latest =
      invoice.offline_tran_doc_history[invoice.offline_tran_doc_history.length - 1] ??
      invoice.offline_tran_doc_history[0];
    if (latest && typeof latest === "object") {
      const entry = latest as Record<string, unknown>;
      const historyName = asText(entry.filename ?? entry.path);
      if (historyName) return historyName.split("/").pop() ?? historyName;
    }
  }

  const url = asText(invoice.supporting_document_url ?? invoice.supporting_doc_url);
  if (!url) return "";
  const withoutQuery = url.split("?")[0] ?? url;
  return withoutQuery.split("/").pop() ?? "";
}

export function invoiceStatusLabel(invoice: ExpenseInvoiceView): string {
  const approvalCode = invoiceApprovalCode(invoice);
  if (approvalCode === 1) return "Accepted";
  if (approvalCode === 2) return "Rejected";
  if (approvalCode === 0) return "Pending";
  const approvalColor = asText(invoice.approval_status_color).toLowerCase();
  if (approvalColor === "danger" || approvalColor === "red" || approvalColor === "rejected") return "Rejected";
  const approval = invoiceApprovalText(invoice);
  if (approval.includes("approved") || approval.includes("accepted")) return "Accepted";
  if (approval.includes("rejected")) return "Rejected";
  if (approval.includes("pending")) return "Pending";
  const paymentStatus = Number(invoice.payment_status);
  if (Number.isFinite(paymentStatus) && paymentStatus === 1) return "Pending";
  if (invoice.can_resubmit || invoice.can_reupload) return "Rejected";
  return "Pending";
}

export function invoiceAmountText(invoice: ExpenseInvoiceView): string {
  const total = asText(invoice.total_amount);
  if (total) return total;
  const payable = asText(invoice.payable_amount);
  return payable || "—";
}
