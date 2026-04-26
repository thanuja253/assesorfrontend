"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { getCompanyProjectChecklistDocuments } from "@/lib/assessor-project-api";
import { textValue } from "../_ui";

type DocRow = {
  id?: string;
  title?: string;
  name?: string;
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

export default function AssessorProjectChecklistDocumentsPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [criteriaId, setCriteriaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});

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

  const rows = useMemo(() => toList(data), [data]);
  const headerRow = rows[0] ?? {};
  const criteriaLabel = textValue(criteriaId || headerRow.criteria_short_name || "TH");

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  return (
    <div className="space-y-3">
      <div className="rounded border border-[#e5eaf3] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f7] px-3 py-2">
          <div className="flex gap-10 text-xs font-semibold text-[#2d3746]">
          <p>GROUP : {textValue(data.group ?? data.group_name ?? headerRow.group_name ?? "THANUJA")}</p>
          <p>SECTOR : {textValue(data.sector ?? data.sector_name ?? headerRow.sector_name ?? "THANUJA 1")}</p>
          </div>
          <button type="button" className="rounded bg-[#2f6ea7] px-3 py-1 text-xs font-medium text-white">
            Download Sample Checklist Document
          </button>
        </div>
        <div className="border-b border-[#edf1f7] px-3 py-1.5">
          <div className="flex h-6 w-full items-center rounded border border-[#dde3ed] bg-[#fafbfd] px-2 text-xs text-[#738197]">
            <span className="mr-1 text-[#a5afbf]">⊂</span>
            <input
              value={criteriaId}
              onChange={(e) => setCriteriaId(e.target.value)}
              className="w-[80px] bg-transparent text-xs text-[#2b3340] outline-none"
              placeholder={criteriaLabel}
            />
          </div>
        </div>
        <div className="px-3 py-2">
        {rows.length === 0 ? (
          <p className="text-xs text-[#667083]">No documents found.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const fileUrl = row.document_url ?? row.file_url ?? row.url ?? row.file ?? "";
              return (
                <div key={`${row.id ?? idx}`} className="text-xs">
                  <p className="mb-1 text-[#2f3a46]">
                    {idx + 1}. {textValue(row.criteria_name ?? row.title ?? row.name)}
                  </p>
                  <p className="mb-1 text-[#5f6b7d]">Uploaded File</p>
                  <div className="flex items-center justify-between gap-2">
                    <span />
                    <div className="flex gap-2">
                      {fileUrl ? (
                        <>
                          <a
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#cfd8e6] text-sm text-[#5b6780]"
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
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

