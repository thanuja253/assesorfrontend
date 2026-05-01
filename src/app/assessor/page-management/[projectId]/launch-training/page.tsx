"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getFacilitatorProjectLaunchTraining,
  uploadFacilitatorProjectLaunchTrainingSession,
} from "@/lib/assessor-project-api";

type SessionForm = {
  sessionDate: string;
  sessionTime: string;
  file: File | null;
};

type SessionErrors = {
  sessionDate?: string;
  file?: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isAllowedFileType(file: File): boolean {
  const name = file.name.toLowerCase();
  const validExt =
    name.endsWith(".pdf") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp") ||
    name.endsWith(".bmp") ||
    name.endsWith(".svg");
  const validMime = file.type === "application/pdf" || file.type.startsWith("image/");
  return validExt || validMime;
}

function toSessionsByIndex(payload: Record<string, unknown>): Record<number, Record<string, unknown>> {
  const sessionsRaw = payload.sessions;
  const list = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const indexed: Record<number, Record<string, unknown>> = {};
  list.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const rec = item as Record<string, unknown>;
    const rawIndex = rec.session_index ?? rec.index ?? rec.session ?? idx + 1;
    let parsed = Number.NaN;
    if (typeof rawIndex === "number") {
      parsed = rawIndex;
    } else if (typeof rawIndex === "string") {
      parsed = Number.parseInt(rawIndex, 10);
    }
    const index = Number.isFinite(parsed) ? parsed : idx + 1;
    if (index >= 1 && index <= 4) {
      indexed[index] = rec;
    }
  });
  return indexed;
}

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function toDateInputValue(value: unknown): string {
  const raw = asText(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export default function AssessorProjectLaunchTrainingPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [forms, setForms] = useState<Record<number, SessionForm>>({
    1: { sessionDate: "", sessionTime: "", file: null },
    2: { sessionDate: "", sessionTime: "", file: null },
    3: { sessionDate: "", sessionTime: "", file: null },
    4: { sessionDate: "", sessionTime: "", file: null },
  });
  const [fieldErrors, setFieldErrors] = useState<Record<number, SessionErrors>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const minDate = todayIso();
  const maxDate = "2100-12-31";

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
        const payload = await getFacilitatorProjectLaunchTraining(projectId);
        if (cancelled) return;
        setData(payload);
        setError("");
      } catch {
        if (cancelled) return;
        setError("Could not load launch & training data.");
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

  useEffect(() => {
    const nextForms: Record<number, SessionForm> = {
      1: { sessionDate: "", sessionTime: "", file: null },
      2: { sessionDate: "", sessionTime: "", file: null },
      3: { sessionDate: "", sessionTime: "", file: null },
      4: { sessionDate: "", sessionTime: "", file: null },
    };
    const sessions = toSessionsByIndex(data);
    [1, 2, 3, 4].forEach((index) => {
      const session = sessions[index] ?? {};
      const sessionDate =
        toDateInputValue(session.session_date ?? session.date) ||
        (index === 1 ? toDateInputValue(data.launch_training_report_date) : "");
      const sessionTime = asText(session.session_time ?? session.time);
      nextForms[index] = {
        sessionDate,
        sessionTime,
        file: null,
      };
    });
    setForms(nextForms);
  }, [data]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const sessionsByIndex = toSessionsByIndex(data);
  const cards = [
    { index: 1, title: "Site Visit Report" },
    { index: 2, title: "Hand Holding Program 1" },
    { index: 3, title: "Hand Holding Program 2" },
    { index: 4, title: "Hand Holding Program 3" },
  ] as const;

  const setFormValue = (index: number, key: keyof SessionForm, value: string | File | null) => {
    setForms((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        [key]: value,
      },
    }));
  };

  const setSessionError = (index: number, next: SessionErrors) => {
    setFieldErrors((prev) => ({ ...prev, [index]: next }));
  };

  const validateSession = (index: number): boolean => {
    const form = forms[index];
    const nextErrors: SessionErrors = {};
    const sessionDate = form.sessionDate.trim();
    if (sessionDate) {
      const parsed = new Date(`${sessionDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        nextErrors.sessionDate = "This field is required.";
      } else if (sessionDate < minDate) {
        nextErrors.sessionDate = "Session date cannot be in the past.";
      }
    } else {
      nextErrors.sessionDate = "This field is required.";
    }
    if (!form.file) {
      nextErrors.file = "This field is required.";
    } else if (!isAllowedFileType(form.file)) {
      nextErrors.file = "Only PDF or image files are allowed.";
    }
    setSessionError(index, nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleUpload = async (index: number) => {
    setToastMessage("");
    if (!validateSession(index)) return;
    const form = forms[index];
    if (!form.file) return;
    if (index < 1 || index > 4) {
      setToastMessage("Session index must be between 1 and 4.");
      return;
    }
    setUploadingIndex(index);
    try {
      await uploadFacilitatorProjectLaunchTrainingSession(projectId, {
        sessionIndex: index,
        sessionDate: form.sessionDate,
        sessionTime: form.sessionTime,
        document: form.file,
      });
      setToastMessage("Session document uploaded. The company can view it; they are notified by the server.");
      const payload = await getFacilitatorProjectLaunchTraining(projectId);
      setData(payload);
      setSessionError(index, {});
    } catch (e: unknown) {
      if (e instanceof AuthApiError) {
        setToastMessage(e.message || "Upload failed.");
      } else {
        setToastMessage("Upload failed.");
      }
    } finally {
      setUploadingIndex(null);
    }
  };

  return (
    <div className="space-y-3">
      {toastMessage ? (
        <p className={`rounded border px-3 py-2 text-xs ${
          toastMessage.toLowerCase().includes("uploaded")
            ? "border-[#b7e4c5] bg-[#ecfdf3] text-[#1e7a3f]"
            : "border-[#ffd4d4] bg-[#fff4f4] text-[#a94442]"
        }`}>
          {toastMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => {
          const session = sessionsByIndex[card.index] ?? {};
          const uploadedUrl = asText(session.document_url ?? session.file_url ?? session.url);
          const uploadedFilename = asText(
            session.document_filename ??
              session.file_name ??
              session.document_name,
          );
          const form = forms[card.index];
          const errors = fieldErrors[card.index] ?? {};
          const isUploading = uploadingIndex === card.index;

          return (
            <section key={card.index} className="rounded border border-[#e2e8f0] bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-[#2f3a46]">{card.title}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`launch-session-date-${card.index}`} className="mb-1 block text-[11px] text-[#5f6b7a]">Session date</label>
                  <input
                    id={`launch-session-date-${card.index}`}
                    type="date"
                    value={form.sessionDate}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFormValue(card.index, "sessionDate", next);
                      setSessionError(card.index, { ...errors, sessionDate: undefined });
                    }}
                    className="h-8 w-full rounded border border-[#d7deea] px-2 text-xs text-[#2f3a46]"
                  />
                  <p className="mt-1 text-[10px] text-[#8a96a8]">Only today and future dates are allowed.</p>
                  {errors.sessionDate ? <p className="mt-1 text-[11px] text-[#c62828]">{errors.sessionDate}</p> : null}
                </div>
                <div>
                  <label htmlFor={`launch-session-time-${card.index}`} className="mb-1 block text-[11px] text-[#5f6b7a]">Session time (optional)</label>
                  <input
                    id={`launch-session-time-${card.index}`}
                    type="time"
                    value={form.sessionTime}
                    onChange={(e) => setFormValue(card.index, "sessionTime", e.target.value)}
                    className="h-8 w-full rounded border border-[#d7deea] px-2 text-xs text-[#2f3a46]"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor={`launch-session-file-${card.index}`} className="mb-1 block text-[11px] text-[#5f6b7a]">Document Upload</label>
                {uploadedUrl ? (
                  <div className="mt-2 flex items-center justify-between rounded border border-[#dde4ee] bg-[#f8fbff] px-3 py-2">
                    <p className="truncate pr-3 text-[11px] text-[#2f3a46]">{uploadedFilename || "Uploaded document"}</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={uploadedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#cfd8e6] bg-white text-[10px] text-[#55637b] hover:bg-[#f5f8fd]"
                        title="View"
                      >
                        👁
                      </a>
                      <a
                        href={uploadedUrl}
                        download={uploadedFilename || undefined}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#cfd8e6] bg-white text-[10px] text-[#55637b] hover:bg-[#f5f8fd]"
                        title="Download"
                      >
                        ⬇
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`launch-session-file-${card.index}`}
                        className="inline-flex h-8 cursor-pointer items-center rounded border border-[#cfd8e6] bg-white px-3 text-[11px] font-medium text-[#46566f] hover:bg-[#f6f9fe]"
                      >
                        Choose File
                      </label>
                      <input
                        id={`launch-session-file-${card.index}`}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,application/pdf,image/*"
                        onChange={(e) => {
                          setFormValue(card.index, "file", e.target.files?.[0] ?? null);
                          setSessionError(card.index, { ...errors, file: undefined });
                        }}
                        className="hidden"
                      />
                      <p className="max-w-[240px] truncate text-[11px] text-[#7a8598]">
                        {form.file ? form.file.name : "No file chosen"}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleUpload(card.index)}
                        disabled={isUploading}
                        className="inline-flex h-7 items-center rounded bg-[#1f8f4e] px-3 text-[11px] font-medium text-white hover:bg-[#187740] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isUploading ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                    {errors.file ? <p className="mt-1 text-[11px] text-[#c62828]">{errors.file}</p> : null}
                    <p className="mt-2 text-[11px] text-[#7f8a9a]">No document uploaded yet.</p>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

