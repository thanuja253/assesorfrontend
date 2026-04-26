"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { getProjectLaunchTraining } from "@/lib/assessor-project-api";
import { textValue } from "../_ui";

export default function AssessorProjectLaunchTrainingPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
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
        const payload = await getProjectLaunchTraining(projectId);
        if (cancelled) return;
        setData(payload);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load launch & training details.");
        setData({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;
  const sessions = Array.isArray(data.sessions)
    ? (data.sessions as Record<string, unknown>[])
    : [];
  const firstSession = sessions[0] ?? {};
  const doc = (data.document as Record<string, unknown> | undefined) ?? data;
  const documentName =
    firstSession.document_filename ??
    firstSession.file_name ??
    firstSession.name ??
    doc.document_filename ??
    doc.file_name ??
    doc.document_name ??
    doc.title;
  const documentDate =
    firstSession.session_date ??
    firstSession.date ??
    doc.session_date ??
    doc.date ??
    doc.document_date ??
    doc.created_at;
  const documentUrl =
    firstSession.document_url ??
    firstSession.file_url ??
    firstSession.url ??
    doc.document_url ??
    doc.file_url ??
    doc.url;
  const documentUrlText = typeof documentUrl === "string" ? documentUrl : "";
  const sessionRows = sessions.length > 0 ? sessions : [firstSession];

  return (
    <div className="max-w-[980px] rounded border border-[#e5eaf3] bg-white px-3 py-3">
      <p className="mb-3 text-sm font-semibold text-[#2f3a46]">Site Visit Report</p>
      <div className="overflow-hidden rounded border border-[#e8edf5]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f7f9fc] text-[#5b6676]">
            <tr>
              <th className="w-[40px] px-3 py-2">#</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="w-[90px] px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {sessionRows.map((session, idx) => {
              const rowUrlRaw =
                session.document_url ??
                session.file_url ??
                session.url ??
                (idx === 0 ? documentUrlText : "");
              const rowUrl = typeof rowUrlRaw === "string" ? rowUrlRaw : "";
              const sessionDateValue = textValue(
                session.session_date ?? session.date ?? (idx === 0 ? documentDate : ""),
              );
              const uploadedValue = textValue(
                session.uploaded_at ?? session.created_at ?? session.session_date ?? (idx === 0 ? documentDate : ""),
              );
              return (
                <tr
                  key={`${textValue(session.session_index ?? session.session_date ?? session.uploaded_at ?? session.document_filename ?? idx)}`}
                  className="border-t border-[#edf1f7] text-[#2d3746]"
                >
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">{sessionDateValue}</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">{rowUrl ? "Uploaded" : textValue(documentName)}</td>
                  <td className="px-3 py-2">{uploadedValue}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <a
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                          rowUrl
                            ? "border-[#cfd8e6] text-[#5b6780]"
                            : "cursor-not-allowed border-[#e3e7ef] bg-[#f7f9fc] text-[#a5afbf]"
                        }`}
                        href={rowUrl || undefined}
                        target={rowUrl ? "_blank" : undefined}
                        rel={rowUrl ? "noreferrer" : undefined}
                        aria-disabled={!rowUrl}
                        onClick={(e) => {
                          if (!rowUrl) e.preventDefault();
                        }}
                        title="View"
                      >
                        👁
                      </a>
                      <a
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] ${
                          rowUrl
                            ? "border-[#cfd8e6] text-[#5b6780]"
                            : "cursor-not-allowed border-[#e3e7ef] bg-[#f7f9fc] text-[#a5afbf]"
                        }`}
                        href={rowUrl || undefined}
                        download
                        target={rowUrl ? "_blank" : undefined}
                        rel={rowUrl ? "noreferrer" : undefined}
                        aria-disabled={!rowUrl}
                        onClick={(e) => {
                          if (!rowUrl) e.preventDefault();
                        }}
                        title="Download"
                      >
                        ⬇
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sessionRows.length === 0 ? (
        <p className="mt-2 text-xs text-[#7f8a9a]">No launch and training records available.</p>
      ) : null}
    </div>
  );
}

