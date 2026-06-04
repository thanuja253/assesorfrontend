export { detectFacilitatorProcessType } from "@/lib/hybrid-workflow";

export function pickFinanceV2Invoices(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload) return [];
  const nested = payload.data;
  const data =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : payload;
  const inv = data.invoices ?? payload.invoices;
  if (Array.isArray(inv)) return inv.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  return [];
}

export function textDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "—";
}

export function normalizeInvoiceType(inv: Record<string, unknown>): string {
  const raw = inv.invoice_type ?? inv.invoiceType;
  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw).trim().toLowerCase().replaceAll(/\s+/g, "_");
  }
  return "";
}

export function filterInvoicesByType(
  invoices: Record<string, unknown>[],
  mode: "proforma" | "tax",
): Record<string, unknown>[] {
  return invoices.filter((inv) => {
    const t = normalizeInvoiceType(inv);
    if (mode === "proforma") return t === "proforma";
    return t === "tax" || t === "tax_invoice" || t === "tax-invoice";
  });
}
