"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { createAdminExpenseInvoice, getAdminExpenseInvoices } from "@/lib/assessor-project-api";

const GST_DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const TITLE_REGEX = /^[A-Za-z0-9 _-]{3,50}$/;
const AMOUNT_DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function isValidGstNumber(value: string): boolean {
  if (value.trim() === "") return true;
  return GST_DECIMAL_REGEX.test(value.trim());
}

function wordsBelowThousand(value: number): string {
  if (value === 0) return "";
  const hundred = Math.floor(value / 100);
  const rem = value % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]);
  } else {
    const ten = Math.floor(rem / 10);
    const one = rem % 10;
    if (ten > 1) parts.push(TENS[ten]);
    if (one > 0) parts.push(ONES[one]);
  }
  return parts.join(" ").trim();
}

function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return "";
  const whole = Math.floor(Math.abs(value));
  const decimal = Math.round((Math.abs(value) - whole) * 100);
  if (whole === 0 && decimal === 0) return "Zero";
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${wordsBelowThousand(crore)} Crore`);
  if (lakh) parts.push(`${wordsBelowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsBelowThousand(thousand)} Thousand`);
  if (rest) parts.push(wordsBelowThousand(rest));
  let text = parts.join(" ").trim();
  if (decimal > 0) {
    text = `${text} Point ${decimal.toString().padStart(2, "0")}`;
  }
  return text;
}

type ExpenseInvoiceView = {
  invoice_title?: string;
  invoicetitle?: string;
  payable_amount?: number | string;
  invoiceamount?: number | string;
  invoice_amount?: number | string;
  sgst?: number | string;
  cgst?: number | string;
  igst?: number | string;
  payment_date?: string;
  invoice_document_filename?: string;
};

function toDateInputValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function validateExpenseForm(input: {
  title: string;
  amount: string;
  sgst: string;
  cgst: string;
  igst: string;
  paymentDate: string;
  file?: File;
}): Record<string, string> {
  const { title, amount, sgst, cgst, igst, paymentDate, file } = input;
  const errors: Record<string, string> = {};
  if (!title.trim()) errors.title = "Expense title is required.";
  if (!amount.trim()) errors.amount = "Expense amount is required.";
  if (!TITLE_REGEX.test(title.trim()) || /\s{2,}/.test(title.trim())) {
    errors.title = "Title must be 3-50 chars and use letters/numbers/space/_/-.";
  }
  if (amount.trim() && !AMOUNT_DECIMAL_REGEX.test(amount.trim())) errors.amount = "The Amount field is Required.";

  const amountNumber = Number(amount);
  if (amount.trim() && (!Number.isFinite(amountNumber) || amountNumber <= 0)) errors.amount = "Amount must be greater than 0.";
  if (!isValidGstNumber(sgst)) errors.sgst = "SGST must be numeric with up to 2 decimal places.";
  if (!isValidGstNumber(cgst)) errors.cgst = "CGST must be numeric with up to 2 decimal places.";
  if (!isValidGstNumber(igst)) errors.igst = "IGST must be numeric with up to 2 decimal places.";

  const sgstNumber = Number(sgst || 0);
  const cgstNumber = Number(cgst || 0);
  const igstNumber = Number(igst || 0);
  if (sgstNumber < 0) errors.sgst = "SGST cannot be negative.";
  if (cgstNumber < 0) errors.cgst = "CGST cannot be negative.";
  if (igstNumber < 0) errors.igst = "IGST cannot be negative.";
  if (sgstNumber > 14) errors.sgst = "SGST cannot exceed 14%.";
  if (cgstNumber > 14) errors.cgst = "CGST cannot exceed 14%.";
  if (igstNumber > 28) errors.igst = "IGST cannot exceed 28%.";
  if (igstNumber > 0 && (sgstNumber > 0 || cgstNumber > 0)) {
    errors.igst = "Use IGST alone, or SGST+CGST together.";
    if (sgstNumber > 0) errors.sgst = "Use SGST only when IGST is 0.";
    if (cgstNumber > 0) errors.cgst = "Use CGST only when IGST is 0.";
  }
  if (igstNumber === 0 && (sgstNumber > 0 || cgstNumber > 0) && !(sgstNumber > 0 && cgstNumber > 0)) {
    if (sgstNumber <= 0) errors.sgst = "Enter SGST when using CGST.";
    if (cgstNumber <= 0) errors.cgst = "Enter CGST when using SGST.";
  }
  if (igstNumber === 0 && sgstNumber === 0 && cgstNumber === 0) {
    errors.igst = "Enter IGST or SGST+CGST.";
  }
  if ((sgstNumber > 0 || cgstNumber > 0 || igstNumber > 0) && amountNumber <= 0) {
    errors.amount = "Invoice amount must be greater than 0 before tax is applied.";
  }

  if (!paymentDate.trim()) errors.paymentDate = "Payment date is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
    errors.paymentDate = "Payment date must be in YYYY-MM-DD format.";
  }
  const enteredDate = new Date(`${paymentDate.trim()}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (enteredDate.getTime() > today.getTime()) errors.paymentDate = "Payment date cannot be in the future.";

  if (!file) errors.file = "Document must be uploaded.";
  if (file) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf") || (!PDF_MIME_TYPES.has(file.type) && file.type !== "")) {
      errors.file = "Document must be a PDF.";
    }
    if (file.size > 10 * 1024 * 1024) errors.file = "Document size must be 10 MB or less.";
  }
  return errors;
}

