"use client";

import { useEffect, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import { getCompanyProjectQuickView, getFacilitatorFinanceV2Proforma } from "@/lib/assessor-project-api";
import {
  detectFacilitatorProcessType,
  filterInvoicesByType,
  pickFinanceV2Invoices,
  textDisplay,
} from "./_finance-helpers";

function formatInr(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return textDisplay(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

type Props = {
  projectId: string;
  filterMode: "proforma" | "tax";
  heading: string;
};

export default function FinanceV2InvoiceList({ projectId, filterMode, heading }: Readonly<Props>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFacilitatorProcess, setNotFacilitatorProcess] = useState(false);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!projectId || projectId === "undefined") {
      setLoading(false);
      setNotFacilitatorProcess(false);
      setInvoices([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      setNotFacilitatorProcess(false);
      try {
        const qv = await getCompanyProjectQuickView(projectId);
        if (cancelled) return;
        if (!detectFacilitatorProcessType(qv)) {
          setNotFacilitatorProcess(true);
          setInvoices([]);
          return;
        }
        const payload = await getFacilitatorFinanceV2Proforma(projectId);
        if (cancelled) return;
        const all = pickFinanceV2Invoices(payload);
        setInvoices(filterInvoicesByType(all, filterMode));
        setError("");
      } catch (e: unknown) {
        if (cancelled) return;
        setInvoices([]);
        setError(e instanceof AuthApiError ? e.message : "Could not load finance data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, filterMode]);

  if (loading) {
    return <p className="text-sm text-[#667083]">Loading…</p>;
  }

  if (notFacilitatorProcess) {
    return (
      <p className="text-sm text-[#7f8a9a]">
        This section is available only for facilitator process projects (process type F).
      </p>
    );
  }

  return (
    <div className="rounded border border-[#edf1f7] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(14,34,61,0.04)]">
      <p className="mb-2 text-[16px] font-semibold text-[#2f3a46]">{heading}</p>
      {error ? (
        <p className="text-sm text-[#a94442]">{error}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-[#7f8a9a]">No invoices in this category.</p>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv, idx) => {
            const docUrl = typeof inv.invoice_document === "string" ? inv.invoice_document : "";
            const payDocUrl = typeof inv.offline_tran_doc === "string" ? inv.offline_tran_doc : "";
            return (
              <div
                key={
                  typeof inv.id === "string" || typeof inv.id === "number"
                    ? String(inv.id)
                    : `finance-v2-${idx}`
                }
                className={idx > 0 ? "border-t border-[#eef2f7] pt-4" : ""}
              >
                <p className="text-[13px] font-semibold text-[#2d3746]">
                  {textDisplay(inv.invoice_title ?? inv.payment_for_label)}
                </p>
                <p className="mb-2 text-xs text-[#7f8a9a]">{textDisplay(inv.payment_for_label)}</p>
                <div className="flex max-w-xl flex-col gap-1.5 text-[13px]">
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Invoice amount</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="font-medium text-[#2d3746]">{formatInr(inv.payable_amount)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Tax amount (SGST, CGST & IGST)</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="font-medium text-[#2d3746]">{formatInr(inv.tax_amount)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Total amount</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="font-medium text-[#2d3746]">{formatInr(inv.total_amount)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Outstanding</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="text-[#2d3746]">{textDisplay(inv.outstanding_status)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Payment type</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="text-[#2d3746]">{textDisplay(inv.payment_type)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Approval</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="text-[#2d3746]">{textDisplay(inv.approval_status_label)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Transaction ID</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="text-[#2d3746]">{textDisplay(inv.trans_id)}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_12px_1fr] gap-x-2">
                    <span className="text-[#5c6777]">Remarks</span>
                    <span className="text-[#9099a8]">:</span>
                    <span className="text-[#2d3746]">{textDisplay(inv.remarks)}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {docUrl ? (
                    <a
                      href={docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#3f76a8] underline"
                    >
                      Invoice document
                      {inv.invoice_document_filename
                        ? ` (${textDisplay(inv.invoice_document_filename)})`
                        : ""}
                    </a>
                  ) : null}
                  {payDocUrl ? (
                    <a
                      href={payDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#3f76a8] underline"
                    >
                      Payment proof
                      {inv.offline_tran_doc_filename ? ` (${textDisplay(inv.offline_tran_doc_filename)})` : ""}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
