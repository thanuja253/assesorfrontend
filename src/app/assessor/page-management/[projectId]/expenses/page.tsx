"use client";

import { SectionCard } from "../_ui";

export default function AssessorProjectExpensesPage() {

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="rounded bg-[#2f6ea7] px-4 py-2 text-sm font-medium text-white hover:bg-[#285f90]"
        >
          + Add Expenses
        </button>
      </div>

      <SectionCard title="Expenses">
        <form className="grid max-w-[700px] gap-4 text-sm">
          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">Expense Title*</span>
            <span className="text-[#9099a8]">:</span>
            <input
              className="h-10 rounded border border-[#d7dfe9] px-3 text-[#2d3746] outline-none focus:border-[#74a8de]"
              placeholder="Expense Title"
            />
          </label>

          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">Upload Expense Document*</span>
            <span className="text-[#9099a8]">:</span>
            <input className="h-10 rounded border border-[#d7dfe9] px-3 pt-2 text-[#2d3746]" type="file" />
          </label>

          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">Expense Amount*</span>
            <span className="text-[#9099a8]">:</span>
            <input
              className="h-10 rounded border border-[#d7dfe9] px-3 text-[#2d3746] outline-none focus:border-[#74a8de]"
              placeholder="Expense Amount"
            />
          </label>

          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">SGST(%)</span>
            <span className="text-[#9099a8]">:</span>
            <input defaultValue="0" className="h-10 rounded border border-[#d7dfe9] px-3 text-[#2d3746]" />
          </label>

          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">CGST(%)</span>
            <span className="text-[#9099a8]">:</span>
            <input defaultValue="0" className="h-10 rounded border border-[#d7dfe9] px-3 text-[#2d3746]" />
          </label>

          <label className="grid grid-cols-[200px_14px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">IGST(%)</span>
            <span className="text-[#9099a8]">:</span>
            <input defaultValue="0" className="h-10 rounded border border-[#d7dfe9] px-3 text-[#2d3746]" />
          </label>

          <button
            type="button"
            className="mt-1 w-fit rounded bg-[#2f6ea7] px-5 py-2 text-sm font-medium text-white hover:bg-[#285f90]"
          >
            Submit
          </button>
        </form>
      </SectionCard>
    </div>
  );
}