function mapServerValidationToFieldErrors(message: string): Record<string, string> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const errors: Record<string, string> = {};

  if (lower.includes("title")) errors.title = text;
  if (lower.includes("amount")) errors.amount = text;
  if (lower.includes("sgst")) errors.sgst = text;
  if (lower.includes("cgst")) errors.cgst = text;
  if (lower.includes("igst")) errors.igst = text;
  if (lower.includes("payment") && lower.includes("date")) errors.paymentDate = text;
  if (
    lower.includes("document") ||
    lower.includes("file") ||
    lower.includes("invoice") ||
    lower.includes("pdf") ||
    lower.includes("upload")
  ) {
    errors.file = text;
  }

  return errors;
}

export default function AssessorProjectExpensesPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [existingFileName, setExistingFileName] = useState("");

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [sgst, setSgst] = useState("");
  const [cgst, setCgst] = useState("");
  const [igst, setIgst] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [submittedOnce, setSubmittedOnce] = useState(false);

  const amountNumber = Number(amount || 0);
  const sgstNumber = Number(sgst || 0);
  const cgstNumber = Number(cgst || 0);
  const igstNumber = Number(igst || 0);
  const sgstAmount = Number.isFinite(amountNumber) ? (amountNumber * sgstNumber) / 100 : 0;
  const cgstAmount = Number.isFinite(amountNumber) ? (amountNumber * cgstNumber) / 100 : 0;
  const igstAmount = Number.isFinite(amountNumber) ? (amountNumber * igstNumber) / 100 : 0;
  const taxAmount = sgstAmount + cgstAmount + igstAmount;
  const totalAmount = amountNumber + taxAmount;
  const taxAmountText = amount.trim() ? taxAmount.toFixed(2) : "";
  const totalAmountText = amount.trim() ? totalAmount.toFixed(2) : "";
  const amountWords = amount.trim() && Number.isFinite(amountNumber) ? `${numberToWords(amountNumber)} Rupees only` : "";
  const sgstWords = sgst.trim() && Number.isFinite(sgstNumber) ? `${numberToWords(sgstNumber)} percent` : "";
  const cgstWords = cgst.trim() && Number.isFinite(cgstNumber) ? `${numberToWords(cgstNumber)} percent` : "";
  const igstWords = igst.trim() && Number.isFinite(igstNumber) ? `${numberToWords(igstNumber)} percent` : "";

  useEffect(() => {
    if (!projectId || projectId === "undefined") {
      setMessage("Invalid project id.");
      return;
    }
    const loadExpenses = async () => {
      try {
        const payload = await getAdminExpenseInvoices(projectId);
        const nestedData =
          payload.data && typeof payload.data === "object"
            ? (payload.data as Record<string, unknown>)
            : null;
        let invoicesSource: unknown[] = [];
        if (Array.isArray(payload.invoices)) {
          invoicesSource = payload.invoices;
        } else if (Array.isArray(nestedData?.invoices)) {
          invoicesSource = nestedData.invoices;
        }
        const invoices = invoicesSource as ExpenseInvoiceView[];
        if (invoices.length > 0) {
          const latest = invoices[0];
          setTitle(String(latest.invoice_title ?? latest.invoicetitle ?? ""));
          setAmount(String(latest.payable_amount ?? latest.invoiceamount ?? latest.invoice_amount ?? ""));
          setSgst(String(latest.sgst ?? ""));
          setCgst(String(latest.cgst ?? ""));
          setIgst(String(latest.igst ?? ""));
          setPaymentDate(toDateInputValue(latest.payment_date));
          setExistingFileName(String(latest.invoice_document_filename ?? ""));
          setViewOnly(true);
          setFieldErrors({});
          setSubmittedOnce(false);
        } else {
          setViewOnly(false);
          setExistingFileName("");
        }
        setLoadError("");
      } catch (e: unknown) {
        setLoadError(e instanceof AuthApiError ? e.message : "Could not load expenses.");
      }
    };
    void loadExpenses();
  }, [projectId]);

  useEffect(() => {
    if (!submittedOnce) return;
    const validationErrors = validateExpenseForm({ title, amount, sgst, cgst, igst, paymentDate, file });
    setFieldErrors(validationErrors);
  }, [submittedOnce, title, amount, sgst, cgst, igst, paymentDate, file]);

  const onSubmit = async () => {
    setSubmittedOnce(true);
    const validationErrors = validateExpenseForm({ title, amount, sgst, cgst, igst, paymentDate, file });
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await createAdminExpenseInvoice(projectId, {
        invoicetitle: title.trim(),
        invoiceamount: amount.trim(),
        sgst: sgst.trim() || "0",
        cgst: cgst.trim() || "0",
        igst: igst.trim() || "0",
        payment_date: paymentDate.trim(),
        regFeeInvoice: file,
      });
      setTitle("");
      setAmount("");
      setSgst("");
      setCgst("");
      setIgst("");
      setPaymentDate("");
      setFile(undefined);
      setFieldErrors({});
      setSubmittedOnce(false);
      setMessage("Expense submitted successfully.");
      await getAdminExpenseInvoices(projectId);
      setLoadError("");
    } catch (e: unknown) {
      const errorMessage = e instanceof AuthApiError ? e.message : "Could not submit expense.";
      const inlineErrors = mapServerValidationToFieldErrors(errorMessage);
      if (Object.keys(inlineErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...inlineErrors }));
        setMessage("");
        setLoadError("");
      } else {
        setMessage(errorMessage);
        setLoadError(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1 rounded border border-[#dbe3ef] bg-white px-2 py-1 text-xs font-medium text-[#4e5a6b]">
        <span className="text-[#8f9bad]">⊟</span>
        <span>Expenses</span>
      </div>

      <div className="rounded border border-[#edf1f7] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(14,34,61,0.04)]">
        <p className="mb-2 text-[16px] font-semibold text-[#2f3a46]">Add New Expense</p>
        <form className="grid max-w-[760px] gap-2.5 text-[13px]">
          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              Expense Title<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setFieldErrors((prev) => ({ ...prev, title: "" }));
              }}
              readOnly={viewOnly}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746] outline-none focus:border-[#3f76a8]"
              placeholder="Expense Title"
            />
          </label>
          {fieldErrors.title ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.title}</p> : null}

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              Upload Expense Document<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <div className="flex h-[36px] overflow-hidden rounded border border-[#d7dfe9]">
              <input
                id="expense-file-input"
                className="hidden"
                type="file"
                disabled={viewOnly}
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setFieldErrors((prev) => ({ ...prev, file: "" }));
                }}
              />
              <div className="flex w-full items-center px-2 text-[12px] text-[#2d3746]">
                {file?.name || existingFileName || "No file chosen"}
              </div>
              <label
                htmlFor="expense-file-input"
                className={`h-full border-l border-[#d7dfe9] px-3 text-[12px] leading-[36px] text-white ${viewOnly ? "cursor-not-allowed bg-[#9fb7a8]" : "cursor-pointer bg-[#2f8f4e] hover:bg-[#267641]"}`}
              >
                Browse
              </label>
            </div>
          </label>
          {fieldErrors.file ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.file}</p> : null}

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              Expense Amount<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              value={amount}
              onChange={(e) => {
                const sanitized = e.target.value.replaceAll(/[^0-9.]/g, "");
                setAmount(sanitized);
                setFieldErrors((prev) => ({ ...prev, amount: "" }));
              }}
              readOnly={viewOnly}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746] outline-none focus:border-[#3f76a8]"
              placeholder="Expense Amount"
            />
          </label>
          {amountWords ? <p className="ml-[184px] -mt-1 text-xs text-[#5c6777]">{amountWords}</p> : null}
          {fieldErrors.amount ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.amount}</p> : null}

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              SGST(%)<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              value={sgst}
              onChange={(e) => {
                const sanitized = e.target.value.replaceAll(/[^0-9.]/g, "");
                setSgst(sanitized);
                setFieldErrors((prev) => ({ ...prev, sgst: "", cgst: "", igst: "" }));
              }}
              onKeyDown={(e) => {
                if (!/[0-9.]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault();
              }}
              disabled={viewOnly || Number(igst || 0) > 0}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746]"
            />
          </label>
          {sgstWords ? <p className="ml-[184px] -mt-1 text-xs text-[#5c6777]">{sgstWords}</p> : null}
          {fieldErrors.sgst ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.sgst}</p> : null}

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              CGST(%)<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              value={cgst}
              onChange={(e) => {
                const sanitized = e.target.value.replaceAll(/[^0-9.]/g, "");
                setCgst(sanitized);
                setFieldErrors((prev) => ({ ...prev, sgst: "", cgst: "", igst: "" }));
              }}
              onKeyDown={(e) => {
                if (!/[0-9.]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault();
              }}
              disabled={viewOnly || Number(igst || 0) > 0}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746]"
            />
          </label>
          {cgstWords ? <p className="ml-[184px] -mt-1 text-xs text-[#5c6777]">{cgstWords}</p> : null}
          {fieldErrors.cgst ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.cgst}</p> : null}

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              IGST(%)<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              value={igst}
              onChange={(e) => {
                const sanitized = e.target.value.replaceAll(/[^0-9.]/g, "");
                setIgst(sanitized);
                setFieldErrors((prev) => ({ ...prev, sgst: "", cgst: "", igst: "" }));
              }}
              onKeyDown={(e) => {
                if (!/[0-9.]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault();
              }}
              disabled={viewOnly || Number(sgst || 0) > 0 || Number(cgst || 0) > 0}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746]"
            />
          </label>
          {igstWords ? <p className="ml-[184px] -mt-1 text-xs text-[#5c6777]">{igstWords}</p> : null}
          {fieldErrors.igst ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.igst}</p> : null}

          <div className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">Tax Amount</span>
            <span className="text-[#9099a8]">:</span>
            <input value={taxAmountText} readOnly className="h-[36px] rounded border border-[#d7dfe9] bg-[#f8fafd] px-2 text-[13px] text-[#2d3746]" />
          </div>
          <div className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">Total Amount</span>
            <span className="text-[#9099a8]">:</span>
            <input value={totalAmountText} readOnly className="h-[36px] rounded border border-[#d7dfe9] bg-[#f8fafd] px-2 text-[13px] text-[#2d3746]" />
          </div>

          <label className="grid grid-cols-[170px_12px_1fr] items-center gap-x-2">
            <span className="text-[#5c6777]">
              Payment Date<span className="text-[#d8232a]">*</span>
            </span>
            <span className="text-[#9099a8]">:</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => {
                setPaymentDate(e.target.value);
                setFieldErrors((prev) => ({ ...prev, paymentDate: "" }));
              }}
              disabled={viewOnly}
              className="h-[36px] rounded border border-[#d7dfe9] px-2 text-[13px] text-[#2d3746]"
            />
          </label>
          {fieldErrors.paymentDate ? <p className="ml-[184px] -mt-1 text-xs text-[#a94442]">{fieldErrors.paymentDate}</p> : null}

          {viewOnly ? null : (
            <div className="ml-[184px] flex justify-center">
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={saving}
                className="mt-1 w-[120px] rounded bg-[#2f8f4e] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#267641] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Submitting..." : "Submit"}
              </button>
            </div>
          )}
        </form>
      </div>

      {message ? (
        <p className={`text-sm ${message.includes("successfully") ? "text-[#2f8f4e]" : "text-[#a94442]"}`}>
          {message}
        </p>
      ) : null}
      {loadError ? <p className="text-xs text-[#a94442]">{loadError}</p> : null}
    </div>
  );
}

