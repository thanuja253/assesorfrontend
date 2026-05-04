"use client";

import type { FinanceTabKey } from "./finance-types";

export default function FinanceTabs({
  activeTab,
  onChange,
  facilitatorMode = false,
}: Readonly<{
  activeTab: FinanceTabKey;
  onChange: (tab: FinanceTabKey) => void;
  facilitatorMode?: boolean;
}>) {
  if (facilitatorMode) {
    const tabs: Array<{ key: FinanceTabKey; label: string }> = [
      { key: "proforma-tax", label: "Payments / Proforma" },
      { key: "tax-invoice", label: "Tax Invoices" },
      { key: "expenses", label: "Expenses" },
    ];
    return (
      <div className="border-b border-[#dbe3ef]">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`border-b-2 px-1 pb-2 pt-1 text-[13px] font-semibold ${
                activeTab === tab.key
                  ? "border-[#3b82f6] text-[#3b82f6]"
                  : "border-transparent text-[#4b5563] hover:text-[#2563eb]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => onChange("proforma-tax")}
        className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
          activeTab === "proforma-tax" ? "bg-[#ecf4ff] text-[#1f4f8a]" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Proforma / Tax
      </button>
      <button
        type="button"
        onClick={() => onChange("tax-invoice")}
        className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
          activeTab === "tax-invoice" ? "bg-[#ecf4ff] text-[#1f4f8a]" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Tax Invoice
      </button>
      <button
        type="button"
        onClick={() => onChange("expenses")}
        className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
          activeTab === "expenses" ? "bg-[#ecf4ff] text-[#1f4f8a]" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Expenses
      </button>
    </div>
  );
}
