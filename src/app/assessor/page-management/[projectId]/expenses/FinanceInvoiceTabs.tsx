"use client";

import FinanceTabs from "./FinanceTabs";
import InvoiceDetailCard from "./InvoiceDetailCard";
import { useFinanceInvoices } from "./useFinanceInvoices";

export default function FinanceInvoiceTabs({
  projectId,
  useFacilitatorApi,
}: Readonly<{
  projectId: string;
  useFacilitatorApi: boolean;
}>) {
  const vm = useFinanceInvoices(projectId, useFacilitatorApi);

  if (vm.loading && vm.invoices.length === 0) {
    return <p className="text-slate-600">Loading...</p>;
  }

  return (
    <div className="space-y-3">
      {vm.error ? (
        <p className="rounded border border-[#f3c9cf] bg-[#fff2f3] px-3 py-2 text-sm text-[#b14456]">{vm.error}</p>
      ) : null}
      <div className={useFacilitatorApi ? "space-y-3" : "grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"}>
        <FinanceTabs activeTab={vm.activeTab} onChange={vm.setActiveTab} facilitatorMode={useFacilitatorApi} />
        <div className="min-w-0">
          {vm.selectedInvoice ? (
            <InvoiceDetailCard
              invoices={vm.orderedInvoicesForPicker}
              selectedInvoice={vm.selectedInvoice}
              selectedInvoiceId={vm.selectedInvoice.id ?? vm.selectedInvoice._id ?? ""}
              onInvoiceChange={(id) =>
                vm.setSelectedInvoiceIds((prev) => ({ ...prev, [vm.activeTab]: id || null }))
              }
              canEditPayment={vm.canEditSelectedPayment}
              statusLabel={vm.selectedStatusLabel}
              approvalRemarks={(vm.selectedInvoice.remarks ?? "").trim()}
              amountText={vm.selectedAmountText}
              transId={vm.transId}
              transactionMode={vm.transactionMode}
              onTransactionModeChange={vm.setTransactionMode}
              onTransIdChange={(v) => {
                vm.setTransId(v);
                if (!vm.hasTouchedTransId) vm.setHasTouchedTransId(true);
              }}
              onTransIdBlur={() => vm.setHasTouchedTransId(true)}
              supportingFileName={vm.supportingFileName}
              onFilePick={vm.handleFileChange}
              shouldShowTransactionIdError={vm.shouldShowTransactionIdError}
              shouldShowSupportingFileError={vm.shouldShowSupportingFileError}
              transactionIdError={vm.transactionIdError}
              supportingFileError={vm.supportingFileError}
              onSubmitPayment={() => {
                vm.handleSubmitPayment().catch(() => undefined);
              }}
              canSubmit={vm.canSubmit}
              submitting={vm.submittingId === (vm.selectedInvoice.id ?? vm.selectedInvoice._id ?? "")}
              facilitatorMode={useFacilitatorApi}
            />
          ) : (
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">No invoices available yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
