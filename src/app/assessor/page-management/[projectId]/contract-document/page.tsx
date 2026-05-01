"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getCompanyProjectWorkOrderDocument,
  reuploadCompanyProjectWorkOrderDocument,
  uploadCompanyProjectWorkOrderDocument,
} from "@/lib/assessor-project-api";
import { textValue } from "../_ui";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function statusMeta(rawStatus: unknown): { label: string; className: string } {
  const value =
    typeof rawStatus === "number" || typeof rawStatus === "string"
      ? String(rawStatus).trim().toLowerCase()
      : "";
  if (value === "1" || value === "approved" || value === "accepted") {
    return { label: "Accepted", className: "bg-[#e9f8ee] text-[#1e7a3f] border-[#cfeeda]" };
  }
  if (value === "2" || value === "rejected") {
    return { label: "Rejected", className: "bg-[#fff1f1] text-[#b42318] border-[#ffd5d2]" };
  }
  if (value === "0" || value === "pending" || value === "submitted") {
    return { label: "Pending", className: "bg-[#fff8e8] text-[#9a6a0a] border-[#fde7b0]" };
  }
  return { label: "—", className: "bg-[#f4f7fb] text-[#6e7b90] border-[#dde4ee]" };
}

function displayFileName(fileName: string, fileUrl: string): string {
  if (fileName.trim()) return fileName.trim();
  if (!fileUrl.trim()) return "";
  try {
    const pathname = new URL(fileUrl).pathname;
    const decoded = decodeURIComponent(pathname);
    const last = decoded.split("/").pop() ?? "";
    return last.trim();
  } catch {
    const sanitized = fileUrl.split("?")[0];
    const last = sanitized.split("/").pop() ?? "";
    return decodeURIComponent(last).trim();
  }
}

function shouldHideSubmitMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("uploaded by consultant") &&
    (normalized.includes("waiting for admin approval") || normalized.includes("approval or rejection"))
  );
}

export default function AssessorProjectContractDocumentPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docPayload, setDocPayload] = useState<Record<string, unknown>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!projectId || projectId === "undefined") {
        setError("Invalid project id.");
        setDocPayload({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      const results = await Promise.allSettled([getCompanyProjectWorkOrderDocument(projectId)]);
      if (cancelled) return;
      const docResult = results[0];

      if (docResult.status === "fulfilled") {
        setDocPayload(docResult.value);
      } else {
        const reason = docResult.reason;
        setError(reason instanceof AuthApiError ? reason.message : "Could not load contract document.");
        setDocPayload({});
      }
      setLoading(false);
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const doc = useMemo(() => {
    const root = toRecord(docPayload);
    return {
      fileName: pickString(root, ["workorderdocument", "wo_doc", "document_name", "file_name", "filename"]),
      fileUrl: pickString(root, ["workorderdocument_url", "wo_doc_url", "document_url", "file_url", "url"]),
      status: root.wo_status ?? root.status ?? root.contract_status,
      remarks: pickString(root, ["wo_remarks", "remarks"]),
      canReupload: Boolean(root.can_reupload_work_order),
    };
  }, [docPayload]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const status = statusMeta(doc.status);
  const hasFile = Boolean(doc.fileName || doc.fileUrl);
  const shownFileName = displayFileName(doc.fileName, doc.fileUrl);
  const statusValue = typeof doc.status === "string" || typeof doc.status === "number" ? String(doc.status).toLowerCase() : "";
  const isRejected = statusValue === "2" || statusValue === "rejected";
  let uploadButtonLabel = "Upload Document";
  if (submitting) {
    uploadButtonLabel = "Uploading...";
  } else if (hasFile || isRejected) {
    uploadButtonLabel = "Re-upload Document";
  }

  const onUpload = async () => {
    if (!selectedFile) {
      setSubmitMessage("Please choose a PDF file first.");
      return;
    }
    if (selectedFile.type && selectedFile.type !== "application/pdf") {
      setSubmitMessage("Only PDF files are allowed.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage("");
    try {
      if (hasFile || isRejected) {
        await reuploadCompanyProjectWorkOrderDocument(projectId, selectedFile);
      } else {
        await uploadCompanyProjectWorkOrderDocument(projectId, selectedFile);
      }
      const [docLatest] = await Promise.allSettled([getCompanyProjectWorkOrderDocument(projectId)]);
      if (docLatest.status === "fulfilled") setDocPayload(docLatest.value);
      setSelectedFile(null);
      setSubmitMessage("Document uploaded successfully.");
    } catch (e: unknown) {
      setSubmitMessage(e instanceof AuthApiError ? e.message : "Could not upload document.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded border border-[#dfe6f1] bg-white">
        <div className="border-b border-[#edf1f7] px-5 py-3">
          <p className="text-sm font-semibold text-[#2f3a46]">Contract Document</p>
          <p className="mt-0.5 text-xs text-[#7a8598]">Upload and review work order / contract document.</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {hasFile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-[320px_12px_1fr_auto] items-center gap-x-2 text-[15px]">
                <p className="text-[#2f3a46]">Uploaded Work Order/ Contract Document</p>
                <p className="text-[#7c8798]">:</p>
                <p className="truncate text-[#2f3a46]">{textValue(shownFileName)}</p>
                <div className="ml-3 flex gap-2">
                  <a
                    href={doc.fileUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#cfd8e6] bg-white text-xs text-[#55637b] hover:bg-[#f5f8fd]"
                    title="View document"
                  >
                    👁
                  </a>
                  <a
                    href={doc.fileUrl || "#"}
                    download={doc.fileName || "work-order-document.pdf"}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#cfd8e6] bg-white text-xs text-[#55637b] hover:bg-[#f5f8fd]"
                    title="Download document"
                  >
                    ⬇
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-[320px_12px_1fr] items-center gap-x-2 text-[15px]">
                <p className="text-[#2f3a46]">Approval Status</p>
                <p className="text-[#7c8798]">:</p>
                <div>
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[12px] font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </div>

              {(isRejected || doc.canReupload) && (
                <div className="rounded border border-[#f4d8d7] bg-[#fff8f8] p-3">
                  <p className="text-xs font-medium text-[#9f2d2a]">Document is rejected. Please re-upload corrected file.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      id="work-order-document-file"
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="block h-10 w-full max-w-[360px] rounded border border-[#d7dfeb] bg-white px-3 text-sm text-[#2f3a46] file:mr-3 file:rounded file:border-0 file:bg-[#edf3ff] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#234a93]"
                    />
                    <button
                      type="button"
                      onClick={() => void onUpload()}
                      disabled={submitting}
                      className="inline-flex h-10 items-center rounded bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1f54c7] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadButtonLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="work-order-document-file" className="text-xs font-medium text-[#5f6b7a]">
                  Upload Work Order / Contract Document <span className="text-[#d8232a]">*</span>
                </label>
                <input
                  id="work-order-document-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="block h-10 w-full rounded border border-[#d7dfeb] bg-white px-3 text-sm text-[#2f3a46] file:mr-3 file:rounded file:border-0 file:bg-[#edf3ff] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#234a93]"
                />
                <p className="text-[11px] text-[#7a8598]">PDF only</p>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void onUpload()}
                  disabled={submitting}
                  className="inline-flex h-10 items-center rounded bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1f54c7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadButtonLabel}
                </button>
              </div>
            </div>
          )}

          {submitMessage && !shouldHideSubmitMessage(submitMessage) ? (
            <p className={`text-xs ${submitMessage.includes("successfully") ? "text-[#1e7a3f]" : "text-[#b42318]"}`}>
              {submitMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
