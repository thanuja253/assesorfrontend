"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { refreshAssessorNotifications } from "@/lib/assessor-notifications-api";
import {
  downloadAssessorFinalScoring,
  downloadAssessorSampleChecklistDocument,
  finalSubmitAssessorScore,
  getAdminAssessmentScoring,
  getCompanyAssessmentCriteriaBySector,
  getCompanyProjectQuickView,
  loadProjectHybridContext,
} from "@/lib/assessor-project-api";
import { resolveFacilitatorProcessFromContext } from "@/lib/hybrid-workflow";
import { SectionCard } from "../_ui";

type CriteriaItem = {
  id: string;
  label: string;
  sampleUrl?: string;
};

type ScoringRow = {
  id?: string | number;
  parameter_id?: string;
  criteria_id?: string;
  parameter?: string;
  name?: string;
  description?: string;
  max_score?: number;
  preliminary_score?: number | string;
  coordinator_remarks?: string;
};

function toStringSafe(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function displayText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return (
      toStringSafe(rec.name) ||
      toStringSafe(rec.label) ||
      toStringSafe(rec.group_name) ||
      toStringSafe(rec.sector_name) ||
      "—"
    );
  }
  return "—";
}

function resolvePreScore(row: ScoringRow): number {
  const candidates: unknown[] = [
    row.preliminary_score,
    (row as Record<string, unknown>).pre_assessment_score,
    (row as Record<string, unknown>).pre_assesment_score,
    (row as Record<string, unknown>).preassesmentscore,
    (row as Record<string, unknown>).preliminaryscore,
    (row as Record<string, unknown>).pre_score,
    (row as Record<string, unknown>).coordinator_score,
    (row as Record<string, unknown>).coordinator_preliminary_score,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function toRows(payload: unknown): ScoringRow[] {
  if (Array.isArray(payload)) return payload as ScoringRow[];
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  const candidates = [rec.items, rec.rows, rec.data, rec.criteria, rec.parameters];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as ScoringRow[];
  }
  return [];
}

function getRowKey(row: ScoringRow, index: number): string {
  return String(row.parameter_id ?? row.id ?? `row-${index}`);
}

function getSubmitLockStorageKey(projectId: string, criteriaId: string): string {
  return `assessor-final-submit-lock:${projectId}:${criteriaId || "default"}`;
}

/** Facilitator flow (process_type &quot;f&quot;) — quick view / profile. */
function detectFacilitatorProcessType(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const raw =
    profile.process_type ??
    profile.processType ??
    project.process_type ??
    project.processType ??
    company.process_type ??
    company.processType ??
    quickView.process_type ??
    quickView.processType;
  const text =
    typeof raw === "string" || typeof raw === "number" ? String(raw).trim().toLowerCase() : "";
  return text === "f";
}

/** True only when assessor final submit is recorded — not CII `final_submitted` on rows. */
function isRowAssessorFinalSubmitted(rec: Record<string, unknown>): boolean {
  const submitted =
    rec.assessor_final_submitted ??
    rec.is_assessor_final_submitted ??
    rec.assessor_submitted ??
    rec.assessor_approval;
  if (submitted === true) return true;
  if (typeof submitted === "number") return submitted === 1;
  if (typeof submitted === "string") {
    const s = submitted.trim();
    return s === "1" || s.toLowerCase() === "true";
  }
  return false;
}

export default function AssessorProjectScoringPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("THANUJA");
  const [sector, setSector] = useState("THANUJA 1");
  const [criteriaList, setCriteriaList] = useState<CriteriaItem[]>([]);
  const [selectedCriteriaId, setSelectedCriteriaId] = useState("");
  const [rows, setRows] = useState<ScoringRow[]>([]);
  const [scoresByParam, setScoresByParam] = useState<Record<string, string>>({});
  const [remarksByParam, setRemarksByParam] = useState<Record<string, string>>({});
  const [scoreErrorsByParam, setScoreErrorsByParam] = useState<Record<string, string>>({});
  const [remarkErrorsByParam, setRemarkErrorsByParam] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState(false);
  const [isFinalSubmittedForCurrentCriteria, setIsFinalSubmittedForCurrentCriteria] = useState(false);
  const [hideActionButtonsAfterSubmit, setHideActionButtonsAfterSubmit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      console.log("projectId", projectId);
      setError("Invalid project id.");
      setRows([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const quickView = await getCompanyProjectQuickView(projectId);
        if (cancelled) return;
        const sectorId = String(
          quickView.sector_id ??
            quickView.sectorId ??
            (quickView.profile as Record<string, unknown> | undefined)?.mst_sector_id ??
            (quickView.sector as Record<string, unknown> | undefined)?.id ??
            (quickView.project as Record<string, unknown> | undefined)?.sector_id ??
            "",
        );
        setGroup(
          displayText(
            quickView.group ??
              quickView.group_name ??
              (quickView.sector as Record<string, unknown> | undefined)?.group_name ??
              "THANUJA",
          ),
        );
        setSector(
          displayText(
            quickView.sector ??
              quickView.sector_name ??
              (quickView.sector as Record<string, unknown> | undefined)?.name ??
              "THANUJA 1",
          ),
        );
        if (!sectorId) {
            setCriteriaList([]);
          setRows([]);
          return;
        }
          const criteriaPayload = await getCompanyAssessmentCriteriaBySector(sectorId);
        if (cancelled) {
          return;
        }
        const criteriaRows = toRows(criteriaPayload);
        const parsedCriteria = criteriaRows
            .map((row) => ({
              id: toStringSafe(
                row.criteria_id ??
                  (row as Record<string, unknown>).criterian_id ??
                  row.id ??
                  "",
              ),
              label: toStringSafe(
                (row as Record<string, unknown>).criterion_sc ??
                  (row as Record<string, unknown>).criteria_name ??
                  row.parameter ??
                  row.name ??
                  "Criteria",
              ),
              sampleUrl: toStringSafe(
                (row as Record<string, unknown>).sample_checklist_document ??
                  (row as Record<string, unknown>).checklist_document ??
                  (row as Record<string, unknown>).sample_document_url ??
                  "",
              ),
            }))
            .filter((row) => row.id);
        setCriteriaList(parsedCriteria);
        setSelectedCriteriaId((prev) => prev || parsedCriteria[0]?.id || "");
      } catch (e: unknown) {
        if (cancelled) return;
        setActionMessage(e instanceof AuthApiError ? e.message : "Could not load criteria list.");
        setCriteriaList([]);
        setRows([]);
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
    let cancelled = false;
    if (!projectId) return () => undefined;
    setLoading(true);
    setError("");
    setActionMessage("");
    const loadRows = async () => {
      try {
        const submitLockKey = getSubmitLockStorageKey(projectId, selectedCriteriaId);
        const sessionStorageRef = globalThis.window?.sessionStorage;
        const storedSubmitLock = sessionStorageRef?.getItem(submitLockKey) === "1";
        const [scoringPayload, hybridCtx] = await Promise.all([
          getAdminAssessmentScoring(projectId, selectedCriteriaId || undefined),
          loadProjectHybridContext(projectId, "company"),
        ]);
        if (cancelled) return;
        const isFacilitatorProcess = resolveFacilitatorProcessFromContext(
          hybridCtx,
          hybridCtx.quickview,
        );
        const scoringObj = (scoringPayload.scoring as Record<string, unknown> | undefined) ?? {};
        const scoringRows = toRows(scoringObj.rows ?? scoringObj.data ?? scoringPayload.rows ?? []).map((row) => ({
          ...row,
          preliminary_score: resolvePreScore(row),
          coordinator_remarks:
            toStringSafe(row.coordinator_remarks) ||
            toStringSafe((row as Record<string, unknown>).coordinatorremarks) ||
            toStringSafe((row as Record<string, unknown>).remarks),
        }));
        setRows(scoringRows);
        const nextScores: Record<string, string> = {};
        const nextRemarks: Record<string, string> = {};
        scoringRows.forEach((row, index) => {
          const key = getRowKey(row, index);
          if (!key) return;
          const scoreValue =
            (row as Record<string, unknown>).assessor_score ??
            (row as Record<string, unknown>).assessment_score ??
            (row as Record<string, unknown>).assesment_score ??
            (row as Record<string, unknown>).final_score ??
            "";
          const remarksValue =
            (row as Record<string, unknown>).assessor_remarks ??
            (row as Record<string, unknown>).remarks ??
            "";
          nextScores[key] = toStringSafe(scoreValue);
          nextRemarks[key] = toStringSafe(remarksValue);
        });
        setScoresByParam(nextScores);
        setRemarksByParam(nextRemarks);
        setScoreErrorsByParam({});
        setRemarkErrorsByParam({});
        const allSubmittedLegacy =
          scoringRows.length > 0 &&
          scoringRows.every((row) => {
            const rec = row as Record<string, unknown>;
            const submitted =
              rec.assessor_final_submitted ??
              rec.final_submitted ??
              rec.is_final_submitted ??
              rec.assessor_approval;
            if (submitted === true) return true;
            if (typeof submitted === "number") return submitted === 1;
            if (typeof submitted === "string") return submitted.trim() === "1" || submitted.trim().toLowerCase() === "true";
            return false;
          });
        const allSubmittedFacilitator =
          scoringRows.length > 0 &&
          scoringRows.every((row) => isRowAssessorFinalSubmitted(row as Record<string, unknown>));
        const allSubmitted = isFacilitatorProcess ? allSubmittedFacilitator : allSubmittedLegacy;
        const facilitatorHasFinalScoringData =
          Object.values(nextScores).some((value) => {
            const n = Number(value);
            return !Number.isNaN(n) && n > 0;
          }) ||
          Object.values(nextRemarks).some((value) => value.trim().length > 0);
        /**
         * Facilitator (f): hide Save only when assessor final flags are set — not CII row final_submitted.
         * Ignore session lock for f so a stale lock cannot block Save after preliminary/CII completion.
         */
        const shouldHideButtons = isFacilitatorProcess
          ? allSubmitted || facilitatorHasFinalScoringData
          : storedSubmitLock || allSubmittedLegacy;
        setIsFinalSubmittedForCurrentCriteria(allSubmitted);
        setHideActionButtonsAfterSubmit(shouldHideButtons);
        if (!isFacilitatorProcess && shouldHideButtons) {
          sessionStorageRef?.setItem(submitLockKey, "1");
        }
        setError("");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load scoring rows.");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedCriteriaId]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const totalMax = rows.reduce((sum, row) => sum + Number(row.max_score ?? 10), 0);
  const totalPre = rows.reduce((sum, row) => sum + resolvePreScore(row), 0);
  const totalFinal = rows.reduce((sum, row, index) => {
    const key = getRowKey(row, index);
    return sum + Number(scoresByParam[key] ?? 0);
  }, 0);

  const validateInlineBeforeSubmit = (): boolean => {
    if (!selectedCriteriaId || rows.length === 0) {
      setActionMessage("No scoring rows available for this criteria.");
      return false;
    }
    if (!selectedCriteriaId || rows.length === 0) {
      setActionMessage("No scoring rows available for this criteria.");
      return false;
    }
    const nextScoreErrors: Record<string, string> = {};
    const nextRemarkErrors: Record<string, string> = {};
    rows.forEach((row, index) => {
      const rowKey = getRowKey(row, index);
      const scoreText = (scoresByParam[rowKey] ?? "").trim();
      const scoreValue = Number(scoreText);
      const maxScore = Number(row.max_score ?? 10);
      const remarksText = (remarksByParam[rowKey] ?? "").trim();
      if (!scoreText || Number.isNaN(scoreValue)) {
        nextScoreErrors[rowKey] = "Final assessment score is required.";
      } else if (scoreValue > maxScore) {
        nextScoreErrors[rowKey] = `Final assessment score cannot exceed maximum score (${maxScore}).`;
      }
      if (!remarksText) {
        nextRemarkErrors[rowKey] = "Assessor remarks are required.";
      }
    });
    setScoreErrorsByParam(nextScoreErrors);
    setRemarkErrorsByParam(nextRemarkErrors);
    if (Object.keys(nextScoreErrors).length > 0 || Object.keys(nextRemarkErrors).length > 0) {
      setActionMessage("Please fill required final score and remarks.");
      return false;
    }
    return true;
  };

  const submitScore = async () => {
    if (!validateInlineBeforeSubmit()) {
      return;
    }

    const payloadRows = rows
      .map((row, index) => {
        const parameterId = String(row.parameter_id ?? row.id ?? "");
        const rowKey = getRowKey(row, index);
        if (!parameterId) return null;
        const numericScore = Number(scoresByParam[rowKey] ?? "");
        if (Number.isNaN(numericScore)) return null;
        return {
          parameter_id: parameterId,
          assessor_score: numericScore,
          assessor_remarks: remarksByParam[rowKey] ?? "",
          remarks: remarksByParam[rowKey] ?? "",
        };
      })
      .filter((row): row is { parameter_id: string; assessor_score: number; assessor_remarks: string; remarks: string } => row !== null);

    if (payloadRows.length === 0) {
      setActionMessage("Enter valid assessor score(s) before submit.");
      return;
    }
    setSaving(true);
    setActionMessage("");
    try {
      const payload = {
        criteria_id: selectedCriteriaId,
        rows: payloadRows,
      };
      await finalSubmitAssessorScore(projectId, payload);
      refreshAssessorNotifications();
      await getCompanyProjectQuickView(projectId);
      const submitLockKey = getSubmitLockStorageKey(projectId, selectedCriteriaId);
      globalThis.window?.sessionStorage?.setItem(submitLockKey, "1");
      setIsFinalSubmittedForCurrentCriteria(true);
      setHideActionButtonsAfterSubmit(true);
      setActionMessage("Final submit completed successfully.");
    } catch (e: unknown) {
      setActionMessage(e instanceof AuthApiError ? e.message : "Could not submit assessor score.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportScoring = async () => {
    setActionMessage("");
    try {
      const { blob, filename } = await downloadAssessorFinalScoring(projectId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `final-scoring-${projectId}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionMessage("Scoring export downloaded successfully.");
    } catch (e: unknown) {
      setActionMessage(e instanceof AuthApiError ? e.message : "Could not download scoring export.");
    }
  };

  const handleDownloadSampleChecklist = async () => {
    setActionMessage("");
    try {
      const { blob, filename } = await downloadAssessorSampleChecklistDocument(projectId, sector || undefined);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `sample-checklist-${projectId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionMessage("Sample checklist downloaded successfully.");
    } catch (e: unknown) {
      setActionMessage(e instanceof AuthApiError ? e.message : "Sample checklist document is unavailable for selected criteria.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#e5eaf3] bg-white px-5 py-3">
        <div className="flex gap-8 text-sm font-semibold text-[#2d3746]">
          <p>GROUP : {group}</p>
          <p>SECTOR : {sector}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExportScoring()}
            className="rounded bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white"
          >
            Export Scoring Document
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadSampleChecklist()}
            className="rounded bg-[#2f8f4e] px-4 py-2 text-sm font-medium text-white"
          >
            Download Sample Checklist Document
          </button>
        </div>
      </div>

      <SectionCard title={selectedCriteriaId || "Criteria"}>
        {criteriaList.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {criteriaList.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedCriteriaId(item.id)}
                className={`rounded border px-3 py-1 text-xs ${
                  selectedCriteriaId === item.id
                    ? "border-[#2f8f4e] bg-[#2f8f4e] text-white"
                    : "border-[#d7dfe9] bg-white text-[#4f5a68]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-[#7f8a9a]">No score rows found.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row, rowIndex) => {
              const rowKey = getRowKey(row, rowIndex);
              const rowPreScore = resolvePreScore(row);
              let preScoreToShow = rowPreScore;
              if (rowPreScore <= 0 && rows.length === 1 && totalPre > 0) {
                preScoreToShow = totalPre;
              }
              const preScoreText = Number.isFinite(preScoreToShow) ? String(preScoreToShow) : "0";
              return (
              <div key={`${String(row.id ?? row.parameter ?? row.name)}`} className="grid gap-5 text-sm lg:grid-cols-[1.1fr_1fr_1.2fr_1.3fr]">
                <div>
                  <p className="mb-2 font-medium text-[#5c6777]">Parameter</p>
                  <p className="text-[#2d3746]">
                    {toStringSafe(
                      (row as Record<string, unknown>).parameter_short_name ??
                        (row as Record<string, unknown>).parameter_sc ??
                        row.parameter ??
                        row.name ??
                        "—",
                    )}
                  </p>
                </div>
                <div>
                  <p className="mb-2 font-medium text-[#5c6777]">Description</p>
                  <p className="text-[#2d3746]">{row.description ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="mb-2 font-medium text-[#5c6777]">Score</p>
                  <label className="block">
                    <span className="text-[#5c6777]">Pre-Assessment Score</span>
                    <div className="mt-1 flex h-9 w-full items-center rounded border border-[#d7dfe9] bg-[#f8fafd] px-3 font-medium text-[#2d3746]">
                      {preScoreText}
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[#5c6777]">Final Assessment Score</span>
                    <input
                      type="number"
                      min="0"
                      max={String(row.max_score ?? 10)}
                      value={scoresByParam[rowKey] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        const maxScore = Number(row.max_score ?? 10);
                        setScoresByParam((prev) => ({ ...prev, [rowKey]: value }));
                        setScoreErrorsByParam((prev) => {
                          const next = { ...prev };
                          const cleaned = value.trim();
                          const numericValue = Number(cleaned);
                          if (!cleaned) {
                            next[rowKey] = "";
                          } else if (!/^\d+(\.\d+)?$/.test(cleaned) || Number.isNaN(numericValue)) {
                            next[rowKey] = "Enter a valid numeric score.";
                          } else if (numericValue > maxScore) {
                            next[rowKey] = `Final assessment score cannot exceed maximum score (${maxScore}).`;
                          } else {
                            next[rowKey] = "";
                          }
                          return next;
                        });
                        setActionMessage("");
                      }}
                      onBlur={() => {
                        const maxScore = Number(row.max_score ?? 10);
                        const value = (scoresByParam[rowKey] ?? "").trim();
                        const numericValue = Number(value);
                        if (value && !Number.isNaN(numericValue) && numericValue > maxScore) {
                          setScoreErrorsByParam((prev) => ({
                            ...prev,
                            [rowKey]: `Final assessment score cannot exceed maximum score (${maxScore}).`,
                          }));
                        }
                      }}
                      className="mt-1 h-9 w-full rounded border border-[#d7dfe9] bg-white px-3 text-base font-medium text-[#1f2937] caret-[#1f2937] outline-none"
                    />
                    {scoreErrorsByParam[rowKey] ? (
                      <p className="mt-1 text-xs text-[#a94442]">{scoreErrorsByParam[rowKey]}</p>
                    ) : null}
                  </label>
                  <p className="text-[#5c6777]">Maximum Score : {String(row.max_score ?? 10)}</p>
                </div>
                <div>
                  <p className="mb-2 font-medium text-[#5c6777]">
                    Assessor Remarks <span className="text-[#d8232a]">*</span>
                  </p>
                  <textarea
                    className="h-[96px] w-full rounded border border-[#d7dfe9] bg-white px-3 py-2 text-base font-medium text-[#1f2937] caret-[#1f2937] outline-none"
                    value={remarksByParam[rowKey] ?? ""}
                    onChange={(e) => {
                      setRemarksByParam((prev) => ({ ...prev, [rowKey]: e.target.value }));
                      setRemarkErrorsByParam((prev) => ({ ...prev, [rowKey]: "" }));
                      setActionMessage("");
                    }}
                  />
                  {remarkErrorsByParam[rowKey] ? (
                    <p className="mt-1 text-xs text-[#a94442]">{remarkErrorsByParam[rowKey]}</p>
                  ) : null}
                  <p className="mt-2 text-[#5c6777]">
                    Co-ordinator Remarks : {String(row.coordinator_remarks ?? "—")}
                  </p>
                </div>
              </div>
            );
            })}

            <div className="grid grid-cols-3 overflow-hidden rounded border border-[#e5eaf3] text-center text-sm">
              <div className="border-r border-[#e5eaf3] bg-[#f7f9fc] p-2 font-semibold text-[#4f5a68]">TOTAL MAX SCORE</div>
              <div className="border-r border-[#e5eaf3] bg-[#f7f9fc] p-2 font-semibold text-[#4f5a68]">TOTAL PRE-ASSESSMENT SCORE</div>
              <div className="bg-[#f7f9fc] p-2 font-semibold text-[#4f5a68]">TOTAL FINAL SCORE</div>
              <div className="border-r border-[#e5eaf3] p-2 text-[#2d3746]">{String(totalMax)}</div>
              <div className="border-r border-[#e5eaf3] p-2 text-[#2d3746]">{String(totalPre)}</div>
              <div className="p-2 text-[#2d3746]">{String(totalFinal)}</div>
            </div>
          </div>
        )}
      </SectionCard>

      {actionMessage ? (
        <p className={`text-center text-sm ${actionMessage.includes("successfully") ? "text-[#2f8f4e]" : "text-[#a94442]"}`}>
          {actionMessage}
        </p>
      ) : null}

      {isFinalSubmittedForCurrentCriteria || hideActionButtonsAfterSubmit ? null : (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (validateInlineBeforeSubmit()) {
                setShowFinalSubmitConfirm(true);
              }
            }}
            disabled={saving}
            className="rounded bg-[#2f8f4e] px-6 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Submitting..." : "Save"}
          </button>
          <button type="button" className="rounded border border-[#d7dfe9] bg-white px-5 py-2 text-sm text-[#5c6777]">Cancel</button>
        </div>
      )}

      {showFinalSubmitConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-[#2f3a46]">Confirm final submit</h3>
            <p className="mt-2 text-sm text-[#5f6876]">
              Clicking Save will perform final submit for this scoring. Do you want to continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFinalSubmitConfirm(false)}
                className="rounded border border-[#d5dae3] bg-white px-4 py-1.5 text-xs text-[#667083]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFinalSubmitConfirm(false);
                  void submitScore();
                }}
                className="rounded bg-[#2e6b4a] px-4 py-1.5 text-xs text-white hover:bg-[#255a3e]"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

