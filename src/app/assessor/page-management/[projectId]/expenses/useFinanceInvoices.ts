"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import {
  getAdminExpenseInvoices,
  getFacilitatorFinanceInvoiceApprovalStatus,
  getFacilitatorFinanceInvoices,
  submitFacilitatorFinanceInvoiceSupporting,
} from "@/lib/assessor-project-api";
import {
  asText,
  invoiceApprovalCode,
  invoiceApprovalText,
  invoiceAmountText,
  invoiceId,
  invoiceStatusLabel,
  invoiceSupportingDocumentName,
  invoiceTransactionId,
  invoiceType,
  type ExpenseInvoiceView,
  type FinanceTabKey,
} from "./finance-types";

function getTransactionIdError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Transaction ID is required.";
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(trimmed)) {
    return "Enter a valid transaction ID (6-40 letters, numbers, - or _).";
  }
  return null;
}

function getSupportingDocumentError(file: File | null): string | null {
  if (!file) return "Please choose a supporting document to upload/re-upload.";
  const allowedMime = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]);
  const allowedExt = new Set(["pdf", "jpg", "jpeg", "png"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeOk = allowedMime.has(file.type);
  const extOk = allowedExt.has(ext);
  if (!mimeOk && !extOk) {
    return "Only PDF, JPG, JPEG, or PNG files are allowed.";
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size <= 0) return "File is empty. Please upload a valid file.";
  if (file.size > maxBytes) return "File size must be 10 MB or less.";
  return null;
}

function categorizeInvoiceTabs(invoice: ExpenseInvoiceView): FinanceTabKey[] {
  const type = invoiceType(invoice);
  if (type.includes("expense")) return ["expenses"];
  if (type.includes("proforma")) return ["proforma-tax"];
  if (type.includes("tax")) return ["proforma-tax", "tax-invoice"];
  if (type.includes("invoice")) return ["proforma-tax", "tax-invoice"];
  return ["proforma-tax"];
}

function dedupeInvoicesById(list: ExpenseInvoiceView[]): ExpenseInvoiceView[] {
  const out: ExpenseInvoiceView[] = [];
  const seen = new Set<string>();
  for (const invoice of list) {
    const id = invoiceId(invoice);
    if (!id) {
      out.push(invoice);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(invoice);
  }
  return out;
}

function canEditPaymentForInvoice(invoice: ExpenseInvoiceView): boolean {
  const normalizedStatus = invoiceStatusLabel(invoice).toLowerCase();
  if (normalizedStatus === "rejected") return true;
  if (normalizedStatus === "accepted") return false;
  const approvalCode = invoiceApprovalCode(invoice);
  if (approvalCode === 1) return false;
  if (approvalCode === 2) return true;
  if (approvalCode === 0) {
    const hasTransactionId = !!invoiceTransactionId(invoice);
    const hasSupportingDoc = !!invoiceSupportingDocumentName(invoice);
    return !(hasTransactionId && hasSupportingDoc);
  }
  const approval = invoiceApprovalText(invoice);
  if (approval.includes("accepted") || approval.includes("approved")) return false;
  if (approval.includes("rejected")) return true;
  const hasTransactionId = !!invoiceTransactionId(invoice);
  const hasSupportingDoc = !!invoiceSupportingDocumentName(invoice);
  if (approval.includes("pending")) return !(hasTransactionId && hasSupportingDoc);
  if (invoice.can_resubmit || invoice.can_reupload) return true;
  const paymentStatus = Number(invoice.payment_status);
  if (Number.isFinite(paymentStatus) && paymentStatus === 1) return !(hasTransactionId && hasSupportingDoc);
  if (Number.isFinite(paymentStatus) && paymentStatus === 2) return true;
  return true;
}

export function useFinanceInvoices(projectId: string, useFacilitatorApi: boolean) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<ExpenseInvoiceView[]>([]);
  const [activeTab, setActiveTab] = useState<FinanceTabKey>("proforma-tax");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<FinanceTabKey, string | null>>({
    "proforma-tax": null,
    "tax-invoice": null,
    expenses: null,
  });
  const [transId, setTransId] = useState("");
  const [transactionMode, setTransactionMode] = useState("Offline");
  const [hasTouchedTransId, setHasTouchedTransId] = useState(false);
  const [hasTouchedSupportingFile, setHasTouchedSupportingFile] = useState(false);
  const [supportingFileName, setSupportingFileName] = useState("");
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const [localSupportingFileNameByInvoice, setLocalSupportingFileNameByInvoice] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lastApprovalFetchKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      setLoading(false);
      setError("Invalid project id.");
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    const loader = useFacilitatorApi ? getFacilitatorFinanceInvoices : getAdminExpenseInvoices;
    loader(projectId)
      .then((payload) => {
        if (cancelled) return;
        const nested = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
        const listRaw = Array.isArray(payload.invoices)
          ? payload.invoices
          : Array.isArray(nested.invoices)
            ? nested.invoices
            : [];
        const list = listRaw.filter((it): it is ExpenseInvoiceView => !!it && typeof it === "object");
        setInvoices(dedupeInvoicesById(list));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load invoices.");
        setInvoices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, useFacilitatorApi]);

  const invoicesByTab = useMemo(() => {
    const map: Record<FinanceTabKey, ExpenseInvoiceView[]> = {
      "proforma-tax": [],
      "tax-invoice": [],
      expenses: [],
    };
    invoices.forEach((invoice) => {
      const tabs = categorizeInvoiceTabs(invoice);
      tabs.forEach((tab) => {
        map[tab].push(invoice);
      });
    });
    return map;
  }, [invoices]);

  const orderedInvoicesForPicker = invoicesByTab[activeTab];
  const selectedInvoiceId = selectedInvoiceIds[activeTab] ?? invoiceId(orderedInvoicesForPicker[0] ?? {});
  const selectedInvoice =
    orderedInvoicesForPicker.find((invoice) => invoiceId(invoice) === selectedInvoiceId) ??
    orderedInvoicesForPicker[0] ??
    null;

  const transactionIdError = getTransactionIdError(transId) ?? "";
  const supportingFileError = getSupportingDocumentError(supportingFile) ?? "";
  const shouldShowTransactionIdError = hasTouchedTransId && !!transactionIdError;
  const shouldShowSupportingFileError = hasTouchedSupportingFile && !!supportingFileError;
  const canEditSelectedPayment = !!selectedInvoice && canEditPaymentForInvoice(selectedInvoice);
  const shouldAllowResubmission = canEditSelectedPayment;
  const canSubmit = !!selectedInvoice && !transactionIdError && !!transactionMode.trim() && !supportingFileError;
  const selectedStatusLabel = selectedInvoice ? invoiceStatusLabel(selectedInvoice) : "Pending";
  const selectedAmountText = selectedInvoice ? invoiceAmountText(selectedInvoice) : "—";

  useEffect(() => {
    if (!selectedInvoice) return;
    const currentInvoiceId = invoiceId(selectedInvoice);
    const serverSupportingName = invoiceSupportingDocumentName(selectedInvoice);
    const shouldEdit = canEditPaymentForInvoice(selectedInvoice);
    setTransId(invoiceTransactionId(selectedInvoice));
    setTransactionMode((asText(selectedInvoice.transaction_mode ?? selectedInvoice.payment_mode) || "Offline"));
    // In rejected/editable mode force selecting a fresh file for re-upload.
    setSupportingFileName(shouldEdit ? "" : serverSupportingName || localSupportingFileNameByInvoice[currentInvoiceId] || "");
    setSupportingFile(null);
    setHasTouchedTransId(false);
    setHasTouchedSupportingFile(false);
  }, [selectedInvoiceId, selectedInvoice, localSupportingFileNameByInvoice]);

  const handleFileChange = (file: File | null) => {
    setHasTouchedSupportingFile(true);
    setSupportingFile(file);
    setSupportingFileName(file?.name ?? "");
  };

  const selectedInvoiceType = selectedInvoice ? invoiceType(selectedInvoice) : "";

  useEffect(() => {
    let cancelled = false;
    if (!useFacilitatorApi || !selectedInvoice || !selectedInvoiceId) return () => {
      cancelled = true;
    };
    const fetchKey = `${projectId}:${selectedInvoiceId}:${selectedInvoiceType}`;
    if (lastApprovalFetchKeyRef.current === fetchKey) {
      return () => {
        cancelled = true;
      };
    }
    lastApprovalFetchKeyRef.current = fetchKey;
    getFacilitatorFinanceInvoiceApprovalStatus(projectId, selectedInvoiceId, selectedInvoiceType)
      .then((approval) => {
        if (cancelled || !approval || typeof approval !== "object") return;
        const merged = approval as Record<string, unknown>;
        setInvoices((prev) =>
          prev.map((invoice) => {
            if (invoiceId(invoice) !== selectedInvoiceId) return invoice;
            return {
              ...invoice,
              approval_status: merged.approval_status ?? invoice.approval_status,
              approval_status_label: (merged.approval_status_label as string | undefined) ?? invoice.approval_status_label,
              remarks: (merged.remarks as string | undefined) ?? invoice.remarks,
            };
          }),
        );
      })
      .catch(() => {
        // Non-blocking fallback: invoice list payload still drives status.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedInvoice, selectedInvoiceId, selectedInvoiceType, useFacilitatorApi]);

  const handleSubmitPayment = async () => {
    setHasTouchedTransId(true);
    setHasTouchedSupportingFile(true);
    if (transactionIdError) {
      setError(transactionIdError);
      return;
    }
    if (supportingFileError) {
      setError(supportingFileError);
      return;
    }
    if (!canSubmit || !selectedInvoice || !supportingFile) return;
    const id = invoiceId(selectedInvoice);
    setSubmittingId(id);
    try {
      if (useFacilitatorApi) {
        const uploadedName = supportingFile.name;
        await submitFacilitatorFinanceInvoiceSupporting(projectId, id, selectedInvoiceType, {
          transactionMode: transactionMode.trim(),
          transactionId: transId.trim(),
          supportingDocument: supportingFile,
        });
        const payload = await getFacilitatorFinanceInvoices(projectId);
        const nested = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
        const listRaw = Array.isArray(payload.invoices)
          ? payload.invoices
          : Array.isArray(nested.invoices)
            ? nested.invoices
            : [];
        const list = listRaw.filter((it): it is ExpenseInvoiceView => !!it && typeof it === "object");
        setInvoices(dedupeInvoicesById(list));
        setSupportingFile(null);
        setLocalSupportingFileNameByInvoice((prev) => ({ ...prev, [id]: uploadedName }));
        setSupportingFileName(uploadedName);
        setHasTouchedSupportingFile(false);
      }
    } catch (e: unknown) {
      setError(e instanceof AuthApiError ? e.message : "Could not upload supporting document.");
    } finally {
      setSubmittingId(null);
    }
  };

  return {
    loading,
    error,
    invoices,
    activeTab,
    setActiveTab,
    selectedInvoice,
    selectedInvoiceIds,
    setSelectedInvoiceIds,
    orderedInvoicesForPicker,
    canEditSelectedPayment,
    shouldAllowResubmission,
    transId,
    setTransId,
    transactionMode,
    setTransactionMode,
    selectedStatusLabel,
    selectedAmountText,
    hasTouchedTransId,
    setHasTouchedTransId,
    supportingFileError,
    shouldShowSupportingFileError,
    supportingFileName,
    handleFileChange,
    shouldShowTransactionIdError,
    transactionIdError,
    handleSubmitPayment,
    canSubmit,
    submittingId,
  };
}
