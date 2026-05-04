"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function isPdfFile(file: File): boolean {
  const fileName = file.name.trim().toLowerCase();
  if (!fileName.endsWith(".pdf")) return false;
  const mime = (file.type || "").trim().toLowerCase();
  return mime === "" || mime === "application/pdf";
}

export default function AssessorProjectContractDocumentPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docPayload, setDocPayload] = useState<Record<string, unknown>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    uploadButtonLabel = "Re-upload";
  }

  const onUpload = async () => {
    if (!selectedFile) {
      setFileError("The Workorder Document Is Required");
      return;
    }
    if (fileError) {
      setSubmitMessage(fileError);
      return;
    }
    if (!isPdfFile(selectedFile)) {
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

  const handleFileChange = (file: File | null): void => {
    setSubmitMessage("");
    if (!file) {
      setSelectedFile(null);
      setFileError("The Workorder Document Is Required");
      return;
    }

    if (!isPdfFile(file)) {
      setSelectedFile(null);
      setFileError("Only PDF files are allowed.");
      return;
    }

    setSelectedFile(file);
    setFileError("");
  };

  return (
    <div className="space-y-3">
      <div className="max-w-[860px] rounded border border-[#dfe6f1] bg-white">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold text-[#2f3a46]">Contract Document</p>
          <p className="mt-0.5 text-xs text-[#7a8598]">Upload and review contract document.</p>
        </div>

        <div className="space-y-3 px-4 py-3">
          {hasFile ? (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[230px_12px_minmax(0,1fr)_auto] md:items-center">
                <p className="text-sm font-medium text-[#2f3a46]">Uploaded Contract Document</p>
                <p className="text-[#7c8798]">:</p>
                <p className="truncate text-sm text-[#2f3a46]">{textValue(shownFileName)}</p>
                <div className="ml-2 flex gap-2">
                  <a
                    href={doc.fileUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd8e6] bg-white text-xs text-[#55637b] hover:bg-[#f5f8fd]"
                    title="View document"
                  >
                    👁
                  </a>
                  <a
                    href={doc.fileUrl || "#"}
                    download={doc.fileName || "work-order-document.pdf"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd8e6] bg-white text-xs text-[#55637b] hover:bg-[#f5f8fd]"
                    title="Download document"
                  >
                    ⬇
                  </a>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[230px_12px_minmax(0,1fr)] md:items-center">
                <p className="text-sm font-medium text-[#2f3a46]">Approval Status</p>
                <p className="text-[#7c8798]">:</p>
                <div>
                  <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </div>

              {(isRejected || doc.canReupload) && (
                <div className="rounded-md border border-[#e2e8f3] bg-white p-3.5">
                  <p className="text-sm font-medium text-[#2f3a46]">Document is rejected. Please re-upload corrected file.</p>
                  <div className="mt-3 grid max-w-[560px] gap-2 lg:grid-cols-[minmax(0,360px)_auto] lg:items-center">
                    <div className="min-w-0">
                      <input
                        id="work-order-document-file"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                        className={`block h-8 w-full rounded border bg-white px-2 text-[11px] text-[#2f3a46] file:mr-2 file:rounded file:border-0 file:bg-[#edf3ff] file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-[#234a93] ${
                          fileError ? "border-[#d63f3f]" : "border-[#d7dfeb]"
                        }`}
                      />
                      {fileError ? <p className="mt-1 text-xs text-[#b42318]">{fileError}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void onUpload()}
                      disabled={submitting}
                      className="inline-flex h-8 cursor-pointer items-center rounded-md bg-[#2f8f4e] px-1.5 text-[11px] font-semibold text-white hover:bg-[#267641] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadButtonLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-[700px] space-y-2">
              <div className="grid gap-2 md:grid-cols-[220px_12px_minmax(0,300px)] md:items-center">
                <label htmlFor="work-order-document-file" className="text-sm font-semibold text-[#2f3a46]">
                  Upload Contract Document <span className="text-[#d8232a]">*</span>
                </label>
                <p className="text-[#7c8798]">:</p>
                <div className="min-w-0">
                  <input
                    ref={fileInputRef}
                    id="work-order-document-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex h-8 w-full items-center justify-center rounded-md border bg-white px-2 text-center text-xs text-[#2f3a46] ${
                      fileError ? "border-[#d63f3f]" : "border-[#d5deeb]"
                    }`}
                  >
                    {selectedFile ? selectedFile.name : "Choose File"}
                  </button>
                </div>
              </div>
              {fileError ? <p className="text-center text-xs font-medium text-[#e15757]">{fileError}</p> : null}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => void onUpload()}
                  disabled={submitting}
                  className="inline-flex h-9 min-w-[56px] cursor-pointer items-center justify-center rounded bg-[#2f8f4e] px-2 text-xs font-semibold text-white hover:bg-[#267641] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {submitMessage && !shouldHideSubmitMessage(submitMessage) && submitMessage.includes("successfully") ? (
            <p className="text-xs text-[#1e7a3f]">{submitMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
