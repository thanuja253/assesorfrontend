"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  downloadAssessmentChecklistSampleDocument,
  getCompanyProjectChecklistDocuments,
} from "@/lib/assessor-project-api";
import { resolveDocumentUrl } from "@/lib/s3-upload";
import { textValue } from "../_ui";

type DocRow = {
  id?: string;
  title?: string;
  name?: string;
  criteria_name?: string;
  criteria_short_name?: string;
  sector_id?: string;
  group_name?: string;
  sector_name?: string;
  document_url?: string;
  file?: string;
  file_url?: string;
  url?: string;
  status?: string | number;
};

function toList(payload: unknown): DocRow[] {
  if (Array.isArray(payload)) return payload as DocRow[];
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  const candidates = [rec.items, rec.rows, rec.data, rec.documents, rec.checklist_docs];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as DocRow[];
  }
  return [];
}

function dedupeRows(rows: DocRow[]): DocRow[] {
  const seen = new Set<string>();
  const unique: DocRow[] = [];
  rows.forEach((row) => {
    const key = String(
      row.id ??
        row.document_url ??
        row.file_url ??
        row.url ??
        `${row.criteria_name ?? row.title ?? row.name}-${row.file ?? ""}`,
    ).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  return unique;
}

function toSafeString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export default function AssessorProjectChecklistDocumentsPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [criteriaId, setCriteriaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [downloadMessage, setDownloadMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      console.log("projectId", projectId);
      setError("Invalid project id.");
      setData({});
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const payload = await getCompanyProjectChecklistDocuments(projectId, criteriaId || undefined);
        if (cancelled) return;
        setData(payload);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load checklist documents.");
        setData({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [criteriaId, projectId]);

  const rows = useMemo(() => dedupeRows(toList(data)), [data]);
  const headerRow = rows[0] ?? {};
  const criteriaLabel = textValue(criteriaId || headerRow.criteria_short_name || "TH");
  const sectorId =
    toSafeString(data.sector_id) ||
    toSafeString((data.sector as Record<string, unknown> | undefined)?.id) ||
    toSafeString(headerRow.sector_id);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const handleDownloadSampleChecklist = async () => {
    setDownloadMessage("");
    try {
      const { blob, filename } = await downloadAssessmentChecklistSampleDocument(projectId, sectorId || undefined);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `assessment-checklist-sample-${projectId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDownloadMessage("Sample checklist downloaded successfully.");
    } catch (e: unknown) {
      setDownloadMessage(e instanceof AuthApiError ? e.message : "Could not download sample checklist.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f7] bg-[#f8fafc] px-4 py-3">
          <div className="flex flex-wrap gap-8 text-xs font-semibold text-[#2d3746]">
            <p>GROUP : {textValue(data.group ?? data.group_name ?? headerRow.group_name ?? "THANUJA")}</p>
            <p>SECTOR : {textValue(data.sector ?? data.sector_name ?? headerRow.sector_name ?? "THANUJA 1")}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadSampleChecklist()}
            className="rounded bg-[#2f8f4e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#267641]"
          >
            Download Sample Checklist Document
          </button>
        </div>
        <div className="border-b border-[#edf1f7] px-4 py-2">
          <div className="flex h-8 w-full items-center rounded border border-[#dde3ed] bg-white px-2 text-xs text-[#738197]">
            <span className="mr-2 text-[#a5afbf]">⌕</span>
            <input
              value={criteriaId}
              onChange={(e) => setCriteriaId(e.target.value)}
              className="w-full bg-transparent text-xs text-[#2b3340] outline-none"
              placeholder={criteriaLabel}
            />
          </div>
        </div>
        <div className="px-4 py-3">
          {rows.length === 0 ? (
            <p className="rounded border border-dashed border-[#d7deea] px-3 py-6 text-center text-xs text-[#667083]">
              No documents found.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const fileUrl = resolveDocumentUrl(row as Record<string, unknown>);
                return (
                  <div
                    key={`${row.id ?? idx}`}
                    className="flex items-center justify-between rounded border border-[#e8edf5] bg-[#fcfdff] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#2f3a46]">
                        {idx + 1}. {textValue(row.criteria_name ?? row.title ?? row.name)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#7a8598]">Uploaded File</p>
                    </div>
                    <div className="ml-3 flex gap-2">
                      {fileUrl ? (
                        <>
                          <a
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#cfd8e6] bg-white text-sm text-[#5b6780] hover:bg-[#f6f9ff]"
                            href={String(fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            title="View"
                          >
                            👁
                          </a>
                          <button
                            className="inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded border border-[#cfd8e6] bg-[#f5f7fb] text-sm font-semibold text-[#8d99ab]"
                            type="button"
                            title="Download disabled"
                            disabled
                          >
                            ⬇
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-[#98a4b5]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {downloadMessage ? (
        <p className={`text-xs ${downloadMessage.includes("successfully") ? "text-[#2f8f4e]" : "text-[#a94442]"}`}>
          {downloadMessage}
        </p>
      ) : null}
    </div>
  );
}

