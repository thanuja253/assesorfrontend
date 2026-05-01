"use client";

import type { FinanceTabKey } from "./finance-types";

export default function FinanceTabs({
  activeTab,
  onChange,
}: Readonly<{
  activeTab: FinanceTabKey;
  onChange: (tab: FinanceTabKey) => void;
}>) {
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
