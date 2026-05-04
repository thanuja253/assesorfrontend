"use client";

import {
  asText,
  invoiceDocName,
  invoiceDocUrl,
  invoiceId,
  invoiceSupportingDocumentName,
  invoiceTitle,
  type ExpenseInvoiceView,
} from "./finance-types";

export default function InvoiceDetailCard({
  invoices,
  selectedInvoice,
  selectedInvoiceId,
  onInvoiceChange,
  canEditPayment,
  statusLabel,
  approvalRemarks,
  amountText,
  transId,
  transactionMode,
  onTransactionModeChange,
  onTransIdChange,
  onTransIdBlur,
  supportingFileName,
  onFilePick,
  shouldShowTransactionIdError,
  shouldShowSupportingFileError,
  transactionIdError,
  supportingFileError,
  onSubmitPayment,
  canSubmit,
  submitting,
  facilitatorMode = false,
}: Readonly<{
  invoices: ExpenseInvoiceView[];
  selectedInvoice: ExpenseInvoiceView;
  selectedInvoiceId: string;
  onInvoiceChange: (id: string) => void;
  canEditPayment: boolean;
  statusLabel: string;
  approvalRemarks: string;
  amountText: string;
  transId: string;
  transactionMode: string;
  onTransactionModeChange: (value: string) => void;
  onTransIdChange: (value: string) => void;
  onTransIdBlur: () => void;
  supportingFileName: string;
  onFilePick: (file: File | null) => void;
  shouldShowTransactionIdError: boolean;
  shouldShowSupportingFileError: boolean;
  transactionIdError: string;
  supportingFileError: string;
  onSubmitPayment: () => void;
  canSubmit: boolean;
  submitting: boolean;
  facilitatorMode?: boolean;
}>) {
  const isRejected = statusLabel.trim().toLowerCase() === "rejected";
  const invoiceFileName = invoiceDocName(selectedInvoice) || "Uploaded invoice document";
  const invoiceFileUrl = invoiceDocUrl(selectedInvoice);
  const invoiceTypeText = asText(selectedInvoice.invoice_type ?? selectedInvoice.type ?? selectedInvoice.payment_for_label) || "Proforma Invoice";
  const taxAmountText = asText(selectedInvoice.tax_amount) || "—";
  const totalAmountText = asText(selectedInvoice.total_amount) || amountText || "—";
  const resolvedSupportingName = asText(supportingFileName) || invoiceSupportingDocumentName(selectedInvoice) || "—";
  const normalizedStatus = (statusLabel || "Pending").trim().toLowerCase();
  const statusChipClass =
    normalizedStatus.includes("pending")
      ? "bg-[#fff7cc] text-[#8a6d1d] border-[#f5de9b]"
      : normalizedStatus.includes("reject")
        ? "bg-[#ffe8e8] text-[#b42318] border-[#f5b2b2]"
        : normalizedStatus.includes("accept") || normalizedStatus.includes("approve")
          ? "bg-[#e9f9ef] text-[#1f7a40] border-[#b9e7c7]"
          : "bg-[#f1f5f9] text-[#334155] border-[#dbe3ef]";

  if (facilitatorMode) {
    return (
      <div className="rounded-lg border border-[#e5eaf3] bg-white">
        <div className="flex items-center justify-end border-b border-[#eef2f8] px-4 py-3">
          <p className="text-[22px] leading-none text-[#6b7280]">⌄</p>
        </div>

        <div className="space-y-3 px-4 py-4 text-[13px]">
          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[#111827]">Uploaded Fee Invoice</span><span>:</span>
            <div className="flex items-center gap-2">
              <span className="truncate text-[#374151]">{invoiceFileName}</span>
              {invoiceFileUrl ? (
                <>
                  <a href={invoiceFileUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#cfd8e6] text-[12px] text-[#4b5563]" title="View">👁</a>
                  <a href={invoiceFileUrl} download={invoiceFileName} className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#cfd8e6] text-[12px] text-[#4b5563]" title="Download">⬇</a>
                </>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[#111827]">Invoice Type</span><span>:</span><span className="text-[#374151]">{invoiceTypeText}</span>
          </div>
          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[#111827]">Payable Amount</span><span>:</span><span className="text-[#374151]">₹ {amountText || "—"}</span>
          </div>
          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[#111827]">Tax Amount</span><span>:</span><span className="text-[#374151]">₹ {taxAmountText}</span>
          </div>
          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[#111827]">Total Amount</span><span>:</span><span className="text-[#374151]">₹ {totalAmountText}</span>
          </div>

          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <label htmlFor="facilitator-payment-mode" className="text-[#111827]">Payment Mode <span className="text-[#ef4444]">*</span></label>
            <span>:</span>
            <p id="facilitator-payment-mode" className="text-sm font-medium text-[#374151]">Offline</p>
          </div>

          <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
            <p className="text-[#111827]">Status</p>
            <span>:</span>
            <span className={`inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusChipClass}`}>
              {statusLabel || "Pending"}
            </span>
          </div>

          {canEditPayment ? (
            <>
              <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
                <label htmlFor="facilitator-transaction-id" className="text-[#111827]">Transaction ID</label>
                <span>:</span>
                <div>
                  <input
                    id="facilitator-transaction-id"
                    value={transId}
                    onChange={(e) => onTransIdChange(e.target.value)}
                    onBlur={onTransIdBlur}
                    className="h-8 w-[360px] max-w-full rounded border border-[#d7deea] px-2 text-sm text-[#374151]"
                    placeholder="Enter transaction id"
                  />
                  {shouldShowTransactionIdError ? <p className="mt-1 text-xs text-[#a94442]">{transactionIdError || "Transaction ID is required."}</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
                <label htmlFor="finance-supporting-file" className="text-[#111827]">Supporting File</label>
                <span>:</span>
                <div>
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="finance-supporting-file"
                      className="inline-flex h-8 cursor-pointer items-center rounded border border-[#cfd8e6] bg-white px-3 text-xs font-medium text-[#334155] hover:bg-[#f8fafc]"
                    >
                      Choose File
                    </label>
                    <input
                      id="finance-supporting-file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onClick={(e) => { e.currentTarget.value = ""; }}
                      onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <p className="truncate text-xs text-[#64748b]">
                      {asText(supportingFileName) || "No file chosen"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Choose a file to upload</p>
                  {shouldShowSupportingFileError ? <p className="mt-1 text-xs text-[#a94442]">{supportingFileError}</p> : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
                <p className="text-[#111827]">Transaction ID</p>
                <span>:</span>
                <p className="text-sm text-[#374151]">{transId || "—"}</p>
              </div>
              <div className="grid grid-cols-[220px_16px_minmax(0,1fr)] items-center gap-2">
                <p className="text-[#111827]">Supporting File</p>
                <span>:</span>
                <p className="text-sm text-[#374151]">{resolvedSupportingName}</p>
              </div>
            </>
          )}

          {canEditPayment ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={onSubmitPayment}
                disabled={submitting || !canSubmit}
                className="inline-flex h-9 items-center rounded bg-[#1f8f4e] px-5 text-sm font-semibold text-white hover:bg-[#187740] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting..." : isRejected ? "Re-upload" : "Submit"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3">
        <label htmlFor="invoice-picker" className="mb-1 block text-xs text-slate-500">Invoice</label>
        <select
          id="invoice-picker"
          value={selectedInvoiceId}
          onChange={(e) => onInvoiceChange(e.target.value)}
          className="h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-700"
        >
          {invoices.map((invoice) => (
            <option key={invoiceId(invoice)} value={invoiceId(invoice)}>
              {invoiceTitle(invoice)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 text-sm">
        <p><span className="text-slate-500">Title:</span> <span className="text-slate-800">{invoiceTitle(selectedInvoice)}</span></p>
        <p><span className="text-slate-500">Amount:</span> <span className="text-slate-800">{amountText || "—"}</span></p>
        {isRejected && approvalRemarks ? (
          <p><span className="text-slate-500">Rejected Remarks:</span> <span className="text-slate-800">{approvalRemarks}</span></p>
        ) : null}
      </div>

      {canEditPayment ? (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
          {isRejected ? (
            <p className="rounded border border-[#f4c7c3] bg-[#fff3f2] px-3 py-2 text-xs font-medium text-[#a94442]">
              This payment proof was rejected. Please re-upload supporting document and submit again.
            </p>
          ) : null}
          <div>
            <p className="mb-1 block text-xs text-slate-500">Status</p>
            <input
              value={statusLabel || "Pending"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <p className="mb-1 block text-xs text-slate-500">Transaction Mode</p>
            <input
              type="text"
              value={transactionMode}
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-700"
              readOnly
              disabled
            />
          </div>
          <div>
            <label htmlFor="finance-transaction-id" className="mb-1 block text-xs text-slate-500">Transaction ID</label>
            <input
              id="finance-transaction-id"
              value={transId}
              onChange={(e) => onTransIdChange(e.target.value)}
              onBlur={onTransIdBlur}
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-700"
              placeholder="Enter transaction id"
            />
            {shouldShowTransactionIdError ? (
              <p className="mt-1 text-xs text-[#a94442]">{transactionIdError || "Transaction ID is required."}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="finance-supporting-file" className="mb-1 block text-xs text-slate-500">Supporting File</label>
            <input
              id="finance-supporting-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onClick={(e) => {
                // Allow re-selecting the same file to trigger onChange.
                e.currentTarget.value = "";
              }}
              onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
              className="block text-xs"
            />
            <p className="mt-1 text-xs text-slate-500">{asText(supportingFileName) || "Choose a file to upload"}</p>
            {shouldShowSupportingFileError ? <p className="mt-1 text-xs text-[#a94442]">{supportingFileError}</p> : null}
          </div>
          <button
            type="button"
            onClick={onSubmitPayment}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded bg-[#1f4f8a] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting..." : isRejected ? "Re-upload" : "Submit"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
          <div>
            <p className="mb-1 block text-xs text-slate-500">Transaction Mode</p>
            <input
              type="text"
              value={transactionMode}
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
              readOnly
              disabled
            />
          </div>
          <div>
            <p className="mb-1 block text-xs text-slate-500">Transaction ID</p>
            <input
              value={transId || "—"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <p className="mb-1 block text-xs text-slate-500">Supporting File</p>
            <input
              value={asText(supportingFileName) || "—"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <p className="mb-1 block text-xs text-slate-500">Status</p>
            <input
              value={statusLabel || "Pending"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}
