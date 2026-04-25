"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import { getAssessorChecklistDocuments } from "@/lib/assessor-project-api";

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

export default function AssessorProjectChecklistDocumentsPage({
  params,
}: Readonly<{ params: { projectId: string } }>) {
  const { projectId } = params;
  const [criteriaId, setCriteriaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void getAssessorChecklistDocuments(projectId, criteriaId || undefined)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load checklist documents.");
        setData({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [criteriaId, projectId]);

  const rows = useMemo(() => toList(data), [data]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#2f3a46]">View Assessment Submittals</p>
          <p className="text-xs text-[#667083]">Optional: filter by criteria id.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#606a78]">Criteria Id</label>
          <input
            value={criteriaId}
            onChange={(e) => setCriteriaId(e.target.value)}
            className="h-8 w-[220px] rounded border border-[#d7dbe4] bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:border-[var(--gc-focus)] focus:ring-1 focus:ring-[var(--gc-focus-ring)]"
            placeholder="e.g. 1"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[#667083]">No documents found.</p>
      ) : (
        <div className="overflow-auto rounded border border-[#e6eaf2]">
          <table className="min-w-[800px] w-full text-left text-xs">
            <thead className="bg-[#f7f9fc] text-[#4f5a68]">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const title = row.title ?? row.name ?? "—";
                const fileUrl = row.file_url ?? row.url ?? row.file ?? "";
                return (
                  <tr key={`${row.id ?? idx}`} className="border-t border-[#eef2f7]">
                    <td className="px-3 py-2 text-[#667083]">{idx + 1}</td>
                    <td className="px-3 py-2 text-[#2f3a46]">{title}</td>
                    <td className="px-3 py-2">
                      {fileUrl ? (
                        <a className="text-[#3b79b3] hover:underline" href={String(fileUrl)} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        <span className="text-[#98a4b5]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#2f3a46]">{String(row.status ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded border border-[#e6eaf2] p-3">
        <summary className="text-xs font-semibold text-[#445063]">Debug payload</summary>
        <pre className="mt-2 overflow-auto text-xs text-[#445063]">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

