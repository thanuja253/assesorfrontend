"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getCompanyProjectWorkOrderDocument,
  getFacilitatorSignedContractDocument,
  getFacilitatorProjectQuickView,
  reuploadCompanyProjectWorkOrderDocument,
  reuploadFacilitatorSignedContractDocument,
  uploadCompanyProjectWorkOrderDocument,
  uploadFacilitatorSignedContractDocument,
} from "@/lib/assessor-project-api";
import {
  bindContractQuickview,
  parseOptionalBool,
  unwrapQuickviewPayload,
} from "@/lib/facilitator-contract-workflow";
import { textValue } from "../_ui";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

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
  if (value === "0" || value === "pending" || value === "submitted" || value.includes("pending_review")) {
    return { label: "Pending review", className: "bg-[#fff8e8] text-[#9a6a0a] border-[#fde7b0]" };
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

function isPdfFile(file: File): boolean {
  const fileName = file.name.trim().toLowerCase();
  if (!fileName.endsWith(".pdf")) return false;
  const mime = (file.type || "").trim().toLowerCase();
  return mime === "" || mime === "application/pdf";
}

function mergeQuickviewFromUploadResponse(data: Record<string, unknown>): Record<string, unknown> | null {
  const quickview = data.quickview ?? data.quickView;
  if (quickview && typeof quickview === "object" && !Array.isArray(quickview)) {
    return quickview as Record<string, unknown>;
  }
  const inner = data.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const rec = inner as Record<string, unknown>;
    const nested = rec.quickview ?? rec.quickView;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

export default function AssessorProjectContractDocumentPage() {
  const routeParams = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const useFacilitatorContractApi = Boolean(pathname?.includes("/facilitator/"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docPayload, setDocPayload] = useState<Record<string, unknown>>({});
  const [quickView, setQuickView] = useState<Record<string, unknown>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadContract = async (): Promise<Record<string, unknown>> => {
    if (useFacilitatorContractApi) {
      return getFacilitatorSignedContractDocument(projectId);
    }
    return getCompanyProjectWorkOrderDocument(projectId);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!projectId || projectId === "undefined") {
        setError("Invalid project id.");
        setDocPayload({});
        setQuickView({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const [docResult, qvResult] = await Promise.allSettled([
          loadContract(),
          useFacilitatorContractApi ? getFacilitatorProjectQuickView(projectId) : Promise.resolve({}),
        ]);
        if (cancelled) return;
        if (docResult.status === "fulfilled") {
          setDocPayload(docResult.value);
        } else {
          const reason = docResult.reason;
          const isMissingContractEndpoint =
            useFacilitatorContractApi &&
            reason instanceof AuthApiError &&
            (reason.status === 404 || reason.status === 501);
          if (isMissingContractEndpoint) {
            setDocPayload({});
            setError("");
          } else {
            setError(reason instanceof AuthApiError ? reason.message : "Could not load contract document.");
            setDocPayload({});
          }
        }
        if (qvResult.status === "fulfilled") {
          setQuickView(unwrapQuickviewPayload(qvResult.value));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, useFacilitatorContractApi]);

  const contractBinding = useMemo(() => bindContractQuickview(quickView), [quickView]);

  const doc = useMemo(() => {
    const envelope = toRecord(docPayload);
    const nested = toRecord(docPayload.data);
    const root = { ...envelope, ...nested };
    const statusRaw = root.wo_status ?? root.status ?? root.contract_status;
    const statusLabel = pickString(root, ["wo_status_label", "woStatusLabel"]);
    const fileName = pickString(root, [
      "document_filename",
      "document_name",
      "workorderdocument",
      "wo_doc",
      "file_name",
      "filename",
    ]);
    const fileUrl = pickString(root, [
      "document_url",
      "workorderdocument_url",
      "wo_doc_url",
      "file_url",
      "url",
    ]);
    const hasDocument = Boolean(
      parseOptionalBool(root.has_document ?? root.hasDocument) ??
        (fileName || fileUrl),
    );
    return {
      fileName,
      fileUrl,
      hasDocument,
      status: statusRaw,
      statusLabel,
      remarks: pickString(root, ["wo_remarks", "remarks"]),
      canUpload:
        parseOptionalBool(
          root.can_facilitator_upload_contract ?? root.canFacilitatorUploadContract,
        ),
      canReupload:
        parseOptionalBool(
          root.can_facilitator_reupload_contract ??
            root.canFacilitatorReuploadContract ??
            root.can_reupload_work_order,
        ),
      awaitingReview:
        statusLabel.toLowerCase().includes("pending_review") ||
        statusLabel.toLowerCase().includes("pending review") ||
        Boolean(root.awaiting_cii_review),
    };
  }, [docPayload]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const status = statusMeta(doc.statusLabel || doc.status);
  const hasFile = doc.hasDocument || Boolean(doc.fileName || doc.fileUrl);
  const shownFileName = displayFileName(doc.fileName, doc.fileUrl);
  const statusValue =
    typeof doc.status === "string" || typeof doc.status === "number"
      ? String(doc.status).toLowerCase()
      : "";
  const isRejected = statusValue === "2" || statusValue === "rejected" || doc.statusLabel.toLowerCase().includes("rejected");
  const uploadDisabled = useFacilitatorContractApi
    ? hasFile && doc.awaitingReview && !(doc.canReupload === true || contractBinding.showReupload || isRejected)
    : doc.awaitingReview && !(doc.canReupload === true || isRejected);

  const canUploadNow = useFacilitatorContractApi
    ? !hasFile && !uploadDisabled && doc.canUpload !== false
    : !hasFile && !isRejected;

  const canReuploadNow = useFacilitatorContractApi
    ? doc.canReupload === true || contractBinding.showReupload || isRejected
    : hasFile || isRejected;

  let uploadButtonLabel = "Upload Document";
  if (submitting) {
    uploadButtonLabel = "Uploading...";
  } else if (canReuploadNow && hasFile) {
    uploadButtonLabel = "Re-upload";
  }

  const onUpload = async () => {
    if (!selectedFile) {
      setFileError("The contract document is required.");
      return;
    }
    if (!isPdfFile(selectedFile)) {
      setSubmitMessage("Only PDF files are allowed.");
      return;
    }
    if (selectedFile.size > MAX_PDF_BYTES) {
      setSubmitMessage("File must be 10MB or smaller.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage("");
    try {
      let uploadResponse: Record<string, unknown>;
      if (useFacilitatorContractApi) {
        if (canReuploadNow && (hasFile || isRejected)) {
          uploadResponse = await reuploadFacilitatorSignedContractDocument(projectId, selectedFile);
        } else {
          uploadResponse = await uploadFacilitatorSignedContractDocument(projectId, selectedFile);
        }
      } else if (hasFile || isRejected) {
        uploadResponse = await reuploadCompanyProjectWorkOrderDocument(projectId, selectedFile);
      } else {
        uploadResponse = await uploadCompanyProjectWorkOrderDocument(projectId, selectedFile);
      }

      const embeddedQuickview = mergeQuickviewFromUploadResponse(uploadResponse);
      if (embeddedQuickview) {
        setQuickView(unwrapQuickviewPayload(embeddedQuickview));
      } else if (useFacilitatorContractApi) {
        const qv = await getFacilitatorProjectQuickView(projectId);
        setQuickView(unwrapQuickviewPayload(qv));
      }

      const docLatest = await loadContract();
      setDocPayload(docLatest);
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
      setFileError("The contract document is required.");
      return;
    }
    if (!isPdfFile(file)) {
      setSelectedFile(null);
      setFileError("Only PDF files are allowed.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setSelectedFile(null);
      setFileError("File must be 10MB or smaller.");
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
          <p className="mt-0.5 text-xs text-[#7a8598]">
            {useFacilitatorContractApi
              ? "Upload your signed contract (PDF, max 10MB). CII will review via facilitator-signed-contract."
              : "Upload and review contract document."}
          </p>
        </div>

        <div className="space-y-3 px-4 py-3">
          {contractBinding.instruction ? (
            <p className="rounded border border-[#d5e8dc] bg-[#f4faf6] px-3 py-2 text-xs text-[#2d6a3e]">
              {contractBinding.instruction}
            </p>
          ) : null}

          {uploadDisabled ? (
            <p className="text-xs text-[#6b7280]">
              Your contract is with CII for review. Upload is disabled until they accept, reject, or request a
              re-upload.
            </p>
          ) : null}

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
                    download={doc.fileName || "contract-document.pdf"}
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
              {doc.remarks ? (
                <p className="text-xs text-[#b42318]">
                  <span className="font-semibold">CII remarks:</span> {doc.remarks}
                </p>
              ) : null}

              {canReuploadNow && !uploadDisabled ? (
                <div className="rounded-md border border-[#e2e8f3] bg-white p-3.5">
                  <p className="text-sm font-medium text-[#2f3a46]">
                    {isRejected
                      ? "Contract was rejected. Please re-upload a corrected PDF."
                      : "You may re-upload an updated contract document."}
                  </p>
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
              ) : null}
            </div>
          ) : canUploadNow && !uploadDisabled ? (
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
          ) : uploadDisabled ? null : (
            <p className="text-xs text-[#6b7280]">
              {useFacilitatorContractApi
                ? "Upload is not available for this project step. Check Quick view for the current contract phase, or contact CII if you believe this is wrong."
                : "No contract document uploaded yet."}
            </p>
          )}

          {submitMessage && submitMessage.includes("successfully") ? (
            <p className="text-xs text-[#1e7a3f]">{submitMessage}</p>
          ) : null}
          {submitMessage && !submitMessage.includes("successfully") ? (
            <p className="text-xs text-[#b42318]">{submitMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
