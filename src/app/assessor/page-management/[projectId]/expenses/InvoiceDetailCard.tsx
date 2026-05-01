"use client";

import {
  asText,
  invoiceId,
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
}>) {
  const isRejected = statusLabel.trim().toLowerCase() === "rejected";
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3">
        <label className="mb-1 block text-xs text-slate-500">Invoice</label>
        <select
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
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <input
              value={statusLabel || "Pending"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Transaction Mode</label>
            <input
              type="text"
              value={transactionMode}
              className="h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-700"
              readOnly
              disabled
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Transaction ID</label>
            <input
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
            <label className="mb-1 block text-xs text-slate-500">Transaction Mode</label>
            <input
              type="text"
              value={transactionMode}
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
              readOnly
              disabled
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Transaction ID</label>
            <input
              value={transId || "—"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Supporting File</label>
            <input
              value={asText(supportingFileName) || "—"}
              readOnly
              disabled
              className="h-9 w-full rounded border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Status</label>
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
