"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { useOptionalPanelNotifications } from "@/components/panel-notifications/PanelNotificationsProvider";
import {
  parsePrimaryDataRejectionFromNotifications,
  parsePrimaryDataResubmissionFromNotifications,
  parsePrimaryDataLatestStateFromNotifications,
  parseChecklistLatestStateFromNotifications,
  parse2ndProformaLatestStateFromNotifications,
  type PanelNotification,
} from "@/lib/panel-notifications-api";
import {
  getFacilitatorFinanceInvoices,
  getFacilitatorFinanceInvoiceApprovalStatus,
  getFacilitatorProjectLaunchTraining,
  getFacilitatorProjectPrimaryData,
  getFacilitatorProjectPrimaryDataReview,
  getCompanyProjectPrimaryData,
  getAdminProjectPrimaryData,
  getCompanyProjectPrimaryDataReview,
  getAdminProjectPrimaryDataReview,
  getCompanyProjectChecklistDocuments,
  getCompanyProjectFacilitatorRegistrationInfo,
  getCompanyProjectProjectCode,
  getFacilitatorProjectQuickView,
  getProjectQuickView,
  getProjectSignedContractDocument,
  getCompanyCoordinators,
  getCompanyProjectAssignments,
  getAdminProjectPDetails,
  getAdminApprovedAssessorsCatalog,
  getAdminProjectCertificate,
  getCompanyAssessmentCriteriaBySector,
  getAdminAssessmentScoring,
} from "@/lib/assessor-project-api";
import {
  bindContractQuickview,
  contractPhaseToFlowSteps,
  facilitatorShouldUploadContract,
} from "@/lib/facilitator-contract-workflow";
import { KVRow, SectionCard, normalizeRecords, textValue } from "../_ui";

function pickFirstRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
      return value[0] as Record<string, unknown>;
    }
  }
  return {};
}

function pickRecordList(source: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = source[key];
    const records = normalizeRecords(value);
    if (records.length > 0) return records;
  }
  return [];
}

function mapQuickviewAssessors(input: Record<string, unknown>[]): Record<string, unknown>[] {
  return input.map((item) => {
    const detail =
      (item.Assessor_Detail as Record<string, unknown> | undefined) ??
      (item.assessor_detail as Record<string, unknown> | undefined) ??
      {};
    return {
      ...item,
      name: detail.name ?? item.name,
      email: detail.email ?? item.email,
      mobile: detail.mobile ?? item.mobile,
      visit_dates: item.visit_dates ?? item.site_visit_dates ?? [],
    };
  });
}

function formatDateDDMMYYYY(value: unknown): string {
  const raw = textValue(value);
  if (!raw || raw === "—") return "—";

  const onlyDatePart = raw.includes("T") ? raw.split("T")[0] : raw.split(" ")[0];
  const parts = onlyDatePart.split(/[-/]/).filter(Boolean);
  if (parts.length >= 3) {
    const [a, b, c] = parts;
    if (a.length === 4) return `${b.padStart(2, "0")}/${c.padStart(2, "0")}/${a}`;
    if (c.length === 4) return `${a.padStart(2, "0")}/${b.padStart(2, "0")}/${c}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toPlainString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function hasMeaningfulAssignedAssessors(assessors: Record<string, unknown>[]): boolean {
  return assessors.some((a) => {
    const id = toPlainString(a.id ?? a.assessor_id ?? a.assessorId ?? a._id);
    const name = toPlainString(a.name ?? a.assessor_name ?? a.assessorName);
    const email = toPlainString(a.email).toLowerCase();
    return id.length > 0 || name.trim().length > 0 || email.length > 0;
  });
}

function resolveFirstSectorCriteriaId(criteriaPayload: Record<string, unknown>): string {
  const rows = pickRecordList(criteriaPayload, ["data", "items", "rows", "result", "criteria"]);
  for (const row of rows) {
    const idRaw =
      row.criteria_id ??
      (row as Record<string, unknown>).criterian_id ??
      row.id ??
      (row as Record<string, unknown>)._id;
    const idStr = typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw).trim() : "";
    if (idStr) return idStr;
  }
  return "";
}

function hasScoringSignals(obj: Record<string, unknown>): boolean {
  return (
    "total_pre_assessment_score" in obj ||
    "total_preliminary_score" in obj ||
    "total_final_score" in obj ||
    "total_score" in obj ||
    "percentage_score" in obj ||
    "criteria_projectscore" in obj ||
    "high_projectscore" in obj ||
    "max_score" in obj ||
    "certification_level" in obj
  );
}

function extractFacilitatorScoringBlock(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;

  const direct = payload.scoring;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  if (hasScoringSignals(payload)) {
    return payload;
  }
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const s = d.scoring;
    if (s && typeof s === "object" && !Array.isArray(s)) return s as Record<string, unknown>;
    if (hasScoringSignals(d)) return d;
  }
  return null;
}

/**
 * Extract all criteria scoring entries from `data.by_criteria` (admin scoring API format).
 * Returns array of per-criteria objects with total_final_score, final_submitted, rows, etc.
 */
function extractByCriteriaScoringEntries(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const sources = [payload, payload.data as Record<string, unknown> | undefined];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const byCriteria = (source as Record<string, unknown>).by_criteria ?? (source as Record<string, unknown>).byCriteria;
    if (byCriteria && typeof byCriteria === "object" && !Array.isArray(byCriteria)) {
      const entries = Object.values(byCriteria as Record<string, unknown>);
      const records = entries.filter(
        (v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v),
      );
      if (records.length > 0) return records;
    }
  }
  return [];
}

function hasNestedArrayEntries(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) =>
    Array.isArray(entry) ? entry.length > 0 : entry !== null && entry !== undefined,
  );
}

/** True when CII preliminary / pre-assessment scores exist (aligned with scoring page fields). */
function hasFacilitatorPreliminaryScoringDone(payload: Record<string, unknown> | null): boolean {
  const scoring = extractFacilitatorScoringBlock(payload);
  if (scoring) {
    const totalRaw =
      scoring.total_pre_assessment_score ??
      scoring.total_preliminary_score ??
      scoring.total_score ??
      scoring.total_pre_assessment ??
      scoring.totalPreAssessmentScore;
    const totalNum = Number(totalRaw);
    if (!Number.isNaN(totalNum) && totalNum !== 0) return true;
    if (hasNestedArrayEntries(scoring.criteria_projectscore)) return true;

    const rowsRaw = scoring.rows;
    if (Array.isArray(rowsRaw)) {
      for (const row of rowsRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const candidates = [
          r.preliminary_score, r.pre_assessment_score, r.pre_assesment_score,
          r.coordinator_score, r.coordinator_preliminary_score, r.pre_score,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (!Number.isNaN(n) && n !== 0) return true;
        }
      }
    }
  }

  const byCriteriaEntries = extractByCriteriaScoringEntries(payload);
  for (const entry of byCriteriaEntries) {
    const preTotal = Number(entry.total_pre_assessment_score ?? entry.total_preliminary_score);
    if (!Number.isNaN(preTotal) && preTotal > 0) return true;
    if (entry.final_submitted === true) return true;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const n = Number(r.preliminary_score ?? r.pre_assessment_score);
      if (!Number.isNaN(n) && n > 0) return true;
    }
  }
  return false;
}

/** True when assessor final scoring exists in scoring payload (final_score / total_final_score > 0). */
function hasFacilitatorFinalScoringSubmitted(payload: Record<string, unknown> | null): boolean {
  const scoring = extractFacilitatorScoringBlock(payload);
  if (scoring) {
    const totalRaw =
      scoring.total_final_score ??
      scoring.total_score ??
      scoring.totalFinalScore;
    const totalNum = Number(totalRaw);
    if (!Number.isNaN(totalNum) && totalNum > 0) return true;
    const profile =
      (scoring.profile as Record<string, unknown> | undefined) ??
      ((scoring.data as Record<string, unknown> | undefined)?.profile as Record<string, unknown> | undefined) ??
      {};
    const scoreBandRaw = profile.score_band_status ?? profile.scoreBandStatus;
    const scoreBandNum = Number(scoreBandRaw);
    if (!Number.isNaN(scoreBandNum) && scoreBandNum === 1) return true;
    const certificationRaw = scoring.certification_level ?? scoring.certificationLevel;
    if (typeof certificationRaw === "string" && certificationRaw.trim().length > 0) return true;
    if (hasNestedArrayEntries(scoring.criteria_projectscore)) return true;

    const rowsRaw = scoring.rows;
    if (Array.isArray(rowsRaw)) {
      for (const row of rowsRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const candidates = [r.final_score, r.assessor_score, r.assessment_score, r.assesment_score];
        for (const c of candidates) {
          const n = Number(c);
          if (!Number.isNaN(n) && n > 0) return true;
        }
      }
    }
  }

  const byCriteriaEntries = extractByCriteriaScoringEntries(payload);
  if (byCriteriaEntries.length === 0) return false;
  return byCriteriaEntries.every((entry) => {
    if (entry.assessor_final_submitted === true || entry.final_submitted === true) return true;
    const totalFinal = Number(entry.total_final_score);
    if (!Number.isNaN(totalFinal) && totalFinal > 0) return true;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    return rows.length > 0 && rows.every((row) => {
      if (!row || typeof row !== "object") return false;
      const r = row as Record<string, unknown>;
      const score = Number(r.final_score ?? r.assessor_score ?? r.assessment_score);
      return !Number.isNaN(score) && score > 0;
    });
  });
}

function hasFacilitatorCertificateUploaded(payload: Record<string, unknown> | null): boolean {
  if (!payload || typeof payload !== "object") return false;
  const profile =
    (payload.profile as Record<string, unknown> | undefined) ??
    ((payload.data as Record<string, unknown> | undefined)?.profile as Record<string, unknown> | undefined) ??
    {};
  const certRaw = profile.certificate_document ?? profile.certificateDocument;
  return typeof certRaw === "string" && certRaw.trim().length > 0;
}

function normalizeStepText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function hasDisplayValue(value: unknown): boolean {
  return textValue(value) !== "—";
}

function toStepDetail(value: unknown): { activity: string; status: string; responsibility: string } {
  const rec = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const activity = textValue(rec.name ?? rec.step ?? rec.activity ?? value);
  const status = textValue(rec.status ?? rec.state ?? rec.status_label);
  const responsibility = textValue(rec.responsibility ?? rec.owner ?? rec.assigned_to);
  return { activity, status, responsibility };
}

function hasFacilitatorRegistrationPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const pick = (k: string): unknown => data[k];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return (
    str(pick("company_name")).length > 0 ||
    str(pick("plant_address")).length > 0 ||
    str(pick("gstin")).length > 0 ||
    str(pick("gstin_no")).length > 0 ||
    str(pick("contact_person_name")).length > 0 ||
    str(pick("city")).length > 0
  );
}

function hasProjectCodeAssignmentPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const flag = data.has_project_code ?? data.hasProjectCode;
  if (flag === true || flag === "true" || flag === 1 || flag === "1") return true;
  const code = data.project_code ?? data.projectCode;
  if (typeof code === "string" && code.trim().length > 0) return true;
  if (typeof code === "number" && String(code).trim().length > 0) return true;
  return false;
}

function hasLaunchTrainingPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const countRaw = data.sessions_count ?? data.sessionsCount;
  let count = Number.NaN;
  if (typeof countRaw === "number") {
    count = countRaw;
  } else if (typeof countRaw === "string") {
    count = Number.parseInt(countRaw, 10);
  }
  if (Number.isFinite(count) && count > 0) return true;
  const session = data.session;
  if (session && typeof session === "object") {
    const rec = session as Record<string, unknown>;
    const url = rec.document_url ?? rec.file_url ?? rec.url;
    if (typeof url === "string" && url.trim().length > 0) return true;
  }
  const sessionsRaw = data.sessions;
  if (Array.isArray(sessionsRaw)) {
    return sessionsRaw.some((item) => {
      if (!item || typeof item !== "object") return false;
      const rec = item as Record<string, unknown>;
      const url = rec.document_url ?? rec.file_url ?? rec.url;
      return typeof url === "string" && url.trim().length > 0;
    });
  }
  const rootUrl = data.document_url ?? data.file_url ?? data.url;
  return typeof rootUrl === "string" && rootUrl.trim().length > 0;
}

function hasProformaDocumentPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const invoicesRaw = data.invoices;
  if (!Array.isArray(invoicesRaw)) return false;
  return invoicesRaw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
    const typeText =
      typeof typeRaw === "string" || typeof typeRaw === "number"
        ? String(typeRaw).trim().toLowerCase()
        : "";
    const docRaw = rec.invoice_document ?? rec.document_url ?? rec.file_url ?? rec.url;
    const hasDoc = typeof docRaw === "string" && docRaw.trim().length > 0;
    return hasDoc && (typeText.includes("proforma") || typeText.includes("pro forma"));
  });
}

function hasProformaPaymentSubmittedPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const invoicesRaw = data.invoices;
  if (!Array.isArray(invoicesRaw)) return false;
  return invoicesRaw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
    const typeText =
      typeof typeRaw === "string" || typeof typeRaw === "number"
        ? String(typeRaw).trim().toLowerCase()
        : "";
    if (!(typeText.includes("proforma") || typeText.includes("pro forma"))) return false;

    const paymentStatusRaw = rec.payment_status ?? rec.paymentStatus;
    const paymentStatusText =
      typeof paymentStatusRaw === "string" || typeof paymentStatusRaw === "number"
        ? String(paymentStatusRaw).trim().toLowerCase()
        : "";
    const approvalStatusRaw = rec.approval_status ?? rec.approvalStatus;
    const approvalStatusText =
      typeof approvalStatusRaw === "string" || typeof approvalStatusRaw === "number"
        ? String(approvalStatusRaw).trim().toLowerCase()
        : "";
    const paidAmountRaw = rec.paid_amount ?? rec.paidAmount;
    const paidAmount =
      typeof paidAmountRaw === "number"
        ? paidAmountRaw
        : typeof paidAmountRaw === "string"
          ? Number.parseFloat(paidAmountRaw)
          : Number.NaN;
    const dueAmountRaw = rec.due_amount ?? rec.dueAmount;
    const dueAmount =
      typeof dueAmountRaw === "number"
        ? dueAmountRaw
        : typeof dueAmountRaw === "string"
          ? Number.parseFloat(dueAmountRaw)
          : Number.NaN;
    const outstandingRaw = rec.outstanding_status ?? rec.outstandingStatus;
    const outstandingText =
      typeof outstandingRaw === "string" || typeof outstandingRaw === "number"
        ? String(outstandingRaw).trim().toLowerCase()
        : "";
    const transIdRaw = rec.trans_id ?? rec.transaction_id ?? rec.utr_number;
    const hasTransId = typeof transIdRaw === "string" && transIdRaw.trim().length > 0;
    const offlineDocRaw = rec.offline_tran_doc ?? rec.offline_transaction_document;
    const hasOfflineDoc = typeof offlineDocRaw === "string" && offlineDocRaw.trim().length > 0;

    return (
      paymentStatusText === "1" ||
      paymentStatusText === "paid" ||
      (paymentStatusText === "0" && approvalStatusText === "0" && outstandingText === "paid") ||
      (!Number.isNaN(paidAmount) && paidAmount > 0) ||
      (!Number.isNaN(dueAmount) && dueAmount === 0 && (outstandingText === "paid" || outstandingText === "0")) ||
      hasTransId ||
      hasOfflineDoc
    );
  });
}

function hasProformaReuploadAfterRejection(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const invoicesRaw = data.invoices;
  if (!Array.isArray(invoicesRaw)) return false;
  return invoicesRaw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
    const typeText =
      typeof typeRaw === "string" || typeof typeRaw === "number"
        ? String(typeRaw).trim().toLowerCase()
        : "";
    if (!(typeText.includes("proforma") || typeText.includes("pro forma"))) return false;

    const approvalRaw = rec.approval_status ?? rec.approvalStatus;
    const approvalText =
      typeof approvalRaw === "string" || typeof approvalRaw === "number"
        ? String(approvalRaw).trim().toLowerCase()
        : "";
    const labelRaw = rec.approval_status_label ?? rec.approvalStatusLabel;
    const labelText =
      typeof labelRaw === "string" || typeof labelRaw === "number"
        ? String(labelRaw).trim().toLowerCase()
        : "";
    const isNowPending = approvalText === "0" || approvalText === "pending" || labelText.includes("pending");
    if (!isNowPending) return false;

    const remarksRaw = rec.remarks ?? rec.rejected_remarks ?? rec.rejectedRemarks;
    const hasRejectionRemarks = typeof remarksRaw === "string" && remarksRaw.trim().length > 0;

    const offlineDocRaw = rec.offline_tran_doc ?? rec.offline_transaction_document;
    const hasOfflineDoc = typeof offlineDocRaw === "string" && offlineDocRaw.trim().length > 0;

    const offlineHistoryRaw = rec.offline_tran_doc_history ?? rec.offlineTranDocHistory;
    const offlineHistory = Array.isArray(offlineHistoryRaw) ? offlineHistoryRaw : [];
    const hasOfflineHistory = offlineHistory.length > 0;

    return hasRejectionRemarks && hasOfflineDoc && hasOfflineHistory;
  });
}

function hasApprovedProformaAfterReupload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const invoicesRaw = data.invoices;
  if (!Array.isArray(invoicesRaw)) return false;
  return invoicesRaw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
    const typeText =
      typeof typeRaw === "string" || typeof typeRaw === "number"
        ? String(typeRaw).trim().toLowerCase()
        : "";
    if (!(typeText.includes("proforma") || typeText.includes("pro forma"))) return false;

    const approvalRaw = rec.approval_status ?? rec.approvalStatus;
    const approvalText =
      typeof approvalRaw === "string" || typeof approvalRaw === "number"
        ? String(approvalRaw).trim().toLowerCase()
        : "";
    const labelRaw = rec.approval_status_label ?? rec.approvalStatusLabel;
    const labelText =
      typeof labelRaw === "string" || typeof labelRaw === "number"
        ? String(labelRaw).trim().toLowerCase()
        : "";
    const isApproved =
      approvalText === "1" ||
      approvalText === "approved" ||
      labelText.includes("approved");
    if (!isApproved) return false;

    const offlineHistoryRaw = rec.offline_tran_doc_history ?? rec.offlineTranDocHistory;
    const offlineHistory = Array.isArray(offlineHistoryRaw) ? offlineHistoryRaw : [];
    const invoiceHistoryRaw = rec.invoice_document_history ?? rec.invoiceDocumentHistory;
    const invoiceHistory = Array.isArray(invoiceHistoryRaw) ? invoiceHistoryRaw : [];
    return offlineHistory.length > 1 || invoiceHistory.length > 1;
  });
}

function hasAnyRejectedProformaApproval(
  financeInvoicesData: Record<string, unknown> | null,
  proformaApprovalData: Record<string, unknown> | null,
): boolean {
  if (financeInvoicesData && typeof financeInvoicesData === "object") {
    const invoicesRaw = financeInvoicesData.invoices;
    if (Array.isArray(invoicesRaw)) {
      for (const item of invoicesRaw) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
        const typeText =
          typeof typeRaw === "string" || typeof typeRaw === "number"
            ? String(typeRaw).trim().toLowerCase()
            : "";
        if (!(typeText.includes("proforma") || typeText.includes("pro forma"))) continue;
        const approvalRaw = rec.approval_status ?? rec.approvalStatus;
        const approvalText =
          typeof approvalRaw === "string" || typeof approvalRaw === "number"
            ? String(approvalRaw).trim().toLowerCase()
            : "";
        const labelRaw = rec.approval_status_label ?? rec.approvalStatusLabel;
        const labelText =
          typeof labelRaw === "string" || typeof labelRaw === "number"
            ? String(labelRaw).trim().toLowerCase()
            : "";
        if (approvalText === "2" || approvalText === "rejected" || labelText.includes("rejected")) {
          return true;
        }
      }
    }
  }

  const approvalStatusRaw =
    proformaApprovalData?.approval_status ?? proformaApprovalData?.approvalStatus;
  const approvalStatusText =
    typeof approvalStatusRaw === "string" || typeof approvalStatusRaw === "number"
      ? String(approvalStatusRaw).trim().toLowerCase()
      : "";
  const approvalLabelRaw =
    proformaApprovalData?.approval_status_label ?? proformaApprovalData?.approvalStatusLabel;
  const approvalLabelText =
    typeof approvalLabelRaw === "string" || typeof approvalLabelRaw === "number"
      ? String(approvalLabelRaw).trim().toLowerCase()
      : "";
  return (
    approvalStatusText === "2" ||
    approvalStatusText === "rejected" ||
    approvalLabelText.includes("rejected")
  );
}

function toEpochMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** Human-readable invoice phrase (e.g. "Proforma invoice") for latest/next step copy — avoids mislabelling the first cycle as "2nd". */
function capitalizeFinanceFlowLabel(label: string): string {
  const t = label.trim();
  if (!t) return "Invoice";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function getLatestFinanceInvoice(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const invoicesRaw = data.invoices;
  if (!Array.isArray(invoicesRaw) || invoicesRaw.length === 0) return null;
  const invoices = invoicesRaw.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  if (invoices.length === 0) return null;
  return invoices.reduce((latest, current) => {
    const latestTs = toEpochMs(latest.updated_at ?? latest.created_at);
    const currentTs = toEpochMs(current.updated_at ?? current.created_at);
    return currentTs > latestTs ? current : latest;
  });
}

function hasInvoiceDocument(invoice: Record<string, unknown> | null): boolean {
  if (!invoice) return false;
  const direct = invoice.invoice_document ?? invoice.document_url ?? invoice.file_url ?? invoice.url;
  if (typeof direct === "string" && direct.trim().length > 0) return true;
  const history = invoice.invoice_document_history;
  return Array.isArray(history) && history.length > 0;
}

function isInvoicePaymentSubmitted(invoice: Record<string, unknown> | null): boolean {
  if (!invoice) return false;
  const paymentStatusRaw = invoice.payment_status ?? invoice.paymentStatus;
  const paymentStatusText =
    typeof paymentStatusRaw === "string" || typeof paymentStatusRaw === "number"
      ? String(paymentStatusRaw).trim().toLowerCase()
      : "";
  if (paymentStatusText === "1" || paymentStatusText === "paid") return true;

  const paidAmountRaw = invoice.paid_amount ?? invoice.paidAmount;
  const paidAmount =
    typeof paidAmountRaw === "number"
      ? paidAmountRaw
      : typeof paidAmountRaw === "string"
        ? Number.parseFloat(paidAmountRaw)
        : Number.NaN;
  if (!Number.isNaN(paidAmount) && paidAmount > 0) return true;

  const dueAmountRaw = invoice.due_amount ?? invoice.dueAmount;
  const dueAmount =
    typeof dueAmountRaw === "number"
      ? dueAmountRaw
      : typeof dueAmountRaw === "string"
        ? Number.parseFloat(dueAmountRaw)
        : Number.NaN;
  if (!Number.isNaN(dueAmount) && dueAmount === 0) return true;

  const transIdRaw = invoice.trans_id ?? invoice.transaction_id ?? invoice.utr_number;
  const hasTransId = typeof transIdRaw === "string" && transIdRaw.trim().length > 0;
  const offlineDocRaw = invoice.offline_tran_doc ?? invoice.offline_transaction_document;
  const hasOfflineDoc = typeof offlineDocRaw === "string" && offlineDocRaw.trim().length > 0;
  return hasTransId || hasOfflineDoc;
}

function hasPrimaryDataFilledPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const root = unwrapPrimaryDataRoot(data);
  const hasMeaningfulPrimaryValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.some((item) => hasMeaningfulPrimaryValue(item));
    if (typeof value === "object") {
      const rec = value as Record<string, unknown>;
      return Object.values(rec).some((item) => hasMeaningfulPrimaryValue(item));
    }
    return false;
  };
  const savedByInfoType = root.saved_by_info_type;
  if (savedByInfoType && typeof savedByInfoType === "object" && !Array.isArray(savedByInfoType)) {
    const rec = savedByInfoType as Record<string, unknown>;
    const hasAnySectionRows = Object.values(rec).some((value) => hasMeaningfulPrimaryValue(value));
    if (hasAnySectionRows) return true;
  }
  const savedByDataId = root.saved_by_data_id;
  if (savedByDataId && typeof savedByDataId === "object" && !Array.isArray(savedByDataId)) {
    return Object.keys(savedByDataId as Record<string, unknown>).length > 0;
  }
  const tarContainers: unknown[] = [
    root.tar,
    root.targets,
    root.target,
    root.info_type_wise_data,
    root.infoTypeWiseData,
    root.data_by_info_type,
    root.dataByInfoType,
    root.primary_data_by_info_type,
    root.primaryDataByInfoType,
  ];
  for (const container of tarContainers) {
    if (!container || typeof container !== "object") continue;
    if (Array.isArray(container)) {
      if (container.some((item) => hasMeaningfulPrimaryValue(item))) return true;
      continue;
    }
    const rec = container as Record<string, unknown>;
    const tarValue = rec.tar ?? rec.targets ?? rec.target;
    if (hasMeaningfulPrimaryValue(tarValue)) {
      return true;
    }
    if (Object.keys(rec).length > 0 && (rec.info_type === "tar" || rec.infoType === "tar")) {
      return true;
    }
  }
  const directTar = root.tar ?? root.targets ?? root.target;
  if (hasMeaningfulPrimaryValue(directTar)) return true;
  const relevantReviews = getRelevantPrimarySectionReviews(root);
  if (relevantReviews.length > 0) return true;
  return false;
}

const EXCLUDED_PRIMARY_FLOW_SECTIONS = new Set(["gi", "ww"]);

/** CII-gated primary sections (GI/WW excluded). Aligns with CompanyProjectFlow PRIMARY_DATA_REVIEW_INFO_TYPES / getCiiGatedPrimaryDataReviewTypes. */
const CII_GATED_PRIMARY_DATA_SECTION_CODES: readonly string[] = [
  "ee",
  "wc",
  "re",
  "gge",
  "wm",
  "mcr",
  "gsc",
  "ps",
  "gin",
  "tar",
];

function lookupPrimarySectionReview(
  map: Record<string, unknown>,
  code: string,
): Record<string, unknown> | null {
  const lower = code.trim().toLowerCase();
  const raw =
    map[lower] ??
    map[code] ??
    map[code.toUpperCase()] ??
    map[lower.toUpperCase()];
  return reviewRecordFromValue(raw);
}

/** Map API review fields to a coarse status for “all submitted / all accepted” gates (CompanyProjectFlow normalizeSectionReviewStatus). */
function normalizePrimaryDataReviewStatusCanonical(value: unknown): string {
  const s = normalizePrimarySectionStatus(value);
  if (!s) return "";
  if (s === "accepted" || s === "1" || s === "approved" || (s.includes("accept") && !s.includes("not"))) return "accepted";
  if (s === "rejected" || s === "2" || s.includes("reject")) return "rejected";
  if (s === "under_review" || s === "pending" || s === "0" || s.includes("pending") || s.includes("review")) {
    return "under_review";
  }
  if (s === "submitted" || s.includes("submit")) return "submitted";
  return s;
}

function hasResubmittedAfterRejectionFlag(review: Record<string, unknown>): boolean {
  const resub = review.resubmitted_after_rejection ?? review.resubmittedAfterRejection;
  return resub === true || resub === "true" || resub === 1 || resub === "1";
}

type PrimaryDataQuickviewReviewStatus = {
  allSectionsSubmitted: boolean;
  allSectionsAccepted: boolean;
};

type FlowStepRow = { activity: string; status: string; responsibility: string };

function derivePrimaryDataWorkflowFlagsFromQuickviewSteps(
  quickView: Record<string, unknown>,
): PrimaryDataQuickviewReviewStatus {
  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined) ??
    {};
  const latestRaw = milestoneFlow.latest_step ?? milestoneFlow.latestStep ?? quickView.latest_step ?? quickView.latestStep;
  const nextRaw = milestoneFlow.next_step ?? milestoneFlow.nextStep ?? quickView.next_step ?? quickView.nextStep;
  const latest = toStepDetail(latestRaw);
  const next = toStepDetail(nextRaw);
  const latestActivity = normalizeQuickviewStepBlob(latest.activity);
  const nextActivity = normalizeQuickviewStepBlob(next.activity);
  const latestStatus = normalizeQuickviewStepBlob(latest.status);

  const uploadedByCompany =
    latestActivity.includes("uploaded all primary data") ||
    latestActivity.includes("primary data has been uploaded") ||
    latestActivity.includes("uploaded primary data") ||
    latestActivity.includes("primary data submitted") ||
    latestActivity.includes("primary data filled") ||
    nextActivity.includes("uploaded all primary data") ||
    nextActivity.includes("accept primary data") ||
    nextActivity.includes("cii need to accept primary data") ||
    nextActivity.includes("cii need to accept or reject primary data");

  const awaitingAdminAcceptance =
    nextActivity.includes("admin need to accept primary data") ||
    nextActivity.includes("cii need to accept primary data") ||
    nextActivity.includes("accept primary data") ||
    (uploadedByCompany &&
      (latestStatus.includes("complete") ||
        latestStatus.includes("done") ||
        latestStatus.includes("submit") ||
        nextActivity.includes("pending")));

  const acceptedByAdmin =
    latestActivity.includes("admin accepted primary data") ||
    latestActivity.includes("cii accepted primary data") ||
    (
      latestActivity.includes("primary data") &&
      (latestActivity.includes("accepted") || latestActivity.includes("approved")) &&
      (latestStatus.includes("complete") || latestStatus.includes("accept") || latestStatus.includes("approv"))
    ) ||
    nextActivity.includes("all assessment submittals to be uploaded");

  return {
    allSectionsSubmitted: uploadedByCompany || awaitingAdminAcceptance || acceptedByAdmin,
    allSectionsAccepted: acceptedByAdmin,
  };
}

function collectQuickviewActivityTexts(quickView: Record<string, unknown>): string[] {
  const out: string[] = [];
  const pushText = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      out.push(normalizeQuickviewStepBlob(value));
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      pushText(rec.activity ?? rec.name ?? rec.step ?? rec.title ?? rec.label ?? rec.step_name);
    }
  };

  for (const key of ["companies_activty", "companies_activity", "company_activity", "activities", "activity_log"]) {
    const rows = pickRecordList(quickView, [key]);
    for (const row of rows) {
      pushText(row);
    }
  }

  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined);
  if (milestoneFlow) {
    pushText(milestoneFlow.latest_step ?? milestoneFlow.latestStep);
    pushText(milestoneFlow.next_step ?? milestoneFlow.nextStep);
    const stepsRaw = milestoneFlow.steps ?? milestoneFlow.milestones ?? milestoneFlow.flow;
    if (Array.isArray(stepsRaw)) {
      for (const step of stepsRaw) {
        pushText(step);
      }
    }
  }

  return out;
}

function derivePrimaryDataWorkflowFlagsFromActivityLog(
  quickView: Record<string, unknown>,
): PrimaryDataQuickviewReviewStatus {
  const texts = collectQuickviewActivityTexts(quickView);
  let allSectionsSubmitted = false;
  let allSectionsAccepted = false;

  for (const text of texts) {
    if (
      text.includes("primary data section not accepted") ||
      (text.includes("primary data") &&
        (text.includes("not accepted") || text.includes("rejected")))
    ) {
      allSectionsSubmitted = true;
      continue;
    }
    if (
      text.includes("uploaded all primary data") ||
      text.includes("primary data has been uploaded") ||
      text.includes("primary data submitted") ||
      text.includes("primary data filled") ||
      text.includes("company uploaded all primary")
    ) {
      allSectionsSubmitted = true;
    }
    if (
      (text.includes("primary data") &&
        (text.includes("accepted") || text.includes("approved")) &&
        !text.includes("not accepted")) ||
      text.includes("cii accepted primary") ||
      text.includes("admin accepted primary")
    ) {
      allSectionsSubmitted = true;
      allSectionsAccepted = true;
    }
  }

  return { allSectionsSubmitted, allSectionsAccepted };
}

function buildQuickViewPrimaryDataSource(quickView: Record<string, unknown>): Record<string, unknown> {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const nested = quickView.primary_data ?? quickView.primaryData;
  const base: Record<string, unknown> = { ...quickView, ...profile, ...project, ...company };
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...base, ...(nested as Record<string, unknown>) };
  }
  return base;
}

/** Loose boolean parse — mirrors CompanyProjectFlow parseBoolLoose for workflow flags. */
function parsePrimaryDataBoolLoose(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return (
      t === "true" ||
      t === "yes" ||
      t === "y" ||
      t === "approved" ||
      t === "accepted" ||
      t === "complete" ||
      t === "completed"
    );
  }
  return false;
}

/**
 * Aggregate flags from primary-data snapshot/review payload (`data.*`), same keys as CompanyProjectFlow
 * derivePrimaryDataWorkflowSummary (primary_data_approved, all_primary_data_accepted, …).
 */
function derivePrimaryDataWorkflowFlagsFromPayload(source: Record<string, unknown> | null): PrimaryDataQuickviewReviewStatus {
  const empty: PrimaryDataQuickviewReviewStatus = { allSectionsSubmitted: false, allSectionsAccepted: false };
  if (!source || typeof source !== "object") return empty;
  const root = unwrapPrimaryDataRoot(source);

  const allSubmitted =
    parsePrimaryDataBoolLoose(root.primary_data_submitted) ||
    parsePrimaryDataBoolLoose(root.primaryDataSubmitted) ||
    parsePrimaryDataBoolLoose(root.primary_data_form_uploaded) ||
    parsePrimaryDataBoolLoose(root.primaryDataFormUploaded) ||
    parsePrimaryDataBoolLoose(root.all_primary_data_submitted) ||
    parsePrimaryDataBoolLoose(root.allPrimaryDataSubmitted);

  const allAccepted =
    parsePrimaryDataBoolLoose(root.primary_data_approved) ||
    parsePrimaryDataBoolLoose(root.primaryDataApproved) ||
    parsePrimaryDataBoolLoose(root.cii_primary_data_approved) ||
    parsePrimaryDataBoolLoose(root.ciiPrimaryDataApproved) ||
    parsePrimaryDataBoolLoose(root.all_primary_data_accepted) ||
    parsePrimaryDataBoolLoose(root.allPrimaryDataAccepted);

  return {
    allSectionsSubmitted: allSubmitted,
    allSectionsAccepted: allAccepted,
  };
}

function computeSectionBasedCiiGatedReviewStatus(
  primaryDataForm: Record<string, unknown> | null,
): PrimaryDataQuickviewReviewStatus {
  const empty: PrimaryDataQuickviewReviewStatus = { allSectionsSubmitted: false, allSectionsAccepted: false };
  if (!primaryDataForm || typeof primaryDataForm !== "object") return empty;
  const map = getPrimarySectionReviewsMap(primaryDataForm);
  const gated = CII_GATED_PRIMARY_DATA_SECTION_CODES;

  let allSectionsSubmitted = true;
  let allSectionsAccepted = true;

  for (const code of gated) {
    const rec = lookupPrimarySectionReview(map, code);
    if (!rec) {
      allSectionsSubmitted = false;
      allSectionsAccepted = false;
      continue;
    }
    const rawStatus =
      rec.status ??
      rec.review_status ??
      rec.section_status ??
      rec.reviewStatus ??
      rec.approval_status ??
      rec.approvalStatus;
    const canonical = normalizePrimaryDataReviewStatusCanonical(rawStatus);
    if (canonical === "") {
      allSectionsSubmitted = false;
      allSectionsAccepted = false;
      continue;
    }
    if (canonical !== "accepted") {
      allSectionsAccepted = false;
    }
    if (hasResubmittedAfterRejectionFlag(rec)) {
      allSectionsAccepted = false;
    }
  }

  return { allSectionsSubmitted, allSectionsAccepted };
}

/**
 * Merges: (1) API workflow flags on primary-data GET(s), (2) same flags on quickview/profile when backend mirrors them,
 * (3) per-section section_reviews for CII-gated codes. Any source marking “all accepted” wins for approval display.
 */
function computePrimaryDataOverallReviewStatus(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
): PrimaryDataQuickviewReviewStatus {
  const workflowFromPrimary = derivePrimaryDataWorkflowFlagsFromPayload(primaryDataForm);
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const workflowFromQuickView = derivePrimaryDataWorkflowFlagsFromPayload({
    ...quickView,
    ...profile,
    ...project,
    ...company,
  } as Record<string, unknown>);
  const workflowFromQuickviewSteps = derivePrimaryDataWorkflowFlagsFromQuickviewSteps(quickView);
  const workflowFromActivityLog = derivePrimaryDataWorkflowFlagsFromActivityLog(quickView);
  const sectionBased = computeSectionBasedCiiGatedReviewStatus(primaryDataForm);
  const quickViewPrimarySource = buildQuickViewPrimaryDataSource(quickView);
  const filledFromPrimaryForm = hasPrimaryDataFilledPayload(primaryDataForm);
  const filledFromQuickView = hasPrimaryDataFilledPayload(quickViewPrimarySource);

  return {
    allSectionsSubmitted:
      workflowFromPrimary.allSectionsSubmitted ||
      workflowFromQuickView.allSectionsSubmitted ||
      workflowFromQuickviewSteps.allSectionsSubmitted ||
      workflowFromActivityLog.allSectionsSubmitted ||
      sectionBased.allSectionsSubmitted ||
      filledFromPrimaryForm ||
      filledFromQuickView,
    allSectionsAccepted:
      workflowFromPrimary.allSectionsAccepted ||
      workflowFromQuickView.allSectionsAccepted ||
      workflowFromQuickviewSteps.allSectionsAccepted ||
      workflowFromActivityLog.allSectionsAccepted ||
      sectionBased.allSectionsAccepted,
  };
}

function facilitatorPrimaryDataSubmittedFlowSteps(
  status: PrimaryDataQuickviewReviewStatus,
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  primaryDataSourceForFlow: Record<string, unknown>,
  checklistDocumentsData: Record<string, unknown> | null,
  facilitatorAssessorAssignmentDone: boolean,
  facilitatorPreliminaryScoringDone: boolean,
  facilitatorFinalScoringSubmitted: boolean,
  facilitatorCertificateUploaded: boolean,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
  financeInvoicesData: Record<string, unknown> | null = null,
): { latest: FlowStepRow; next: FlowStepRow } | null {
  if (status.allSectionsAccepted) {
    return resolveFacilitatorPrimaryDataFlowSteps(
      primaryDataSourceForFlow,
      checklistDocumentsData,
      facilitatorAssessorAssignmentDone,
      facilitatorPreliminaryScoringDone,
      facilitatorFinalScoringSubmitted,
      facilitatorCertificateUploaded,
      facilitatorNotifications,
      projectId,
      financeInvoicesData,
    );
  }

  if (isPrimaryDataInResubmittedAwaitingReview(primaryDataForm, quickView, facilitatorNotifications, projectId)) {
    return facilitatorPrimaryDataResubmittedFlowSteps(
      primaryDataForm,
      quickView,
      facilitatorNotifications,
      projectId,
    );
  }

  if (hasAnyRejectedPrimaryDataSection(primaryDataForm, quickView, facilitatorNotifications, projectId)) {
    return facilitatorPrimaryDataRejectedFlowSteps(
      primaryDataForm,
      quickView,
      facilitatorNotifications,
      projectId,
    );
  }
  if (!status.allSectionsSubmitted && !status.allSectionsAccepted) {
    return null;
  }
  return {
    latest: {
      activity: "Company Uploaded All Primary Data",
      status: "Completed",
      responsibility: "Company",
    },
    next: {
      activity: "CII need to accept or reject primary data form",
      status: "Pending",
      responsibility: "CII",
    },
  };
}

function hasRejectedCiiGatedPrimarySection(primaryDataForm: Record<string, unknown> | null): boolean {
  if (!primaryDataForm || typeof primaryDataForm !== "object") return false;
  const map = getPrimarySectionReviewsMap(primaryDataForm);
  for (const code of CII_GATED_PRIMARY_DATA_SECTION_CODES) {
    const rec = lookupPrimarySectionReview(map, code);
    if (!rec) continue;
    if (isPrimarySectionRejected(rec)) return true;
  }
  for (const value of Object.values(map)) {
    const rec = reviewRecordFromValue(value);
    if (rec && isPrimarySectionRejected(rec)) return true;
  }
  return false;
}

function textIndicatesPrimaryReupload(text: string): boolean {
  return (
    text.includes("re-uploaded primary data") ||
    text.includes("reuploaded primary data") ||
    text.includes("re uploaded primary data") ||
    text.includes("company re-uploaded primary") ||
    text.includes("primary data re-uploaded") ||
    text.includes("primary data reuploaded") ||
    text.includes("primary data resubmitted") ||
    text.includes("resubmitted primary data")
  );
}

function quickviewTextsIndicatePrimaryDataRejected(quickView: Record<string, unknown>): boolean {
  if (quickviewLatestNextIndicatePrimaryDataRejected(quickView)) return true;
  return collectQuickviewActivityTexts(quickView).some((text) => {
    if (textIndicatesPrimaryReupload(text)) return false;
    if (!text.includes("primary data") && !text.includes("primary-data")) return false;
    return (
      text.includes("not accepted") ||
      text.includes("rejected") ||
      text.includes("primary data section not accepted") ||
      text.includes("primary data form has been rejected")
    );
  });
}

function quickviewTextsIndicatePrimaryDataResubmitted(quickView: Record<string, unknown>): boolean {
  const texts = collectQuickviewActivityTexts(quickView);
  return texts.some((text) => textIndicatesPrimaryReupload(text));
}

function quickviewLatestNextIndicatePrimaryDataRejected(quickView: Record<string, unknown>): boolean {
  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined) ??
    {};
  const latestRaw =
    milestoneFlow.latest_step ?? milestoneFlow.latestStep ?? quickView.latest_step ?? quickView.latestStep;
  const nextRaw = milestoneFlow.next_step ?? milestoneFlow.nextStep ?? quickView.next_step ?? quickView.nextStep;
  const latest = toStepDetail(latestRaw);
  const next = toStepDetail(nextRaw);
  const blobs = [latest.activity, latest.status, next.activity, next.status].map(normalizeQuickviewStepBlob);
  if (blobs.some((text) => textIndicatesPrimaryReupload(text))) return false;
  return blobs.some((text) => {
    if (text.includes("primary data section not accepted")) return true;
    if (!text.includes("primary data") && !text.includes("primary-data")) return false;
    return text.includes("not accepted") || text.includes("rejected");
  });
}

function quickviewLatestNextIndicatePrimaryDataResubmitted(quickView: Record<string, unknown>): boolean {
  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined) ??
    {};
  const latestRaw =
    milestoneFlow.latest_step ?? milestoneFlow.latestStep ?? quickView.latest_step ?? quickView.latestStep;
  const nextRaw = milestoneFlow.next_step ?? milestoneFlow.nextStep ?? quickView.next_step ?? quickView.nextStep;
  const latest = toStepDetail(latestRaw);
  const next = toStepDetail(nextRaw);
  const blobs = [latest.activity, latest.status, next.activity, next.status].map(normalizeQuickviewStepBlob);
  return blobs.some((text) => textIndicatesPrimaryReupload(text));
}

function quickviewPayloadIndicatesPrimaryDataRejected(quickView: Record<string, unknown>): boolean {
  const sources = [
    quickView,
    (quickView.profile as Record<string, unknown> | undefined) ?? {},
    (quickView.project as Record<string, unknown> | undefined) ?? {},
    (quickView.company as Record<string, unknown> | undefined) ?? {},
    buildQuickViewPrimaryDataSource(quickView),
  ];
  let foundRejection = false;
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const rec = source as Record<string, unknown>;
    const resubFlag =
      rec.primary_data_resubmitted ??
      rec.primaryDataResubmitted ??
      rec.primary_data_reuploaded ??
      rec.primaryDataReuploaded;
    if (resubFlag === true || resubFlag === 1 || resubFlag === "1" || resubFlag === "true") {
      return false;
    }
    const rejectedFlag =
      rec.primary_data_rejected ??
      rec.primaryDataRejected ??
      rec.has_primary_data_rejection ??
      rec.hasPrimaryDataRejection;
    if (
      rejectedFlag === true ||
      rejectedFlag === 1 ||
      rejectedFlag === "1" ||
      rejectedFlag === "true"
    ) {
      foundRejection = true;
    }
    const rejectedSections = rec.rejected_primary_sections ?? rec.rejectedPrimarySections;
    if (Array.isArray(rejectedSections) && rejectedSections.length > 0) foundRejection = true;
  }
  return foundRejection;
}

function findFirstRejectedPrimarySectionCode(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
): string {
  const sources = [
    primaryDataForm,
    buildQuickViewPrimaryDataSource(quickView),
  ].filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"));
  for (const source of sources) {
    const map = getPrimarySectionReviewsMap(source);
    for (const code of CII_GATED_PRIMARY_DATA_SECTION_CODES) {
      const rec = lookupPrimarySectionReview(map, code);
      if (rec && isPrimarySectionRejected(rec)) return code.toUpperCase();
    }
    for (const [key, value] of Object.entries(map)) {
      if (EXCLUDED_PRIMARY_FLOW_SECTIONS.has(key.toLowerCase())) continue;
      const rec = reviewRecordFromValue(value);
      if (rec && isPrimarySectionRejected(rec)) return key.toUpperCase();
    }
  }
  return "";
}

function resolvePrimaryDataRejectionSignal(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): { rejected: boolean; sectionCode: string } {
  const fromNotifications = parsePrimaryDataRejectionFromNotifications(
    facilitatorNotifications,
    projectId,
  );
  if (fromNotifications.rejected) return fromNotifications;

  if (
    hasRejectedCiiGatedPrimarySection(primaryDataForm) ||
    hasRejectedCiiGatedPrimarySection(buildQuickViewPrimaryDataSource(quickView)) ||
    quickviewTextsIndicatePrimaryDataRejected(quickView) ||
    quickviewPayloadIndicatesPrimaryDataRejected(quickView)
  ) {
    return {
      rejected: true,
      sectionCode: findFirstRejectedPrimarySectionCode(primaryDataForm, quickView),
    };
  }

  return { rejected: false, sectionCode: "" };
}

function hasAnyRejectedPrimaryDataSection(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[] = [],
  projectId = "",
): boolean {
  return resolvePrimaryDataRejectionSignal(
    primaryDataForm,
    quickView,
    facilitatorNotifications,
    projectId,
  ).rejected;
}

function facilitatorPrimaryDataRejectedFlowSteps(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[] = [],
  projectId = "",
): { latest: FlowStepRow; next: FlowStepRow } {
  const signal = resolvePrimaryDataRejectionSignal(
    primaryDataForm,
    quickView,
    facilitatorNotifications,
    projectId,
  );
  const sectionCode =
    signal.sectionCode || findFirstRejectedPrimarySectionCode(primaryDataForm, quickView);
  const sectionSuffix = sectionCode ? ` (${sectionCode.toLowerCase()})` : "";
  return {
    latest: {
      activity: sectionSuffix
        ? `Primary data has been rejected${sectionSuffix}`
        : "Primary data has been rejected",
      status: "Rejected",
      responsibility: "CII",
    },
    next: {
      activity: "Company needs to re-upload primary data form",
      status: "Pending",
      responsibility: "Company",
    },
  };
}

/**
 * Detects if any CII-gated section has been resubmitted after rejection
 * (API flag `resubmitted_after_rejection` on section_reviews).
 */
function hasResubmittedSectionInApiData(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
): boolean {
  const sources = [
    primaryDataForm,
    buildQuickViewPrimaryDataSource(quickView),
  ].filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"));
  for (const source of sources) {
    const map = getPrimarySectionReviewsMap(source);
    for (const code of CII_GATED_PRIMARY_DATA_SECTION_CODES) {
      const rec = lookupPrimarySectionReview(map, code);
      if (rec && hasResubmittedAfterRejectionFlag(rec)) return true;
    }
    for (const value of Object.values(map)) {
      const rec = reviewRecordFromValue(value);
      if (rec && hasResubmittedAfterRejectionFlag(rec)) return true;
    }
  }
  return false;
}

/**
 * Find section code that was resubmitted (for display text like "(tar)").
 */
function findResubmittedSectionCode(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): string {
  const fromNotif = parsePrimaryDataResubmissionFromNotifications(facilitatorNotifications, projectId);
  if (fromNotif.resubmitted && fromNotif.sectionCode) return fromNotif.sectionCode;

  const sources = [
    primaryDataForm,
    buildQuickViewPrimaryDataSource(quickView),
  ].filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"));
  for (const source of sources) {
    const map = getPrimarySectionReviewsMap(source);
    for (const code of CII_GATED_PRIMARY_DATA_SECTION_CODES) {
      const rec = lookupPrimarySectionReview(map, code);
      if (rec && hasResubmittedAfterRejectionFlag(rec)) return code.toUpperCase();
    }
  }
  return "";
}

/**
 * True when a section has status `under_review` after resubmission — CII hasn't decided yet.
 */
function hasSectionUnderReviewAfterResubmission(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
): boolean {
  const sources = [
    primaryDataForm,
    buildQuickViewPrimaryDataSource(quickView),
  ].filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"));
  for (const source of sources) {
    const map = getPrimarySectionReviewsMap(source);
    for (const code of CII_GATED_PRIMARY_DATA_SECTION_CODES) {
      const rec = lookupPrimarySectionReview(map, code);
      if (!rec) continue;
      if (!hasResubmittedAfterRejectionFlag(rec)) continue;
      const canonical = normalizePrimaryDataReviewStatusCanonical(
        rec.status ?? rec.review_status ?? rec.section_status ?? rec.reviewStatus ??
        rec.approval_status ?? rec.approvalStatus,
      );
      if (canonical === "under_review" || canonical === "submitted" || canonical === "") return true;
    }
  }
  return false;
}

/**
 * Comprehensive check: has the company re-uploaded primary data after a rejection,
 * and CII has NOT yet accepted or re-rejected it?
 * Sources: notification events, API section flags, quickview text.
 */
function isPrimaryDataInResubmittedAwaitingReview(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): boolean {
  const notifState = parsePrimaryDataLatestStateFromNotifications(facilitatorNotifications, projectId);
  if (notifState.state === "resubmitted") return true;

  if (quickviewLatestNextIndicatePrimaryDataResubmitted(quickView)) return true;
  if (quickviewTextsIndicatePrimaryDataResubmitted(quickView)) return true;

  if (hasResubmittedSectionInApiData(primaryDataForm, quickView)) {
    if (hasSectionUnderReviewAfterResubmission(primaryDataForm, quickView)) return true;
    const status = computeSectionBasedCiiGatedReviewStatus(primaryDataForm);
    if (!status.allSectionsAccepted) return true;
  }

  return false;
}

/**
 * Flow steps when company has re-uploaded primary data after rejection and CII hasn't decided yet.
 */
function facilitatorPrimaryDataResubmittedFlowSteps(
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): { latest: FlowStepRow; next: FlowStepRow } {
  const sectionCode = findResubmittedSectionCode(primaryDataForm, quickView, facilitatorNotifications, projectId);
  const sectionSuffix = sectionCode ? ` (${sectionCode.toLowerCase()})` : "";
  return {
    latest: {
      activity: `Company Re-Uploaded Primary Data${sectionSuffix}`,
      status: "Completed",
      responsibility: "Company",
    },
    next: {
      activity: "CII needs to accept or reject re-uploaded primary data",
      status: "Pending",
      responsibility: "CII",
    },
  };
}

function normalizeQuickviewStepBlob(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function combinedFlowActivitiesInPrimaryDataLane(latestActivity: string, nextActivity: string): boolean {
  const combined = normalizeQuickviewStepBlob(`${latestActivity} ${nextActivity}`);
  return (
    combined.includes("primary data") ||
    combined.includes("primary-data") ||
    combined.includes("upload primary") ||
    combined.includes("accept primary") ||
    combined.includes("reject primary")
  );
}

/** Do not override once flow copy has moved past the primary-data lane (CompanyProjectFlow guard). */
function combinedFlowActivitiesPastPrimaryData(latestActivity: string, nextActivity: string): boolean {
  const combined = normalizeQuickviewStepBlob(`${latestActivity} ${nextActivity}`);
  return (
    combined.includes("assessor") ||
    combined.includes("certificate") ||
    combined.includes("recertification") ||
    combined.includes("sustenance")
  );
}

/** Facilitator quick view: later workflow rows (checklist, scoring, finance, feedback) should not be replaced by primary-data completion copy. */
function facilitatorQuickviewPastPrimaryDataLane(latestActivity: string, nextActivity: string): boolean {
  const c = normalizeQuickviewStepBlob(`${latestActivity} ${nextActivity}`);
  if (c.includes("all assessment submittals to be uploaded")) return false;
  return (
    c.includes("checklist") ||
    c.includes("assessment submittals completed") ||
    c.includes("assigning assessor") ||
    c.includes("assessor assignment") ||
    c.includes("preliminary scoring") ||
    c.includes("final scoring") ||
    c.includes("upload certificate") ||
    c.includes("certificate has been issued") ||
    c.includes("2nd proforma") ||
    c.includes("plaque") ||
    c.includes("feedback") ||
    c.includes("proforma invoice uploaded") ||
    c.includes("supporting document") ||
    c.includes("invoice payment") ||
    c.includes("payment done by consultant") ||
    c.includes("payment has been rejected") ||
    c.includes("payment re-upload") ||
    c.includes("re-uploaded supporting") ||
    c.includes("launch and training") ||
    c.includes("project coordinator assigned") ||
    c.includes("project code submitted") ||
    c.includes("po number has been uploaded") ||
    c.includes("cii will upload proforma") ||
    c.includes("consultant to upload supporting") ||
    c.includes("tax invoice") ||
    c.includes("proforma payment")
  );
}

/**
 * Mirrors CompanyProjectFlow `applyPrimaryDataQuickviewCompletionOverride`: hard-coded latest/next when
 * primary-data lane + all CII-gated sections accepted (or submitted-but-pending-admin).
 */
function applyPrimaryDataQuickviewCompletionOverride(
  flowSteps: {
    latest: { activity: string; status: string; responsibility: string };
    next: { activity: string; status: string; responsibility: string };
  },
  status: PrimaryDataQuickviewReviewStatus,
  isFacilitatorProject: boolean,
  primaryDataForm: Record<string, unknown> | null,
  quickView: Record<string, unknown>,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
  checklistDocumentsData: Record<string, unknown> | null = null,
  facilitatorAssessorAssignmentDone = false,
  facilitatorPreliminaryScoringDone = false,
  facilitatorFinalScoringSubmitted = false,
  facilitatorCertificateUploaded = false,
  financeInvoicesData: Record<string, unknown> | null = null,
): {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
} {
  if (isFacilitatorProject && status.allSectionsAccepted) {
    const sourceForFlow: Record<string, unknown> = primaryDataForm ?? buildQuickViewPrimaryDataSource(quickView);
    return resolveFacilitatorPrimaryDataFlowSteps(
      sourceForFlow,
      checklistDocumentsData,
      facilitatorAssessorAssignmentDone,
      facilitatorPreliminaryScoringDone,
      facilitatorFinalScoringSubmitted,
      facilitatorCertificateUploaded,
      facilitatorNotifications,
      projectId,
      financeInvoicesData,
    );
  }
  if (
    isFacilitatorProject &&
    isPrimaryDataInResubmittedAwaitingReview(primaryDataForm, quickView, facilitatorNotifications, projectId)
  ) {
    return facilitatorPrimaryDataResubmittedFlowSteps(
      primaryDataForm,
      quickView,
      facilitatorNotifications,
      projectId,
    );
  }
  if (
    isFacilitatorProject &&
    hasAnyRejectedPrimaryDataSection(primaryDataForm, quickView, facilitatorNotifications, projectId)
  ) {
    return facilitatorPrimaryDataRejectedFlowSteps(
      primaryDataForm,
      quickView,
      facilitatorNotifications,
      projectId,
    );
  }
  if (isFacilitatorProject && status.allSectionsSubmitted) {
    return {
      latest: {
        activity: "Company Uploaded All Primary Data",
        status: "Completed",
        responsibility: "Company",
      },
      next: {
        activity: "CII need to accept or reject primary data form",
        status: "Pending",
        responsibility: "CII",
      },
    };
  }

  const la = flowSteps.latest.activity;
  const na = flowSteps.next.activity;
  const textInPrimaryLane = combinedFlowActivitiesInPrimaryDataLane(la, na);
  const inPrimaryLane = isFacilitatorProject
    ? textInPrimaryLane ||
      (
        (status.allSectionsSubmitted || status.allSectionsAccepted) &&
        !facilitatorQuickviewPastPrimaryDataLane(la, na)
      )
    : textInPrimaryLane || status.allSectionsSubmitted || status.allSectionsAccepted;
  if (!inPrimaryLane) return flowSteps;
  if (combinedFlowActivitiesPastPrimaryData(la, na) && !status.allSectionsAccepted) return flowSteps;

  /** Aggregate approval flags / all sections accepted — same priority as CompanyProjectFlow “done” line. */
  if (status.allSectionsAccepted) {
    return {
      latest: {
        activity: "Admin Accepted Primary Data Form",
        status: "Completed",
        responsibility: "CII",
      },
      next: {
        activity: isFacilitatorProject
          ? "Assessment submittals need to be done by company"
          : "All Assessment Submittals to be uploaded",
        status: "Pending",
        responsibility: "Company",
      },
    };
  }
  if (status.allSectionsSubmitted && !status.allSectionsAccepted) {
    return {
      latest: {
        activity: "Company Uploaded All Primary Data",
        status: "Completed",
        responsibility: "Company",
      },
      next: {
        activity: "Admin Need to Accept Primary Data",
        status: "Pending",
        responsibility: "Admin",
      },
    };
  }
  return flowSteps;
}

function unwrapPrimaryDataRoot(data: Record<string, unknown>): Record<string, unknown> {
  const nested = data.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...data, ...(nested as Record<string, unknown>) };
  }
  return data;
}

/**
 * Merges GET .../primary-data and GET .../primary-data/review so workflow flags and section_reviews
 * are not dropped when both endpoints return data (mirrors CompanyProjectFlow merged review payload).
 */
function mergePrimaryDataEndpointPayloads(
  primary: Record<string, unknown> | null,
  review: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!primary && !review) return null;
  if (!primary) return review;
  if (!review) return primary;

  const a = unwrapPrimaryDataRoot(primary as Record<string, unknown>);
  const b = unwrapPrimaryDataRoot(review as Record<string, unknown>);
  const merged: Record<string, unknown> = { ...a, ...b };

  const mergeSectionReviewArrays = (key: string) => {
    const va = a[key];
    const vb = b[key];
    if (!Array.isArray(va) || !Array.isArray(vb)) return;
    const bySection = new Map<string, Record<string, unknown>>();
    const sectionKeyOf = (item: Record<string, unknown>): string => {
      const raw = item.section_key ?? item.info_type ?? item.infoType ?? item.key;
      return typeof raw === "string" ? raw.trim().toLowerCase() : "";
    };
    for (const item of va) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const k = sectionKeyOf(rec);
      if (k) bySection.set(k, { ...rec });
    }
    for (const item of vb) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const k = sectionKeyOf(rec);
      if (!k) continue;
      const prev = bySection.get(k);
      bySection.set(k, prev ? { ...prev, ...rec } : { ...rec });
    }
    merged[key] = [...bySection.values()];
  };

  mergeSectionReviewArrays("section_reviews");
  mergeSectionReviewArrays("sectionReviews");
  mergeSectionReviewArrays("primary_data_section_reviews");

  return merged;
}

function reviewRecordFromValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    return { status: value };
  }
  return null;
}

function getPrimarySectionReviewsMap(data: Record<string, unknown>): Record<string, unknown> {
  const root = unwrapPrimaryDataRoot(data);
  const map: Record<string, unknown> = {};
  const ingest = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const rec = item as Record<string, unknown>;
        const keyRaw = rec.section_key ?? rec.info_type ?? rec.infoType ?? rec.key;
        if (typeof keyRaw === "string" && keyRaw.trim().length > 0) {
          map[keyRaw.trim().toLowerCase()] = rec;
        }
      }
      return;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const rec = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      const review = reviewRecordFromValue(value);
      if (review) map[key.trim().toLowerCase()] = review;
    }
  };

  ingest(root.section_reviews ?? root.sectionReviews ?? root.primary_data_section_reviews);
  ingest(root.reviews_by_info_type ?? root.reviewsByInfoType ?? root.primary_data_reviews);
  ingest(root.primary_data_section_reviews_map);

  return map;
}

function normalizePrimarySectionStatus(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim().toLowerCase();
  }
  return "";
}

function isPrimarySectionRejected(review: Record<string, unknown>): boolean {
  const resub = review.resubmitted_after_rejection ?? review.resubmittedAfterRejection;
  const alreadyResubmitted = resub === true || resub === "true" || resub === 1 || resub === "1";
  if (alreadyResubmitted) return false;

  const isAcceptedRaw = review.is_accepted ?? review.isAccepted ?? review.accepted;
  if (isAcceptedRaw === false || isAcceptedRaw === 0 || isAcceptedRaw === "0" || isAcceptedRaw === "false") {
    return true;
  }
  const notAcceptedRaw = review.not_accepted ?? review.notAccepted ?? review.is_not_accepted;
  if (notAcceptedRaw === true || notAcceptedRaw === 1 || notAcceptedRaw === "1" || notAcceptedRaw === "true") {
    return true;
  }

  const statusText = normalizePrimarySectionStatus(
    review.status ??
      review.review_status ??
      review.section_status ??
      review.reviewStatus ??
      review.approval_status ??
      review.approvalStatus ??
      review.review_status_label ??
      review.reviewStatusLabel,
  );
  if (!statusText) return false;
  if (statusText === "2" || statusText === "rejected") return true;
  if (statusText.includes("reject")) return true;
  if (statusText.includes("not accepted")) return true;
  if (statusText.includes("not_accepted")) return true;
  if (statusText.includes("not approved")) return true;
  return false;
}

function isPrimarySectionAccepted(review: Record<string, unknown>): boolean {
  const raw =
    review.status ??
    review.review_status ??
    review.section_status ??
    review.reviewStatus ??
    review.approval_status ??
    review.approvalStatus;
  return normalizePrimaryDataReviewStatusCanonical(raw) === "accepted";
}

function getRelevantPrimarySectionReviews(data: Record<string, unknown>): Record<string, unknown>[] {
  const map = getPrimarySectionReviewsMap(data);
  const out: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (EXCLUDED_PRIMARY_FLOW_SECTIONS.has(key.toLowerCase())) continue;
    const rec = reviewRecordFromValue(value);
    if (rec) out.push(rec);
  }
  return out;
}

/** True when `section_reviews` has GI/WW-excluded rows — company has entered the CII review lane (not draft-only payload). */
function hasRelevantPrimaryDataSectionReviewsStarted(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  return getRelevantPrimarySectionReviews(data).length > 0;
}

function hasAllChecklistDocumentsUploaded(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const rows = pickRecordList(data, ["data", "items", "rows", "documents", "result"]);
  if (rows.length === 0) return false;
  return rows.every((row) => {
    const docPath = row.document_path ?? row.documentPath;
    const docUrl = row.document_url ?? row.documentUrl;
    const pathText = typeof docPath === "string" ? docPath.trim() : "";
    const urlText = typeof docUrl === "string" ? docUrl.trim() : "";
    return pathText.length > 0 || urlText.length > 0;
  });
}

function hasRejectedChecklistDocuments(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const rows = pickRecordList(data, ["data", "items", "rows", "documents", "result"]);
  if (rows.length === 0) return false;
  return rows.some((row) => {
    const statusRaw = row.status ?? row.document_status ?? row.review_status ?? row.approval_status;
    const statusText =
      typeof statusRaw === "string" || typeof statusRaw === "number"
        ? String(statusRaw).trim().toLowerCase()
        : "";
    return statusText === "rejected" || statusText === "2" || statusText.includes("reject");
  });
}

function hasAllChecklistDocumentsAccepted(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const rows = pickRecordList(data, ["data", "items", "rows", "documents", "result"]);
  if (rows.length === 0) return false;
  return rows.every((row) => {
    const statusRaw = row.status ?? row.document_status ?? row.review_status ?? row.approval_status;
    const statusText =
      typeof statusRaw === "string" || typeof statusRaw === "number"
        ? String(statusRaw).trim().toLowerCase()
        : "";
    return (
      statusText === "accepted" ||
      statusText === "approved" ||
      statusText === "1" ||
      statusText.includes("accept") ||
      statusText.includes("approv")
    );
  });
}

function resolveFacilitatorPrimaryDataFlowSteps(
  primaryDataForm: Record<string, unknown>,
  checklistDocumentsData: Record<string, unknown> | null,
  facilitatorAssessorAssignmentDone: boolean,
  facilitatorPreliminaryScoringDone: boolean,
  facilitatorFinalScoringSubmitted: boolean,
  facilitatorCertificateUploaded: boolean,
  facilitatorNotifications: PanelNotification[] = [],
  projectId = "",
  financeInvoicesData: Record<string, unknown> | null = null,
): {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
} {
  const relevant = getRelevantPrimarySectionReviews(primaryDataForm);

  const hasResubmittedSection = relevant.some((r) => hasResubmittedAfterRejectionFlag(r));
  const hasStillRejected = relevant.some((r) => isPrimarySectionRejected(r));

  if (hasStillRejected && !hasResubmittedSection) {
    return {
      latest: {
        activity: "CII rejected the primary data form",
        status: "Rejected",
        responsibility: "CII",
      },
      next: {
        activity: "Company needs to re-upload primary data form",
        status: "Pending",
        responsibility: "Company",
      },
    };
  }

  const checklistNotif = parseChecklistLatestStateFromNotifications(facilitatorNotifications, projectId);
  const allAccepted = relevant.length === 0 || relevant.every((r) => isPrimarySectionAccepted(r));
  if (allAccepted) {
    const allChecklistAccepted = hasAllChecklistDocumentsAccepted(checklistDocumentsData);
    const checklistRejectedFromApi = hasRejectedChecklistDocuments(checklistDocumentsData);
    const checklistRejected = checklistRejectedFromApi || checklistNotif.state === "rejected";
    const checklistUploadedFromApi = hasAllChecklistDocumentsUploaded(checklistDocumentsData);
    const checklistUploaded = checklistUploadedFromApi || checklistNotif.state === "uploaded";

    if (!allChecklistAccepted && checklistRejected) {
      const remarksSuffix = checklistNotif.remarks ? ` — Remarks: ${checklistNotif.remarks}` : "";
      return {
        latest: {
          activity: `Assessment checklist has been rejected by CII${remarksSuffix}`,
          status: "Rejected",
          responsibility: "CII",
        },
        next: {
          activity: "Company needs to re-upload assessment checklist documents",
          status: "Pending",
          responsibility: "Company",
        },
      };
    }
    const checklistAccepted = allChecklistAccepted || checklistNotif.state === "accepted";
    if (checklistAccepted && (checklistUploaded || checklistUploadedFromApi)) {
      if (
        facilitatorAssessorAssignmentDone &&
        facilitatorPreliminaryScoringDone &&
        facilitatorFinalScoringSubmitted
        ) {
          if (facilitatorCertificateUploaded) {
            const proformaNotif = parse2ndProformaLatestStateFromNotifications(facilitatorNotifications, projectId);
            const latestInvoiceAfterCert = getLatestFinanceInvoice(financeInvoicesData);
            const has2ndProformaFromData = latestInvoiceAfterCert && hasInvoiceDocument(latestInvoiceAfterCert) && !isInvoicePaymentSubmitted(latestInvoiceAfterCert);
            const remarksSuffix = proformaNotif.remarks ? ` — Remarks: ${proformaNotif.remarks}` : "";

            if (proformaNotif.state === "feedback_uploaded") {
              return {
                latest: {
                  activity: "Feedback document uploaded by CII",
                  status: "Completed",
                  responsibility: "CII",
                },
                next: {
                  activity: "Certificate has been issued",
                  status: "Completed",
                  responsibility: "CII",
                },
              };
            }
            if (proformaNotif.state === "plaque_dispatched") {
              return {
                latest: {
                  activity: "Plaque and certificate PR is done",
                  status: "Completed",
                  responsibility: "CII",
                },
                next: {
                  activity: "Feedback document need to be uploaded by CII",
                  status: "Pending",
                  responsibility: "CII",
                },
              };
            }
            if (proformaNotif.state === "supporting_docs_approved") {
              return {
                latest: {
                  activity: "Supporting documents approved by CII",
                  status: "Approved",
                  responsibility: "CII",
                },
                next: {
                  activity: "Plaque and PQ need to be raised by CII",
                  status: "Pending",
                  responsibility: "CII",
                },
              };
            }
            if (proformaNotif.state === "supporting_docs_reuploaded") {
              return {
                latest: {
                  activity: "Facilitator re-uploaded supporting documents",
                  status: "Completed",
                  responsibility: "Facilitator",
                },
                next: {
                  activity: "CII needs to review re-uploaded supporting documents",
                  status: "Pending",
                  responsibility: "CII",
                },
              };
            }
            if (proformaNotif.state === "supporting_docs_rejected") {
              return {
                latest: {
                  activity: `Supporting documents rejected by CII${remarksSuffix}`,
                  status: "Rejected",
                  responsibility: "CII",
                },
                next: {
                  activity: "Facilitator needs to re-upload supporting documents",
                  status: "Pending",
                  responsibility: "Facilitator",
                },
              };
            }
            if (proformaNotif.state === "supporting_docs_awaiting_review" || proformaNotif.state === "supporting_docs_uploaded") {
              return {
                latest: {
                  activity: "Supporting documents uploaded by Facilitator",
                  status: "Completed",
                  responsibility: "Facilitator",
                },
                next: {
                  activity: "CII needs to review supporting documents",
                  status: "Pending",
                  responsibility: "CII",
                },
              };
            }
            if (has2ndProformaFromData || proformaNotif.state === "2nd_proforma_uploaded") {
              return {
                latest: {
                  activity: "2nd proforma invoice is done",
                  status: "Completed",
                  responsibility: "CII",
                },
                next: {
                  activity: "Supporting documents need to be uploaded by Facilitator",
                  status: "Pending",
                  responsibility: "Facilitator",
                },
              };
            }
            return {
              latest: {
                activity: "Upload certificate is done",
                status: "Completed",
                responsibility: "CII",
              },
              next: {
                activity: "2nd proforma need to be uploaded",
                status: "Pending",
                responsibility: "CII",
              },
            };
          }
          return {
            latest: {
              activity: "Final scoring submitted by assessor",
              status: "Completed",
              responsibility: "Assessor",
            },
            next: {
              activity: "Upload certificate is pending by CII",
              status: "Pending",
              responsibility: "CII",
            },
          };
        }
        if (facilitatorAssessorAssignmentDone && facilitatorPreliminaryScoringDone) {
          return {
            latest: {
              activity: "Preliminary scoring is completed",
              status: "Completed",
              responsibility: "CII",
            },
            next: {
              activity: "Final scoring by assessor",
              status: "Pending",
              responsibility: "Assessor",
            },
          };
        }
        if (facilitatorAssessorAssignmentDone) {
          return {
            latest: {
              activity: "Assessor assignment is done",
              status: "Completed",
              responsibility: "CII",
            },
            next: {
              activity: "Preliminary Scoring to be submitted by CII",
              status: "Pending",
              responsibility: "CII",
            },
          };
        }
        return {
          latest: {
            activity: "Assessment submittals completed",
            status: "Completed",
            responsibility: "Consultant",
          },
          next: {
            activity: "Assigning assessor by CII",
            status: "Pending",
            responsibility: "CII",
          },
        };
      }
    if (checklistUploaded || checklistUploadedFromApi) {
      return {
        latest: {
          activity: "Assessment checklist documents uploaded by company",
          status: "Completed",
          responsibility: "Company",
        },
        next: {
          activity: "CII needs to approve or reject the assessment submittals",
          status: "Pending",
          responsibility: "CII",
        },
      };
    }
    return {
      latest: {
        activity: "CII accepted the primary data form",
        status: "Accepted",
        responsibility: "CII",
      },
      next: {
        activity: "Assessment submittals need to be done by company",
        status: "Pending",
        responsibility: "Company",
      },
    };
  }

  return {
    latest: {
      activity: "Primary data filled by company",
      status: "Completed",
      responsibility: "Company",
    },
    next: {
      activity: "CII need to accept or reject primary data form",
      status: "Pending",
      responsibility: "CII",
    },
  };
}

/** Facilitator CI flow — launch & training is done by the facilitator, not CII/consultant. */
function isLaunchTrainingActivityText(activity: string): boolean {
  const text = activity.trim().toLowerCase();
  return (
    text.includes("launch") &&
    (text.includes("training") || text.includes("handholding") || text.includes("program"))
  );
}

function applyFacilitatorLaunchTrainingResponsibilityOverride(flowSteps: {
  latest: FlowStepRow;
  next: FlowStepRow;
}): { latest: FlowStepRow; next: FlowStepRow } {
  const patch = (row: FlowStepRow): FlowStepRow => {
    if (!isLaunchTrainingActivityText(row.activity)) return row;
    return { ...row, responsibility: "Facilitator" };
  };
  return { latest: patch(flowSteps.latest), next: patch(flowSteps.next) };
}

/** Facilitator only — plaque / feedback / cert issued are end-stage; do not jump here from finance shortcuts. */
function isFacilitatorLateStageStepText(activity: string): boolean {
  const text = activity.trim().toLowerCase();
  return (
    text.includes("plaque") ||
    text.includes(" pq") ||
    text.startsWith("pq ") ||
    text.includes("feedback report") ||
    text.includes("certificate has been issued") ||
    text.includes("certificate issued")
  );
}

function tryFacilitatorPrimaryDataLaneSteps(
  isFacilitatorProject: boolean,
  hasPrimaryDataReadyForFacilitatorFlow: boolean,
  primaryDataSourceForFlow: Record<string, unknown>,
  checklistDocumentsData: Record<string, unknown> | null,
  facilitatorAssessorAssignmentDone: boolean,
  facilitatorPreliminaryScoringDone: boolean,
  facilitatorFinalScoringSubmitted: boolean,
  facilitatorCertificateUploaded: boolean,
  facilitatorNotifications: PanelNotification[] = [],
  projectId = "",
  financeInvoicesData: Record<string, unknown> | null = null,
): {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
} | null {
  if (!isFacilitatorProject || !hasPrimaryDataReadyForFacilitatorFlow) {
    return null;
  }
  const steps = resolveFacilitatorPrimaryDataFlowSteps(
    primaryDataSourceForFlow,
    checklistDocumentsData,
    facilitatorAssessorAssignmentDone,
    facilitatorPreliminaryScoringDone,
    facilitatorFinalScoringSubmitted,
    facilitatorCertificateUploaded,
    facilitatorNotifications,
    projectId,
    financeInvoicesData,
  );
  if (isFacilitatorLateStageStepText(steps.next.activity)) {
    return null;
  }
  return steps;
}

function detectFacilitatorProject(
  quickView: Record<string, unknown>,
  pathname: string,
): boolean {
  const pathText = pathname.trim().toLowerCase();
  if (pathText.includes("/facilitator/")) return true;

  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const processTypeRaw =
    profile.process_type ??
    profile.processType ??
    project.process_type ??
    project.processType ??
    company.process_type ??
    company.processType ??
    quickView.process_type ??
    quickView.processType;
  const processTypeText =
    typeof processTypeRaw === "string" || typeof processTypeRaw === "number"
      ? String(processTypeRaw).trim().toLowerCase()
      : "";
  return processTypeText === "f";
}

function hasCoordinatorAssignedPayload(
  quickView: Record<string, unknown>,
  assignments: Record<string, unknown>,
): boolean {
  const assignmentRoot = pickFirstRecord(assignments, [
    "assignment_details",
    "assignment",
    "data",
    "result",
  ]);
  const mergedAssignments = { ...assignments, ...assignmentRoot } as Record<string, unknown>;
  const coordinatorFromAssignments = pickFirstRecord(mergedAssignments, [
    "coordinators",
    "coordinator",
    "coordinator_details",
    "coordinator_detail",
    "assigned_coordinator",
  ]);
  const quickviewCoordinatorContainer = pickFirstRecord(quickView, ["companies_coordinator"]);
  const coordinatorFromQuickview = pickFirstRecord(quickviewCoordinatorContainer, [
    "Coordinator_Detail",
    "coordinator_detail",
    "coordinator",
  ]);
  const coordinator =
    Object.keys(coordinatorFromAssignments).length > 0
      ? coordinatorFromAssignments
      : coordinatorFromQuickview;

  const idRaw = coordinator.id ?? coordinator.coordinator_id ?? coordinator.coordinatorId;
  const hasId =
    (typeof idRaw === "string" && idRaw.trim().length > 0) ||
    (typeof idRaw === "number" && String(idRaw).trim().length > 0);
  const hasEmail = typeof coordinator.email === "string" && coordinator.email.trim().length > 0;
  const hasName =
    (typeof coordinator.name === "string" && coordinator.name.trim().length > 0) ||
    (typeof coordinator.coordinator_name === "string" && coordinator.coordinator_name.trim().length > 0);
  return hasId || hasEmail || hasName;
}

function hasPlaqueAndPrRaised(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const hasValue = (value: unknown): boolean => {
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return String(value).trim().length > 0;
    return false;
  };
  const prNo = profile.pr_no ?? quickView.pr_no;
  const pNo = profile.p_no ?? quickView.p_no;
  const prAmount = profile.pr_amount ?? quickView.pr_amount;
  const pAmount = profile.p_amount ?? quickView.p_amount;
  const prDate = profile.pr_date ?? quickView.pr_date;
  const pDate = profile.p_date ?? quickView.p_date;
  return hasValue(prNo) && hasValue(pNo) && hasValue(prAmount) && hasValue(pAmount) && hasValue(prDate) && hasValue(pDate);
}

function resolveFacilitatorStageActivityId(quickView: Record<string, unknown>): number | null {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const milestoneFlow = (quickView.milestone_flow as Record<string, unknown> | undefined) ?? {};
  const candidates: unknown[] = [
    profile.current_activity_id,
    profile.currentActivityId,
    profile.next_activities_id,
    profile.nextActivitiesId,
    quickView.current_activity_id,
    quickView.currentActivityId,
    milestoneFlow.current_flow,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function isPureFacilitatorProject(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const assessmentRaw =
    profile.assessment ??
    profile.assessment_type ??
    profile.assessmentType ??
    project.assessment ??
    project.assessment_type ??
    company.assessment ??
    company.assessment_type ??
    quickView.assessment ??
    quickView.assessment_type;
  const processTypeRaw =
    profile.process_type ??
    profile.processType ??
    project.process_type ??
    project.processType ??
    company.process_type ??
    company.processType ??
    quickView.process_type ??
    quickView.processType;
  const assessmentText =
    typeof assessmentRaw === "string" || typeof assessmentRaw === "number"
      ? String(assessmentRaw).trim().toLowerCase()
      : "";
  const processTypeText =
    typeof processTypeRaw === "string" || typeof processTypeRaw === "number"
      ? String(processTypeRaw).trim().toLowerCase()
      : "";
  // Hybrid CI+Facilitator projects are marked as process_type "f".
  if (processTypeText === "f") return false;
  return assessmentText.includes("facilitator");
}

function hasFeedbackReportUploaded(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const hasStr = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
  if (hasStr(profile.feedback_document ?? profile.feedbackDocument)) return true;
  if (hasStr(profile.feedback_document_url ?? profile.feedbackDocumentUrl)) return true;
  if (hasStr(quickView.feedback_document ?? quickView.feedback_document_url)) return true;
  const data = quickView.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (hasStr(d.feedback_document_url ?? d.feedbackDocumentUrl)) return true;
  }
  return false;
}

function isCiiAssignsFacilitatorFlow(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const milestoneFlow = (quickView.milestone_flow as Record<string, unknown> | undefined) ?? {};
  const flowTypeCandidates: unknown[] = [
    profile.flow_type, profile.flowType, profile.flow_id, profile.flowId,
    project.flow_type, project.flowType, project.flow_id, project.flowId,
    company.flow_type, company.flowType, company.flow_id, company.flowId,
    quickView.flow_type, quickView.flowType, quickView.flow_id, quickView.flowId,
    milestoneFlow.flow_type, milestoneFlow.flowType,
  ];
  for (const candidate of flowTypeCandidates) {
    const text =
      typeof candidate === "string" || typeof candidate === "number"
        ? String(candidate).trim()
        : "";
    if (text === "2") return true;
  }
  const activityId = resolveFacilitatorStageActivityId(quickView);
  if (activityId !== null && activityId >= 62 && activityId <= 66) return true;
  return false;
}

function resolveFlow2ContractFeeRejection(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const candidateKeys = [
    "contract_fee_status", "contractFeeStatus",
    "facilitator_contract_fee_review_status", "facilitatorContractFeeReviewStatus",
    "signed_contract_fee_status", "signedContractFeeStatus",
  ];
  for (const key of candidateKeys) {
    const val = profile[key] ?? quickView[key];
    const text =
      typeof val === "string" || typeof val === "number"
        ? String(val).trim().toLowerCase()
        : "";
    if (text.includes("reject") || text === "2") return true;
  }
  return false;
}

function resolveFlow2ProformaRejection(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const candidateKeys = [
    "proforma_status", "proformaStatus",
    "proforma_invoice_status", "proformaInvoiceStatus",
    "payment_status", "paymentStatus",
  ];
  for (const key of candidateKeys) {
    const val = profile[key] ?? quickView[key];
    const text =
      typeof val === "string" || typeof val === "number"
        ? String(val).trim().toLowerCase()
        : "";
    if (text.includes("reject") || text === "2") return true;
  }
  return false;
}

function resolveFlow2WorkOrderRejection(quickView: Record<string, unknown>, contractDocument: Record<string, unknown>): boolean {
  const contractRoot =
    (contractDocument.data as Record<string, unknown> | undefined) ?? contractDocument;
  const woStatusLabelRaw = contractRoot.wo_status_label ?? contractDocument.wo_status_label;
  const woStatusLabel =
    typeof woStatusLabelRaw === "string" || typeof woStatusLabelRaw === "number"
      ? String(woStatusLabelRaw).toLowerCase()
      : "";
  if (woStatusLabel.includes("rejected")) return true;
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const workOrderStatusRaw =
    profile.work_order_status ?? profile.workOrderStatus ??
    quickView.work_order_status ?? quickView.workOrderStatus;
  const workOrderStatus =
    typeof workOrderStatusRaw === "string" || typeof workOrderStatusRaw === "number"
      ? String(workOrderStatusRaw).trim().toLowerCase()
      : "";
  return workOrderStatus.includes("reject") || workOrderStatus === "2";
}

function resolveFlow2FacilitatorSteps(
  quickView: Record<string, unknown>,
  contractDocument: Record<string, unknown>,
  financeInvoicesData: Record<string, unknown> | null,
  coordinatorAssigned: boolean,
  projectCodeAssignment: Record<string, unknown> | null,
  primaryDataForm: Record<string, unknown> | null,
  checklistDocumentsData: Record<string, unknown> | null,
  facilitatorAssessorAssignmentDone: boolean,
  facilitatorPreliminaryScoringDone: boolean,
  facilitatorFinalScoringSubmitted: boolean,
  facilitatorCertificateUploaded: boolean,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): { latest: FlowStepRow; next: FlowStepRow } | null {
  const activityId = resolveFacilitatorStageActivityId(quickView);
  if (activityId === null) return null;

  if (activityId === 1) {
    return {
      latest: { activity: "Company Registered", status: "Completed", responsibility: "Company" },
      next: { activity: "Fill Registration Info", status: "Pending", responsibility: "Company" },
    };
  }
  if (activityId === 2) {
    return {
      latest: { activity: "Company Filled Registration Info", status: "Completed", responsibility: "Company" },
      next: { activity: "CII will Upload Proposal Document", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 3) {
    return {
      latest: { activity: "CII Uploaded Proposal Document", status: "Completed", responsibility: "CII" },
      next: { activity: "Company will upload Work Order", status: "Pending", responsibility: "Company" },
    };
  }
  if (activityId === 4) {
    return {
      latest: { activity: "Company Uploaded Work Order Document", status: "Completed", responsibility: "Company" },
      next: { activity: "CII will Approve/Reject Work Order", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 5) {
    if (resolveFlow2WorkOrderRejection(quickView, contractDocument)) {
      return {
        latest: { activity: "Work Order / Contract Document Rejected", status: "Rejected", responsibility: "CII" },
        next: { activity: "Work Order Document needs to be re-uploaded", status: "Pending", responsibility: "Company" },
      };
    }
    return {
      latest: { activity: "Work Order / Contract Document Accepted", status: "Approved", responsibility: "CII" },
      next: { activity: "Upload Project Code", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 6) {
    return {
      latest: { activity: "CII provided Project Code", status: "Completed", responsibility: "CII" },
      next: { activity: "Assign Project Co-Ordinator", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 61) {
    return {
      latest: { activity: "Assign Project Co-Ordinator", status: "Completed", responsibility: "CII" },
      next: { activity: "CII to upload the PI/Tax Invoice", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 62) {
    return {
      latest: { activity: "CII uploaded the PI/Tax Invoice", status: "Completed", responsibility: "CII" },
      next: { activity: "Consultant will upload Site Visit Report", status: "Pending", responsibility: "Consultant" },
    };
  }
  if (activityId === 63) {
    return {
      latest: { activity: "Consultant Uploaded Site Visit Report", status: "Completed", responsibility: "Consultant" },
      next: { activity: "CII will assign a Facilitator", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 64) {
    return {
      latest: { activity: "CII Assigned A Facilitator", status: "Completed", responsibility: "CII" },
      next: { activity: "Facilitator will Upload Signed Contract Fee Document", status: "Pending", responsibility: "Facilitator" },
    };
  }
  if (activityId === 65) {
    return {
      latest: { activity: "Facilitator Uploaded Signed Contract Fee Document", status: "Completed", responsibility: "Facilitator" },
      next: { activity: "CII will Acknowledge Signed Contract Fee Document", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 66) {
    if (resolveFlow2ContractFeeRejection(quickView)) {
      return {
        latest: { activity: "CII Disapproved Contract Fee Document", status: "Rejected", responsibility: "CII" },
        next: { activity: "Facilitator will re-upload Signed Contract Fee Document", status: "Pending", responsibility: "Facilitator" },
      };
    }
    return {
      latest: { activity: "CII Accepted Fee Contract Document of the Facilitator", status: "Approved", responsibility: "CII" },
      next: { activity: "Consultant/Company will make payment", status: "Pending", responsibility: "Consultant/Company" },
    };
  }
  if (activityId === 7) {
    return {
      latest: { activity: "Consultant/Company Paid 1st Proforma Invoice", status: "Completed", responsibility: "Consultant/Company" },
      next: { activity: "CII will Acknowledge Proforma Invoice", status: "Pending", responsibility: "CII" },
    };
  }
  if (activityId === 8) {
    if (resolveFlow2ProformaRejection(quickView)) {
      return {
        latest: { activity: "1st Proforma Invoice Rejected by CII", status: "Rejected", responsibility: "CII" },
        next: { activity: "Consultant/Company will re-pay 1st Proforma Invoice", status: "Pending", responsibility: "Consultant/Company" },
      };
    }
    return {
      latest: { activity: "CII Acknowledged Proforma Invoice", status: "Approved", responsibility: "CII" },
      next: { activity: "Company needs to upload Primary Data Form", status: "Pending", responsibility: "Company" },
    };
  }
  if (activityId === 9) {
    return {
      latest: { activity: "Company Uploaded All Primary Data", status: "Completed", responsibility: "Company" },
      next: { activity: "CII needs to Accept Primary Data", status: "Pending", responsibility: "CII" },
    };
  }

  if (activityId >= 10 && activityId <= 21) {
    return null;
  }

  return null;
}

function resolveFlowSteps(
  quickView: Record<string, unknown>,
  latestStep: unknown,
  nextStep: unknown,
  contractDocument: Record<string, unknown>,
  facilitatorRegistration: Record<string, unknown> | null,
  projectCodeAssignment: Record<string, unknown> | null,
  launchTrainingData: Record<string, unknown> | null,
  financeInvoicesData: Record<string, unknown> | null,
  proformaApprovalData: Record<string, unknown> | null,
  primaryDataForm: Record<string, unknown> | null,
  checklistDocumentsData: Record<string, unknown> | null,
  coordinatorAssigned: boolean,
  isFacilitatorProject: boolean,
  facilitatorAssessorAssignmentDone: boolean,
  facilitatorPreliminaryScoringDone: boolean,
  facilitatorFinalScoringSubmitted: boolean,
  facilitatorCertificateUploaded: boolean,
  facilitatorNotifications: PanelNotification[],
  projectId: string,
): {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
} {
  const contractRoot =
    (contractDocument.data as Record<string, unknown> | undefined) ??
    contractDocument;

  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const primaryDataWorkflowStatus = computePrimaryDataOverallReviewStatus(primaryDataForm, quickView);
  const primaryDataSourceForFlow = primaryDataForm ?? quickView;
  const hasPrimaryDataReadyForFacilitatorFlow =
    hasRelevantPrimaryDataSectionReviewsStarted(primaryDataForm) ||
    hasPrimaryDataFilledPayload(primaryDataForm) ||
    hasPrimaryDataFilledPayload(buildQuickViewPrimaryDataSource(quickView)) ||
    primaryDataWorkflowStatus.allSectionsSubmitted ||
    primaryDataWorkflowStatus.allSectionsAccepted;

  if (isFacilitatorProject) {
    const contractFlow = contractPhaseToFlowSteps(quickView, contractDocument);
    if (contractFlow) {
      return contractFlow;
    }

    if (isCiiAssignsFacilitatorFlow(quickView)) {
      const flow2Steps = resolveFlow2FacilitatorSteps(
        quickView,
        contractDocument,
        financeInvoicesData,
        coordinatorAssigned,
        projectCodeAssignment,
        primaryDataForm,
        checklistDocumentsData,
        facilitatorAssessorAssignmentDone,
        facilitatorPreliminaryScoringDone,
        facilitatorFinalScoringSubmitted,
        facilitatorCertificateUploaded,
        facilitatorNotifications,
        projectId,
      );
      if (flow2Steps) {
        return flow2Steps;
      }
    }

    if (hasAnyRejectedPrimaryDataSection(primaryDataForm, quickView, facilitatorNotifications, projectId)) {
      return facilitatorPrimaryDataRejectedFlowSteps(
        primaryDataForm,
        quickView,
        facilitatorNotifications,
        projectId,
      );
    }

    const facilitatorPrimaryLane = tryFacilitatorPrimaryDataLaneSteps(
      isFacilitatorProject,
      hasPrimaryDataReadyForFacilitatorFlow,
      primaryDataSourceForFlow,
      checklistDocumentsData,
      facilitatorAssessorAssignmentDone,
      facilitatorPreliminaryScoringDone,
      facilitatorFinalScoringSubmitted,
      facilitatorCertificateUploaded,
      facilitatorNotifications,
      projectId,
      financeInvoicesData,
    );
    if (facilitatorPrimaryLane) {
      return facilitatorPrimaryLane;
    }
  }

  const latestStepDetail = toStepDetail(latestStep);
  const nextStepDetail = toStepDetail(nextStep);
  const facilitatorCodeRaw = profile.facilitator_code ?? profile.facilitatorCode ?? quickView.facilitator_code;
  const facilitatorCode = typeof facilitatorCodeRaw === "string" || typeof facilitatorCodeRaw === "number"
    ? String(facilitatorCodeRaw).trim()
    : "";
  const hasFacilitatorRegistrationData = isFacilitatorProject
    ? hasFacilitatorRegistrationPayload(facilitatorRegistration)
    : Boolean(facilitatorCode);
  const contractHasDocument = Boolean(
    contractRoot.has_document ??
      contractRoot.document_url ??
      contractRoot.document_filename,
  );
  const woStatusLabelRaw = contractRoot.wo_status_label ?? contractDocument.wo_status_label;
  const woStatusLabel =
    typeof woStatusLabelRaw === "string" || typeof woStatusLabelRaw === "number"
      ? String(woStatusLabelRaw).toLowerCase()
      : "";
  const canReuploadRaw =
    contractRoot.can_reupload_work_order ?? contractDocument.can_reupload_work_order;
  const canReuploadWorkOrder =
    canReuploadRaw === true ||
    canReuploadRaw === "true" ||
    canReuploadRaw === 1 ||
    canReuploadRaw === "1";
  const awaitingCiiReview =
    woStatusLabel.includes("pending_review") ||
    woStatusLabel.includes("pending review") ||
    contractRoot.awaiting_cii_review === true ||
    contractDocument.awaiting_cii_review === true;
  const woPoNumberRaw = contractRoot.wo_po_number ?? contractDocument.wo_po_number;
  const hasWoPoNumber =
    typeof woPoNumberRaw === "string"
      ? woPoNumberRaw.trim().length > 0
      : typeof woPoNumberRaw === "number" && String(woPoNumberRaw).trim().length > 0;
  const facilitatorStageActivityId = resolveFacilitatorStageActivityId(quickView);
  const pureFacilitatorProject = isPureFacilitatorProject(quickView);
  const facilitatorStageActive =
    isFacilitatorProject &&
    (
      pureFacilitatorProject ||
      (facilitatorStageActivityId !== null && facilitatorStageActivityId >= 61)
    );
  const hasPlaquePrData = facilitatorStageActive && hasPlaqueAndPrRaised(quickView);
  const hasFeedbackReport = facilitatorStageActive && hasFeedbackReportUploaded(quickView);

  if (hasFeedbackReport) {
    return {
      latest: {
        activity: "Feedback done by CII",
        status: "Completed",
        responsibility: "CII",
      },
      next: {
        activity: "Certificate has been issued",
        status: "Completed",
        responsibility: "CII",
      },
    };
  }

  if (hasPlaquePrData) {
    return {
      latest: {
        activity: "Plaque and PR has been done",
        status: "Completed",
        responsibility: "CII",
      },
      next: {
        activity: "Feedback report need to upload by CII",
        status: "Pending",
        responsibility: "CII",
      },
    };
  }

  if (woStatusLabel.includes("rejected")) {
    const uploaderRole = isFacilitatorProject ? "Facilitator" : "Consultant";
    if (canReuploadWorkOrder) {
      return {
        latest: {
          activity: isFacilitatorProject ? "Contract document review" : "Contract Document Review",
          status: isFacilitatorProject ? "Rejected by CII" : "Rejected",
          responsibility: isFacilitatorProject ? "CII" : "Admin",
        },
        next: {
          activity: isFacilitatorProject
            ? "Re-upload the contract document"
            : "Contract has been rejected. Re-upload document",
          status: "Pending",
          responsibility: uploaderRole,
        },
      };
    }
    if (isFacilitatorProject) {
      return {
        latest: {
          activity: "Contract document review",
          status: "Rejected by CII",
          responsibility: "CII",
        },
        next: {
          activity: "Re-upload is not enabled yet — awaiting CII or system update",
          status: "Pending",
          responsibility: "CII",
        },
      };
    }
    return {
      latest: { activity: "Contract Document Review", status: "Rejected", responsibility: "Admin" },
      next: {
        activity: "Contract has been rejected. Re-upload document",
        status: "Pending",
        responsibility: "Consultant",
      },
    };
  }

  if (contractHasDocument) {
    if (woStatusLabel.includes("approved") || woStatusLabel.includes("accepted")) {
      if (isFacilitatorProject) {
        if (hasProjectCodeAssignmentPayload(projectCodeAssignment)) {
          if (coordinatorAssigned) {
            if (hasLaunchTrainingPayload(launchTrainingData)) {
              if (hasProformaDocumentPayload(financeInvoicesData)) {
                const latestInvoice = getLatestFinanceInvoice(financeInvoicesData);
                const latestInvoiceTypeRaw =
                  latestInvoice?.invoice_type ?? latestInvoice?.invoiceType ?? latestInvoice?.payment_for_label;
                const latestInvoiceType =
                  typeof latestInvoiceTypeRaw === "string" || typeof latestInvoiceTypeRaw === "number"
                    ? String(latestInvoiceTypeRaw).trim().toLowerCase()
                    : "invoice";
                const latestInvoiceLabel = latestInvoiceType.includes("tax")
                  ? "tax invoice"
                  : latestInvoiceType.includes("proforma") || latestInvoiceType.includes("pro forma")
                    ? "proforma invoice"
                    : "invoice";

                if (hasInvoiceDocument(latestInvoice) && !isInvoicePaymentSubmitted(latestInvoice)) {
                  return {
                    latest: {
                      activity: `${latestInvoiceLabel.charAt(0).toUpperCase()}${latestInvoiceLabel.slice(1)} uploaded by CII`,
                      status: "Completed",
                      responsibility: "CII",
                    },
                    next: {
                      activity: `Consultant payment pending for ${latestInvoiceLabel}`,
                      status: "Pending",
                      responsibility: "Consultant",
                    },
                  };
                }
                const latestInvoiceApprovalRaw =
                  latestInvoice?.approval_status ?? latestInvoice?.approvalStatus;
                const latestInvoiceApprovalText =
                  typeof latestInvoiceApprovalRaw === "string" || typeof latestInvoiceApprovalRaw === "number"
                    ? String(latestInvoiceApprovalRaw).trim().toLowerCase()
                    : "";
                const latestInvoiceApprovalLabelRaw =
                  latestInvoice?.approval_status_label ?? latestInvoice?.approvalStatusLabel;
                const latestInvoiceApprovalLabelText =
                  typeof latestInvoiceApprovalLabelRaw === "string" || typeof latestInvoiceApprovalLabelRaw === "number"
                    ? String(latestInvoiceApprovalLabelRaw).trim().toLowerCase()
                    : "";
                const latestInvoiceHistoryRaw =
                  latestInvoice?.invoice_document_history ?? latestInvoice?.invoiceDocumentHistory;
                const latestInvoiceHistory = Array.isArray(latestInvoiceHistoryRaw) ? latestInvoiceHistoryRaw : [];
                const hasInvoiceHistoryFilename = latestInvoiceHistory.some((entry) => {
                  if (!entry || typeof entry !== "object") return false;
                  const rec = entry as Record<string, unknown>;
                  const filenameRaw = rec.filename ?? rec.file_name ?? rec.name;
                  return typeof filenameRaw === "string" && filenameRaw.trim().length > 0;
                });
                const latestPaymentHistoryRaw =
                  latestInvoice?.offline_tran_doc_history ?? latestInvoice?.offlineTranDocHistory;
                const latestPaymentHistory = Array.isArray(latestPaymentHistoryRaw) ? latestPaymentHistoryRaw : [];
                const hasPaymentReuploadHistory = latestPaymentHistory.length > 1;
                const isLatestInvoiceApprovalPending =
                  latestInvoiceApprovalText === "0" ||
                  latestInvoiceApprovalText === "pending" ||
                  latestInvoiceApprovalLabelText.includes("pending");
                const isLatestInvoiceApprovalRejected =
                  latestInvoiceApprovalText === "2" ||
                  latestInvoiceApprovalText === "rejected" ||
                  latestInvoiceApprovalLabelText.includes("rejected");
                const isLatestInvoiceApprovalAccepted =
                  latestInvoiceApprovalText === "1" ||
                  latestInvoiceApprovalText === "approved" ||
                  latestInvoiceApprovalLabelText.includes("approved");
                if (
                  hasInvoiceHistoryFilename &&
                  isInvoicePaymentSubmitted(latestInvoice) &&
                  isLatestInvoiceApprovalAccepted &&
                  hasPaymentReuploadHistory
                ) {
                  const facilitatorMidFlow = tryFacilitatorPrimaryDataLaneSteps(
                    isFacilitatorProject,
                    hasPrimaryDataReadyForFacilitatorFlow,
                    primaryDataSourceForFlow,
                    checklistDocumentsData,
                    facilitatorAssessorAssignmentDone,
                    facilitatorPreliminaryScoringDone,
                    facilitatorFinalScoringSubmitted,
                    facilitatorCertificateUploaded,
                    facilitatorNotifications,
                    projectId,
                    financeInvoicesData,
                  );
                  if (facilitatorMidFlow) {
                    return facilitatorMidFlow;
                  }
                  const primaryAfterFinance = facilitatorPrimaryDataSubmittedFlowSteps(
                    primaryDataWorkflowStatus,
                    primaryDataForm,
                    quickView,
                    primaryDataSourceForFlow,
                    checklistDocumentsData,
                    facilitatorAssessorAssignmentDone,
                    facilitatorPreliminaryScoringDone,
                    facilitatorFinalScoringSubmitted,
                    facilitatorCertificateUploaded,
                    facilitatorNotifications,
                    projectId,
                    financeInvoicesData,
                  );
                  if (primaryAfterFinance) {
                    return primaryAfterFinance;
                  }
                  const flowLabel = capitalizeFinanceFlowLabel(latestInvoiceLabel);
                  return {
                    latest: {
                      activity: `Re-uploaded ${flowLabel} has been accepted`,
                      status: "Approved",
                      responsibility: "CII",
                    },
                    next: {
                      activity: "Company needs to upload primary data form",
                      status: "Pending",
                      responsibility: "Company",
                    },
                  };
                }
                if (
                  hasInvoiceHistoryFilename &&
                  isInvoicePaymentSubmitted(latestInvoice) &&
                  isLatestInvoiceApprovalRejected
                ) {
                  const flowLabel = capitalizeFinanceFlowLabel(latestInvoiceLabel);
                  return {
                    latest: {
                      activity: `${flowLabel} payment has been rejected by CII`,
                      status: "Rejected",
                      responsibility: "CII",
                    },
                    next: {
                      activity: `${flowLabel} payment proof needs to be re-uploaded by consultant`,
                      status: "Pending",
                      responsibility: "Consultant",
                    },
                  };
                }
                if (
                  hasInvoiceHistoryFilename &&
                  isInvoicePaymentSubmitted(latestInvoice) &&
                  isLatestInvoiceApprovalPending
                ) {
                  const flowLabel = capitalizeFinanceFlowLabel(latestInvoiceLabel);
                  if (hasPaymentReuploadHistory) {
                    return {
                      latest: {
                        activity: `${flowLabel} payment re-upload has been done`,
                        status: "Completed",
                        responsibility: "Consultant",
                      },
                      next: {
                        activity: "CII need to re-verify and approve or reject the payment",
                        status: "Pending",
                        responsibility: "CII",
                      },
                    };
                  }
                  return {
                    latest: {
                      activity: `${flowLabel} payment done by consultant`,
                      status: "Completed",
                      responsibility: "Consultant",
                    },
                    next: {
                      activity: `${flowLabel} needs to be approved or rejected by Admin`,
                      status: "Pending",
                      responsibility: "Admin",
                    },
                  };
                }
                /** Finance v2: first-cycle proforma/tax invoice already Admin-approved → advance to primary data (uses invoice + approval on same payload). */
                if (
                  hasInvoiceHistoryFilename &&
                  isInvoicePaymentSubmitted(latestInvoice) &&
                  isLatestInvoiceApprovalAccepted &&
                  !hasPaymentReuploadHistory
                ) {
                  const flowLabel = capitalizeFinanceFlowLabel(latestInvoiceLabel);
                  if (hasPrimaryDataReadyForFacilitatorFlow) {
                    return resolveFacilitatorPrimaryDataFlowSteps(
                      primaryDataSourceForFlow,
                      checklistDocumentsData,
                      facilitatorAssessorAssignmentDone,
                      facilitatorPreliminaryScoringDone,
                      facilitatorFinalScoringSubmitted,
                      facilitatorCertificateUploaded,
                      facilitatorNotifications,
                      projectId,
                      financeInvoicesData,
                    );
                  }
                  return {
                    latest: {
                      activity: `${flowLabel} approved by Admin (first invoice)`,
                      status: "Approved",
                      responsibility: "Admin",
                    },
                    next: {
                      activity: "Company needs to upload primary data form",
                      status: "Pending",
                      responsibility: "Company",
                    },
                  };
                }
                const isProformaRejected = hasAnyRejectedProformaApproval(
                  financeInvoicesData,
                  proformaApprovalData,
                );
                if (isProformaRejected) {
                  return {
                    latest: {
                      activity: "CII rejected the supporting document",
                      status: "Rejected",
                      responsibility: "CII",
                    },
                    next: {
                      activity: "Consultant needs to re-upload supporting document",
                      status: "Pending",
                      responsibility: "Consultant",
                    },
                  };
                }
                if (hasApprovedProformaAfterReupload(financeInvoicesData)) {
                  if (hasPrimaryDataReadyForFacilitatorFlow) {
                    return resolveFacilitatorPrimaryDataFlowSteps(
                      primaryDataSourceForFlow,
                      checklistDocumentsData,
                      facilitatorAssessorAssignmentDone,
                      facilitatorPreliminaryScoringDone,
                      facilitatorFinalScoringSubmitted,
                      facilitatorCertificateUploaded,
                      facilitatorNotifications,
                      projectId,
                      financeInvoicesData,
                    );
                  }
                  return {
                    latest: {
                      activity: "Re-uploaded supporting documents approved by CII",
                      status: "Approved",
                      responsibility: "CII",
                    },
                    next: {
                      activity: "Company needs to upload primary data form",
                      status: "Pending",
                      responsibility: "Company",
                    },
                  };
                }
                if (hasProformaReuploadAfterRejection(financeInvoicesData)) {
                  return {
                    latest: {
                      activity: "Consultant re-uploaded the supporting document",
                      status: "Completed",
                      responsibility: "Consultant",
                    },
                    next: {
                      activity: "CII need to re-approve/reject the proforma invoice",
                      status: "Pending",
                      responsibility: "CII",
                    },
                  };
                }
                if (hasProformaPaymentSubmittedPayload(financeInvoicesData)) {
                  const flowLabel = capitalizeFinanceFlowLabel(latestInvoiceLabel);
                  return {
                    latest: {
                      activity: `${flowLabel} payment done by consultant`,
                      status: "Completed",
                      responsibility: "Consultant",
                    },
                    next: {
                      activity: `${flowLabel} needs to be approved or rejected by Admin`,
                      status: "Pending",
                      responsibility: "Admin",
                    },
                  };
                }
                return {
                  latest: {
                    activity: "Proforma invoice uploaded by CII",
                    status: "Completed",
                    responsibility: "CII",
                  },
                  next: {
                    activity: "Consultant to upload supporting document",
                    status: "Pending",
                    responsibility: "Consultant",
                  },
                };
              }
              return {
                latest: {
                  activity: "Launch and training submitted by facilitator",
                  status: "Completed",
                  responsibility: "Facilitator",
                },
                next: {
                  activity: "CII will upload proforma/invoice",
                  status: "Pending",
                  responsibility: "CII",
                },
              };
            }
            return {
              latest: {
                activity: "Project coordinator assigned by CII",
                status: "Completed",
                responsibility: "CII",
              },
              next: {
                activity: "Launch and training need to be submitted by facilitator",
                status: "Pending",
                responsibility: "Facilitator",
              },
            };
          }
          return {
            latest: {
              activity: "Project code submitted by CII",
              status: "Completed",
              responsibility: "CII",
            },
            next: {
              activity: "Assign project coordinator",
              status: "Pending",
              responsibility: "CII",
            },
          };
        }
        if (hasWoPoNumber) {
          return {
            latest: {
              activity: "PO number has been uploaded by CII",
              status: "Completed",
              responsibility: "CII",
            },
            next: {
              activity: "Project code needs to be uploaded by CII",
              status: "Pending",
              responsibility: "CII",
            },
          };
        }
        return {
          latest: { activity: "Contract approved by CII", status: "Approved", responsibility: "CII" },
          next: { activity: "CII to upload PO amount", status: "Pending", responsibility: "CII" },
        };
      }
      return {
        latest: { activity: "Contract has been approved", status: "Done", responsibility: "Admin" },
        next: { activity: "Contract Approved", status: "Completed", responsibility: "Admin" },
      };
    }
    if (facilitatorStageActive) {
      const reviewStatusLabel = awaitingCiiReview ? "Awaiting CII review" : "Pending review";
      return {
        latest: {
          activity: "Contract document submitted by facilitator",
          status: "Submitted",
          responsibility: "Facilitator",
        },
        next: {
          activity: "CII must accept or reject the contract document",
          status: reviewStatusLabel,
          responsibility: "CII",
        },
      };
    }
    const reviewStatus = "Pending";
    return {
      latest: { activity: "Contract Document Uploaded", status: "Done", responsibility: "Consultant" },
      next: { activity: "Admin Review (Approve / Reject)", status: reviewStatus, responsibility: "Admin" },
    };
  }

  if (hasFacilitatorRegistrationData) {
    if (isFacilitatorProject) {
      if (!contractHasDocument && !awaitingCiiReview) {
        return {
          latest: { activity: "Company Filled Registration Info", status: "Completed", responsibility: "Company" },
          next: {
            activity: "Facilitator to upload signed contract document",
            status: "Pending",
            responsibility: "Facilitator",
          },
        };
      }
      if (!facilitatorStageActive) {
        return {
          latest: { activity: "Company Filled Registration Info", status: "Completed", responsibility: "Company" },
          next: {
            activity: "Contract document submitted — awaiting CII",
            status: "Pending",
            responsibility: "CII",
          },
        };
      }
      return {
        latest: { activity: "Company Filled Registration Info", status: "Completed", responsibility: "Company" },
        next: {
          activity: "Contract document need to upload by consultant/facilitator",
          status: "Pending",
          responsibility: "Facilitator",
        },
      };
    }
    return {
      latest: { activity: "Registration Filled by Company", status: "Done", responsibility: "Company" },
      next: { activity: "Contract Document", status: "Pending", responsibility: "Consultant" },
    };
  }

  if (isFacilitatorProject) {
    return {
      latest: { activity: "Company Registered by Company", status: "Completed", responsibility: "Company" },
      next: { activity: "Company Filled Registration Info", status: "Pending", responsibility: "Company" },
    };
  }

  return {
    latest: {
      activity: hasDisplayValue(latestStepDetail.activity) ? latestStepDetail.activity : "Company Registered",
      status: hasDisplayValue(latestStepDetail.status) ? latestStepDetail.status : "Done",
      responsibility: hasDisplayValue(latestStepDetail.responsibility) ? latestStepDetail.responsibility : "Company",
    },
    next: {
      activity: hasDisplayValue(nextStepDetail.activity) ? nextStepDetail.activity : "Company Filled Registration Info",
      status: hasDisplayValue(nextStepDetail.status) ? nextStepDetail.status : "Pending",
      responsibility: hasDisplayValue(nextStepDetail.responsibility) ? nextStepDetail.responsibility : "Company",
    },
  };
}

function toMilestoneList(quickView: Record<string, unknown>): Record<string, unknown>[] {
  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined) ??
    {};
  const raw =
    milestoneFlow.milestone_status ??
    milestoneFlow.milestoneStatus ??
    quickView.milestone_status ??
    quickView.milestoneStatus;
  return normalizeRecords(raw);
}

export default function AssessorProjectQuickViewPage() {
  const routeParams = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickView, setQuickView] = useState<Record<string, unknown>>({});
  const [assignments, setAssignments] = useState<Record<string, unknown>>({});
  const [contractDocument, setContractDocument] = useState<Record<string, unknown>>({});
  const [facilitatorRegistration, setFacilitatorRegistration] = useState<Record<string, unknown> | null>(null);
  const [projectCodeAssignment, setProjectCodeAssignment] = useState<Record<string, unknown> | null>(null);
  const [launchTrainingData, setLaunchTrainingData] = useState<Record<string, unknown> | null>(null);
  const [financeInvoicesData, setFinanceInvoicesData] = useState<Record<string, unknown> | null>(null);
  const [proformaApprovalData, setProformaApprovalData] = useState<Record<string, unknown> | null>(null);
  const [primaryDataForm, setPrimaryDataForm] = useState<Record<string, unknown> | null>(null);
  const [checklistDocumentsData, setChecklistDocumentsData] = useState<Record<string, unknown> | null>(null);
  const [facilitatorAdminAssessors, setFacilitatorAdminAssessors] = useState<{
    loaded: boolean;
    payload: Record<string, unknown> | null;
    failed: boolean;
  }>({ loaded: false, payload: null, failed: false });
  const [facilitatorAssessmentScoring, setFacilitatorAssessmentScoring] = useState<{
    loaded: boolean;
    payload: Record<string, unknown> | null;
    failed: boolean;
  }>({ loaded: false, payload: null, failed: false });
  const [facilitatorCertificateData, setFacilitatorCertificateData] = useState<{
    loaded: boolean;
    payload: Record<string, unknown> | null;
    failed: boolean;
  }>({ loaded: false, payload: null, failed: false });
  const [coordinatorCatalog, setCoordinatorCatalog] = useState<Record<string, unknown>[]>([]);
  const panelNotifications = useOptionalPanelNotifications();
  const facilitatorNotificationsForFlow = panelNotifications?.notifications ?? [];

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      console.log("projectId", projectId);
      setError("Invalid project id.");
      setQuickView({});
      setAssignments({});
      setContractDocument({});
      setFacilitatorRegistration(null);
      setProjectCodeAssignment(null);
      setLaunchTrainingData(null);
      setFinanceInvoicesData(null);
      setProformaApprovalData(null);
      setPrimaryDataForm(null);
      setChecklistDocumentsData(null);
      setFacilitatorAdminAssessors({ loaded: false, payload: null, failed: false });
      setFacilitatorAssessmentScoring({ loaded: false, payload: null, failed: false });
      setFacilitatorCertificateData({ loaded: false, payload: null, failed: false });
      setCoordinatorCatalog([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    const preferFacilitatorQuickview = Boolean(pathname?.includes("/facilitator/"));
    getCompanyProjectFacilitatorRegistrationInfo(projectId)
      .then((regPayload) => {
        if (!cancelled) setFacilitatorRegistration(regPayload);
      })
      .catch(() => {
        if (!cancelled) setFacilitatorRegistration(null);
      });
    void Promise.all([
      preferFacilitatorQuickview
        ? getFacilitatorProjectQuickView(projectId)
        : getProjectQuickView(projectId, "company"),
      getCompanyProjectAssignments(projectId),
      getCompanyCoordinators(),
    ])
      .then(async ([quickViewPayload, assignmentsPayload, coordinatorsPayload]) => {
        if (cancelled) return;
        const isFacilitator = detectFacilitatorProject(quickViewPayload, pathname ?? "");
        let effectiveQuickView = quickViewPayload;
        if (isFacilitator) {
          try {
            const pDetailsPayload = await getAdminProjectPDetails(projectId);
            if (pDetailsPayload && typeof pDetailsPayload === "object") {
              const baseProfile =
                quickViewPayload.profile &&
                typeof quickViewPayload.profile === "object" &&
                !Array.isArray(quickViewPayload.profile)
                  ? (quickViewPayload.profile as Record<string, unknown>)
                  : undefined;
              const pDetailsProfile =
                pDetailsPayload.profile &&
                typeof pDetailsPayload.profile === "object" &&
                !Array.isArray(pDetailsPayload.profile)
                  ? (pDetailsPayload.profile as Record<string, unknown>)
                  : undefined;
              const mergedProfile: Record<string, unknown> = {};
              if (baseProfile) Object.assign(mergedProfile, baseProfile);
              if (pDetailsProfile) Object.assign(mergedProfile, pDetailsProfile);
              effectiveQuickView = {
                ...quickViewPayload,
                ...pDetailsPayload,
                profile: mergedProfile,
              };
            }
          } catch {
            // Continue with quick-view payload if p-details is unavailable.
          }
        }
        setQuickView(effectiveQuickView);
        setAssignments(assignmentsPayload);
        const list = pickRecordList(coordinatorsPayload, ["items", "rows", "data", "coordinators", "result"]);
        setCoordinatorCatalog(list);
        if (isFacilitator) {
          setFacilitatorAdminAssessors({ loaded: false, payload: null, failed: false });
          setFacilitatorAssessmentScoring({ loaded: false, payload: null, failed: false });
          setFacilitatorCertificateData({ loaded: false, payload: null, failed: false });
          const sectorId = String(
            effectiveQuickView.sector_id ??
              effectiveQuickView.sectorId ??
              (effectiveQuickView.profile as Record<string, unknown> | undefined)?.mst_sector_id ??
              (effectiveQuickView.sector as Record<string, unknown> | undefined)?.id ??
              (effectiveQuickView.project as Record<string, unknown> | undefined)?.sector_id ??
              "",
          );
          getAdminAssessmentScoring(projectId)
            .then((allScoringPayload) => {
              if (cancelled) return;
              const allPayload = allScoringPayload as Record<string, unknown> | null;
              if (allPayload && extractByCriteriaScoringEntries(allPayload).length > 0) {
                setFacilitatorAssessmentScoring({ loaded: true, payload: allPayload, failed: false });
                return;
              }
              if (!sectorId) {
                setFacilitatorAssessmentScoring({
                  loaded: true,
                  payload: allPayload,
                  failed: !allPayload,
                });
                return;
              }
              getCompanyAssessmentCriteriaBySector(sectorId)
                .then((criteriaPayload) => {
                  if (cancelled) return null;
                  const crit =
                    criteriaPayload && typeof criteriaPayload === "object"
                      ? (criteriaPayload as Record<string, unknown>)
                      : {};
                  const firstCriteriaId = resolveFirstSectorCriteriaId(crit);
                  if (!firstCriteriaId) return null;
                  return getAdminAssessmentScoring(projectId, firstCriteriaId);
                })
                .then((scoringPayload) => {
                  if (cancelled) return;
                  if (scoringPayload === null) {
                    setFacilitatorAssessmentScoring({
                      loaded: true,
                      payload: allPayload,
                      failed: !allPayload,
                    });
                    return;
                  }
                  if (scoringPayload === undefined) return;
                  setFacilitatorAssessmentScoring({
                    loaded: true,
                    payload: scoringPayload as Record<string, unknown>,
                    failed: false,
                  });
                })
                .catch(() => {
                  if (!cancelled) {
                    setFacilitatorAssessmentScoring({
                      loaded: true,
                      payload: allPayload,
                      failed: !allPayload,
                    });
                  }
                });
            })
            .catch(() => {
              if (cancelled) return;
              if (!sectorId) {
                setFacilitatorAssessmentScoring({ loaded: true, payload: null, failed: true });
                return;
              }
              getCompanyAssessmentCriteriaBySector(sectorId)
                .then((criteriaPayload) => {
                  if (cancelled) return null;
                  const crit =
                    criteriaPayload && typeof criteriaPayload === "object"
                      ? (criteriaPayload as Record<string, unknown>)
                      : {};
                  const firstCriteriaId = resolveFirstSectorCriteriaId(crit);
                  if (!firstCriteriaId) return null;
                  return getAdminAssessmentScoring(projectId, firstCriteriaId);
                })
                .then((scoringPayload) => {
                  if (cancelled) return;
                  if (scoringPayload === null) {
                    setFacilitatorAssessmentScoring({ loaded: true, payload: null, failed: true });
                    return;
                  }
                  if (scoringPayload === undefined) return;
                  setFacilitatorAssessmentScoring({
                    loaded: true,
                    payload: scoringPayload as Record<string, unknown>,
                    failed: false,
                  });
                })
                .catch(() => {
                  if (!cancelled) setFacilitatorAssessmentScoring({ loaded: true, payload: null, failed: true });
                });
            });
          getAdminApprovedAssessorsCatalog()
            .then((payload) => {
              if (!cancelled) setFacilitatorAdminAssessors({ loaded: true, payload, failed: false });
            })
            .catch(() => {
              if (!cancelled) setFacilitatorAdminAssessors({ loaded: true, payload: null, failed: true });
            });
          getAdminProjectCertificate(projectId)
            .then((payload) => {
              if (cancelled) return;
              setFacilitatorCertificateData({ loaded: true, payload, failed: false });
              const certProfile =
                (payload.profile as Record<string, unknown> | undefined) ??
                ((payload.data as Record<string, unknown> | undefined)?.profile as Record<string, unknown> | undefined);
              const feedbackDoc =
                certProfile?.feedback_document ??
                certProfile?.feedbackDocument ??
                payload.feedback_document_url ??
                payload.feedback_document;
              if (typeof feedbackDoc === "string" && feedbackDoc.trim().length > 0) {
                setQuickView((prev) => {
                  const prevProfile =
                    prev.profile && typeof prev.profile === "object" && !Array.isArray(prev.profile)
                      ? (prev.profile as Record<string, unknown>)
                      : {};
                  return {
                    ...prev,
                    profile: { ...prevProfile, feedback_document: feedbackDoc.trim() },
                  };
                });
              }
            })
            .catch(() => {
              if (!cancelled) setFacilitatorCertificateData({ loaded: true, payload: null, failed: true });
            });
          getProjectSignedContractDocument(
            projectId,
            preferFacilitatorQuickview || isFacilitator ? "facilitator" : "company",
          )
            .then((payload) => {
              if (!cancelled) setContractDocument(payload);
            })
            .catch(() => {
              if (!cancelled) setContractDocument({});
            });
          getCompanyProjectProjectCode(projectId)
            .then((payload) => {
              if (!cancelled) setProjectCodeAssignment(payload);
            })
            .catch(() => {
              if (!cancelled) setProjectCodeAssignment(null);
            });
          getFacilitatorProjectLaunchTraining(projectId)
            .then((payload) => {
              if (!cancelled) setLaunchTrainingData(payload);
            })
            .catch(() => {
              if (!cancelled) setLaunchTrainingData(null);
            });
          getFacilitatorFinanceInvoices(projectId)
            .then((payload) => {
              if (cancelled) return;
              const invoicesRaw = payload.invoices;
              const invoices = Array.isArray(invoicesRaw) ? invoicesRaw : [];
              const proformaInvoices = invoices.filter((item) => {
                if (!item || typeof item !== "object") return false;
                const rec = item as Record<string, unknown>;
                const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
                const typeText =
                  typeof typeRaw === "string" || typeof typeRaw === "number"
                    ? String(typeRaw).trim().toLowerCase()
                    : "";
                return typeText.includes("proforma") || typeText.includes("pro forma");
              }) as Record<string, unknown>[];
              if (proformaInvoices.length === 0) {
                setFinanceInvoicesData(payload);
                setProformaApprovalData(null);
                return;
              }

              const proformaIds = proformaInvoices
                .map((invoice) => {
                  const idRaw = invoice.id ?? invoice._id ?? invoice.invoice_id;
                  return typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw).trim() : "";
                })
                .filter((id): id is string => Boolean(id));

              if (proformaIds.length === 0) {
                setFinanceInvoicesData(payload);
                setProformaApprovalData(null);
                return;
              }

              Promise.allSettled(
                proformaIds.map((invoiceId) =>
                  getFacilitatorFinanceInvoiceApprovalStatus(projectId, invoiceId, "proforma")
                    .then((approvalPayload) => ({ invoiceId, approvalPayload })),
                ),
              )
                .then((results) => {
                  if (cancelled) return;
                  let latestApprovalPayload: Record<string, unknown> | null = null;
                  const approvalByInvoiceId = new Map<string, Record<string, unknown>>();
                  for (const result of results) {
                    if (result.status !== "fulfilled") continue;
                    const approval = result.value.approvalPayload;
                    if (!approval || typeof approval !== "object") continue;
                    const approvalRecord = approval as Record<string, unknown>;
                    approvalByInvoiceId.set(result.value.invoiceId, approvalRecord);
                    latestApprovalPayload = approvalRecord;
                  }

                  const mergedInvoices = invoices.map((item) => {
                    if (!item || typeof item !== "object") return item;
                    const rec = item as Record<string, unknown>;
                    const idRaw = rec.id ?? rec._id ?? rec.invoice_id;
                    const invoiceId =
                      typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw).trim() : "";
                    if (!invoiceId) return rec;
                    const approval = approvalByInvoiceId.get(invoiceId);
                    if (!approval) return rec;
                    return {
                      ...rec,
                      approval_status: approval.approval_status ?? rec.approval_status,
                      approval_status_label: approval.approval_status_label ?? rec.approval_status_label,
                      approval_status_color: approval.approval_status_color ?? rec.approval_status_color,
                      remarks: approval.remarks ?? rec.remarks,
                      rejected_remarks: approval.rejected_remarks ?? rec.rejected_remarks,
                    };
                  });

                  setFinanceInvoicesData({ ...payload, invoices: mergedInvoices });
                  setProformaApprovalData(latestApprovalPayload);
                })
                .catch(() => {
                  if (!cancelled) {
                    setFinanceInvoicesData(payload);
                    setProformaApprovalData(null);
                  }
                });
            })
            .catch(() => {
              if (!cancelled) {
                setFinanceInvoicesData(null);
                setProformaApprovalData(null);
              }
            });
          Promise.allSettled([
            getCompanyProjectPrimaryData(projectId),
            getAdminProjectPrimaryData(projectId),
            getFacilitatorProjectPrimaryData(projectId),
            getCompanyProjectPrimaryDataReview(projectId),
            getAdminProjectPrimaryDataReview(projectId),
            getFacilitatorProjectPrimaryDataReview(projectId),
          ])
            .then(([
              companyPrimaryResult,
              adminPrimaryResult,
              facilitatorPrimaryResult,
              companyReviewResult,
              adminReviewResult,
              facilitatorReviewResult,
            ]) => {
              if (cancelled) return;
              const hasObjectValues = (value: Record<string, unknown> | null): boolean =>
                Boolean(value && Object.keys(value).length > 0);
              const companyPrimaryPayload =
                companyPrimaryResult.status === "fulfilled" ? companyPrimaryResult.value : null;
              const adminPrimaryPayload =
                adminPrimaryResult.status === "fulfilled" ? adminPrimaryResult.value : null;
              const facilitatorPrimaryPayload =
                facilitatorPrimaryResult.status === "fulfilled" ? facilitatorPrimaryResult.value : null;
              const companyReviewPayload =
                companyReviewResult.status === "fulfilled" ? companyReviewResult.value : null;
              const adminReviewPayload =
                adminReviewResult.status === "fulfilled" ? adminReviewResult.value : null;
              const facilitatorReviewPayload =
                facilitatorReviewResult.status === "fulfilled" ? facilitatorReviewResult.value : null;
              const primaryPayload = mergePrimaryDataEndpointPayloads(
                mergePrimaryDataEndpointPayloads(
                  hasObjectValues(companyPrimaryPayload) ? companyPrimaryPayload : null,
                  hasObjectValues(adminPrimaryPayload) ? adminPrimaryPayload : null,
                ),
                hasObjectValues(facilitatorPrimaryPayload) ? facilitatorPrimaryPayload : null,
              );
              const reviewPayload = mergePrimaryDataEndpointPayloads(
                mergePrimaryDataEndpointPayloads(
                  hasObjectValues(companyReviewPayload) ? companyReviewPayload : null,
                  hasObjectValues(adminReviewPayload) ? adminReviewPayload : null,
                ),
                hasObjectValues(facilitatorReviewPayload) ? facilitatorReviewPayload : null,
              );
              const merged = mergePrimaryDataEndpointPayloads(
                hasObjectValues(primaryPayload) ? primaryPayload : null,
                hasObjectValues(reviewPayload) ? reviewPayload : null,
              );
              if (merged && Object.keys(merged).length > 0) {
                setPrimaryDataForm(merged);
                return;
              }
              setPrimaryDataForm(null);
            })
            .catch(() => {
              if (!cancelled) setPrimaryDataForm(null);
            });
          getCompanyProjectChecklistDocuments(projectId)
            .then((payload) => {
              if (!cancelled) setChecklistDocumentsData(payload);
            })
            .catch(() => {
              if (!cancelled) setChecklistDocumentsData(null);
            });
        } else {
          setContractDocument({});
          setProjectCodeAssignment(null);
          setLaunchTrainingData(null);
          setFinanceInvoicesData(null);
          setProformaApprovalData(null);
          setPrimaryDataForm(null);
          setChecklistDocumentsData(null);
          setFacilitatorAdminAssessors({ loaded: false, payload: null, failed: false });
          setFacilitatorAssessmentScoring({ loaded: false, payload: null, failed: false });
          setFacilitatorCertificateData({ loaded: false, payload: null, failed: false });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load quick view.");
        setQuickView({});
        setAssignments({});
        setContractDocument({});
        setFacilitatorRegistration(null);
        setProjectCodeAssignment(null);
        setLaunchTrainingData(null);
        setFinanceInvoicesData(null);
        setProformaApprovalData(null);
        setPrimaryDataForm(null);
        setChecklistDocumentsData(null);
        setFacilitatorAdminAssessors({ loaded: false, payload: null, failed: false });
        setFacilitatorAssessmentScoring({ loaded: false, payload: null, failed: false });
        setFacilitatorCertificateData({ loaded: false, payload: null, failed: false });
        setCoordinatorCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectId === "undefined") return;
    const checklistNotif = parseChecklistLatestStateFromNotifications(
      facilitatorNotificationsForFlow,
      projectId,
    );
    if (checklistNotif.state !== "none") {
      getCompanyProjectChecklistDocuments(projectId)
        .then((payload) => setChecklistDocumentsData(payload))
        .catch(() => {});
    }
  }, [facilitatorNotificationsForFlow, projectId]);

  const contractBinding = useMemo(() => bindContractQuickview(quickView), [quickView]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const company =
    (quickView.profile as Record<string, unknown> | undefined) ??
    (quickView.company as Record<string, unknown> | undefined) ??
    (quickView.project as Record<string, unknown> | undefined) ??
    quickView;
  const companyName = company.name ?? company.company_name ?? company.companyName;
  const companyRegId = company.reg_id ?? company.company_id ?? company.companyId;
  const projectCode = company.project_code ?? company.projectCode;
  const companyEmail = company.email ?? company.company_email;
  const companyMobile = company.mobile ?? company.mobileno ?? company.phone;
  const accountStatusValue = company.account_status ?? company.status;
  const accountStatusRaw =
    typeof accountStatusValue === "string" || typeof accountStatusValue === "number"
      ? String(accountStatusValue).toLowerCase()
      : "";
  let accountStatusLabel = "—";
  if (accountStatusRaw === "1" || accountStatusRaw === "active") {
    accountStatusLabel = "Active";
  } else if (accountStatusRaw) {
    accountStatusLabel = "Inactive";
  }
  const assignmentRoot = pickFirstRecord(assignments, [
    "assignment_details",
    "assignment",
    "data",
    "result",
  ]);
  const mergedAssignments = { ...assignments, ...assignmentRoot } as Record<string, unknown>;
  const coordinatorFromAssignments = pickFirstRecord(mergedAssignments, [
    "coordinators",
    "coordinator",
    "coordinator_details",
    "coordinator_detail",
    "assigned_coordinator",
  ]);
  const quickviewCoordinatorContainer = pickFirstRecord(quickView, ["companies_coordinator"]);
  const coordinatorFromQuickview = pickFirstRecord(quickviewCoordinatorContainer, [
    "Coordinator_Detail",
    "coordinator_detail",
    "coordinator",
  ]);
  const coordinator =
    Object.keys(coordinatorFromAssignments).length > 0
      ? coordinatorFromAssignments
      : coordinatorFromQuickview;
  const coordinatorId = toPlainString(coordinator.coordinator_id);
  const coordinatorEmail = toPlainString(coordinator.email).toLowerCase();
  const coordinatorName = toPlainString(coordinator.name).toLowerCase();
  const coordinatorCatalogMatch =
    coordinatorCatalog.find(
      (c) =>
        (coordinatorId ? toPlainString(c.id) === coordinatorId : false) ||
        (coordinatorEmail ? toPlainString(c.email).toLowerCase() === coordinatorEmail : false) ||
        (coordinatorName ? toPlainString(c.name).toLowerCase() === coordinatorName : false),
    ) ?? {};
  const coordinatorResolved = {
    ...coordinatorCatalogMatch,
    ...coordinator,
  } as Record<string, unknown>;
  const facilitator = pickFirstRecord(mergedAssignments, [
    "facilitator",
    "facilitator_details",
    "facilitator_detail",
    "assigned_facilitator",
  ]);
  const facilitatorFromRegistration = facilitatorRegistration
    ? pickFirstRecord(facilitatorRegistration, ["selected_facilitator", "selectedFacilitator", "facilitator"])
    : {};
  const facilitatorResolved = {
    ...facilitator,
    ...facilitatorFromRegistration,
    name:
      facilitatorFromRegistration.name ??
      facilitatorRegistration?.facilitator_name ??
      facilitatorRegistration?.facilitatorName ??
      facilitator.name,
    consultant_id:
      facilitatorFromRegistration.consultant_id ??
      facilitatorFromRegistration.consultant_code ??
      facilitatorFromRegistration.facilitator_code ??
      facilitatorRegistration?.facilitator_code ??
      facilitatorRegistration?.facilitatorCode ??
      facilitator.consultant_id,
  } as Record<string, unknown>;
  const quickviewAssessors = mapQuickviewAssessors(
    pickRecordList(quickView, ["companies_assessors"]),
  );
  const assignmentAssessors = pickRecordList(mergedAssignments, [
    "assessors",
    "assessor",
    "assessor_details",
    "assigned_assessors",
    "visit_details",
  ]);
  const assessors = quickviewAssessors.length > 0 ? quickviewAssessors : assignmentAssessors;
  const milestoneRows = toMilestoneList(quickView);
  const milestoneFlow =
    (quickView.milestone_flow as Record<string, unknown> | undefined) ??
    (quickView.milestoneFlow as Record<string, unknown> | undefined) ??
    {};
  const latestStep = milestoneFlow.latest_step ?? milestoneFlow.latestStep ?? quickView.latest_step ?? quickView.latestStep;
  const nextStep = milestoneFlow.next_step ?? milestoneFlow.nextStep ?? quickView.next_step ?? quickView.nextStep;
  const isFacilitatorProject = detectFacilitatorProject(quickView, pathname ?? "");
  const adminApprovedAssessorRows = pickRecordList(facilitatorAdminAssessors.payload ?? {}, [
    "data",
    "items",
    "rows",
    "result",
  ]);
  const facilitatorAssessorAssignmentDone =
    isFacilitatorProject &&
    facilitatorAdminAssessors.loaded &&
    hasMeaningfulAssignedAssessors(assessors) &&
    (adminApprovedAssessorRows.length > 0 || facilitatorAdminAssessors.failed);
  const facilitatorPreliminaryScoringDone =
    isFacilitatorProject &&
    facilitatorAssessmentScoring.loaded &&
    !facilitatorAssessmentScoring.failed &&
    hasFacilitatorPreliminaryScoringDone(facilitatorAssessmentScoring.payload);
  const facilitatorFinalScoringSubmitted =
    isFacilitatorProject &&
    facilitatorAssessmentScoring.loaded &&
    !facilitatorAssessmentScoring.failed &&
    hasFacilitatorFinalScoringSubmitted(facilitatorAssessmentScoring.payload);
  const facilitatorCertificateUploaded =
    isFacilitatorProject &&
    facilitatorCertificateData.loaded &&
    !facilitatorCertificateData.failed &&
    hasFacilitatorCertificateUploaded(facilitatorCertificateData.payload);
  const coordinatorAssigned = hasCoordinatorAssignedPayload(quickView, assignments);
  const primaryDataQuickviewReviewStatus = computePrimaryDataOverallReviewStatus(primaryDataForm, quickView);
  const primaryDataRejectionSignal = resolvePrimaryDataRejectionSignal(
    primaryDataForm,
    quickView,
    facilitatorNotificationsForFlow,
    projectId,
  );
  const primaryDataRejectedForFacilitator =
    isFacilitatorProject && primaryDataRejectionSignal.rejected;
  const hasPrimaryDataQuickviewSignals =
    Boolean(primaryDataForm) ||
    hasPrimaryDataFilledPayload(buildQuickViewPrimaryDataSource(quickView)) ||
    primaryDataQuickviewReviewStatus.allSectionsSubmitted ||
    primaryDataQuickviewReviewStatus.allSectionsAccepted;
  const flowStepsResolved = resolveFlowSteps(
    quickView,
    latestStep,
    nextStep,
    contractDocument,
    facilitatorRegistration,
    projectCodeAssignment,
    launchTrainingData,
    financeInvoicesData,
    proformaApprovalData,
    primaryDataForm,
    checklistDocumentsData,
    coordinatorAssigned,
    isFacilitatorProject,
    facilitatorAssessorAssignmentDone,
    facilitatorPreliminaryScoringDone,
    facilitatorFinalScoringSubmitted,
    facilitatorCertificateUploaded,
    facilitatorNotificationsForFlow,
    projectId,
  );
  let flowSteps = flowStepsResolved;
  if (isFacilitatorProject && primaryDataRejectedForFacilitator) {
    flowSteps = facilitatorPrimaryDataRejectedFlowSteps(
      primaryDataForm,
      quickView,
      facilitatorNotificationsForFlow,
      projectId,
    );
  } else if (hasPrimaryDataQuickviewSignals) {
    flowSteps = applyPrimaryDataQuickviewCompletionOverride(
      flowStepsResolved,
      primaryDataQuickviewReviewStatus,
      isFacilitatorProject,
      primaryDataForm,
      quickView,
      facilitatorNotificationsForFlow,
      projectId,
      checklistDocumentsData,
      facilitatorAssessorAssignmentDone,
      facilitatorPreliminaryScoringDone,
      facilitatorFinalScoringSubmitted,
      facilitatorCertificateUploaded,
      financeInvoicesData,
    );
  }
  if (isFacilitatorProject) {
    flowSteps = applyFacilitatorLaunchTrainingResponsibilityOverride(flowSteps);
    if (primaryDataRejectedForFacilitator) {
      flowSteps = facilitatorPrimaryDataRejectedFlowSteps(
        primaryDataForm,
        quickView,
        facilitatorNotificationsForFlow,
        projectId,
      );
    }
  }
  const facilitatorCertificateIssuedNextRow =
    isFacilitatorProject && flowSteps.next.activity === "Certificate has been issued";
  const facilitatorNextStepCardTitle = facilitatorCertificateIssuedNextRow ? "Certificate issued" : "Next Step";
  const facilitatorNextRowCellBase =
    facilitatorCertificateIssuedNextRow
      ? "border border-[#86efac] bg-[#dcfce7] px-3 py-3 text-[#166534]"
      : "border border-[#d9dde7] bg-[#fff700] px-3 py-3 text-[#4b5563]";
  const visibleMilestoneRows = milestoneRows
    .map((row, idx) => {
      const rowName =
        row.step_name ??
        row.name ??
        row.title ??
        row.milestone_name ??
        row.label ??
        `Step ${idx + 1}`;
      const rowStatus =
        row.status_label ??
        row.status ??
        row.state ??
        row.current_status ??
        "—";
      return { row, rowName, rowStatus, idx };
    })
    .filter((item) => hasDisplayValue(item.rowStatus));
  const showStepStatusSection = visibleMilestoneRows.length > 0;
  const showLatestNextStepSection = true;
  const showContractUploadCta =
    isFacilitatorProject && facilitatorShouldUploadContract(quickView, contractDocument);
  const contractDocumentHref = pathname?.includes("/facilitator/")
    ? `/facilitator/page-management/${encodeURIComponent(projectId)}/contract-document`
    : `/assessor/page-management/${encodeURIComponent(projectId)}/contract-document`;
  const showCoordinatorSection =
    hasDisplayValue(coordinatorResolved.name ?? coordinatorResolved.coordinator_name) ||
    hasDisplayValue(coordinatorResolved.email) ||
    hasDisplayValue(coordinatorResolved.mobile ?? coordinatorResolved.phone);
  const showFacilitatorSection = assessors.length > 0;
  const isFlow2 = isFacilitatorProject && isCiiAssignsFacilitatorFlow(quickView);
  const facilitatorFlowSteps: Array<{ label: string; aliases: string[]; responsibility: string }> = [
    { label: "Company Registered by Company", aliases: ["company registered by company", "company registered"], responsibility: "Company" },
    { label: "Company Filled Registration Info", aliases: ["company filled registration info", "registration filled"], responsibility: "Company" },
    { label: "Company Will Upload Contract Document", aliases: ["company will upload work order", "company will upload contract document", "contract document need to upload", "contract document upload", "upload contract document"], responsibility: "Company" },
    { label: "Contract document review", aliases: ["contract document review", "contract review", "contract rejected", "re upload contract", "re-upload contract"], responsibility: "CII" },
    { label: "Contract has been approved", aliases: ["contract has been approved", "contract approved"], responsibility: "Admin" },
    { label: "CII to upload PO amount", aliases: ["cii to upload po amount", "upload po amount"], responsibility: "CII" },
    { label: "Project code need to upload by CII", aliases: ["project code need to upload by cii", "project code need to upload"], responsibility: "CII" },
    { label: "Assign project coordinator", aliases: ["assign project coordinator", "project coordinator assigned"], responsibility: "CII" },
    {
      label: "Launch and training program need to be done by facilitator",
      aliases: [
        "launch and training",
        "launch training",
        "launch and training need to be submitted by consultant",
        "launch and training need to be submitted by facilitator",
        "launch and training submitted by consultant",
        "launch and training submitted by facilitator",
      ],
      responsibility: "Facilitator",
    },
    {
      label: "2nd proforma invoice is done",
      aliases: [
        "2nd proforma invoice is done",
        "2nd proforma invoice uploaded",
        "2nd proforma need to be uploaded",
        "proforma invoice uploaded by cii",
      ],
      responsibility: "CII",
    },
    {
      label: "Supporting documents need to be uploaded by Facilitator",
      aliases: [
        "supporting documents need to be uploaded by facilitator",
        "supporting documents need to be uploaded",
        "consultant to upload supporting document",
      ],
      responsibility: "Facilitator",
    },
    {
      label: "Supporting documents uploaded by Facilitator",
      aliases: [
        "supporting documents uploaded by facilitator",
        "supporting documents uploaded",
        "facilitator uploaded supporting documents",
      ],
      responsibility: "Facilitator",
    },
    {
      label: "CII needs to review supporting documents",
      aliases: [
        "cii needs to review supporting documents",
        "awaiting cii review",
        "cii review supporting documents",
      ],
      responsibility: "CII",
    },
    {
      label: "Supporting documents rejected by CII",
      aliases: [
        "supporting documents rejected by cii",
        "supporting documents rejected",
        "cii rejected supporting documents",
        "rejected supporting document",
      ],
      responsibility: "CII",
    },
    {
      label: "Facilitator needs to re-upload supporting documents",
      aliases: [
        "facilitator needs to re-upload supporting documents",
        "facilitator re-upload supporting documents",
        "re-upload supporting documents",
      ],
      responsibility: "Facilitator",
    },
    {
      label: "Facilitator re-uploaded supporting documents",
      aliases: [
        "facilitator re-uploaded supporting documents",
        "re-uploaded supporting documents",
      ],
      responsibility: "Facilitator",
    },
    {
      label: "CII needs to review re-uploaded supporting documents",
      aliases: [
        "cii needs to review re-uploaded supporting documents",
        "review re-uploaded supporting documents",
      ],
      responsibility: "CII",
    },
    {
      label: "Supporting documents approved by CII",
      aliases: [
        "supporting documents approved by cii",
        "supporting documents approved",
        "approved supporting documents",
      ],
      responsibility: "CII",
    },
    {
      label: "2nd invoice payment done by consultant",
      aliases: [
        "2nd invoice payment done by consultant",
        "proforma invoice payment done by consultant",
        "tax invoice payment done by consultant",
        "invoice payment done by consultant",
        "proforma invoice",
        "pi tax invoice",
      ],
      responsibility: "Consultant",
    },
    { label: "Supporting document needs to be uploaded", aliases: ["supporting document needs to be uploaded", "supporting document"], responsibility: "Consultant" },
    {
      label: "Proforma invoice approved by Admin (first invoice)",
      aliases: [
        "proforma invoice approved by admin (first invoice)",
        "tax invoice approved by admin (first invoice)",
        "invoice approved by admin (first invoice)",
        "first proforma invoice approved by admin",
        "proforma invoice approved by admin",
      ],
      responsibility: "Admin",
    },
    {
      label: "2nd invoice needs to be approved or rejected by Admin",
      aliases: [
        "2nd invoice needs to be approved or rejected by admin",
        "proforma invoice needs to be approved or rejected by admin",
        "tax invoice needs to be approved or rejected by admin",
        "invoice needs to be approved or rejected by admin",
        "approve reject the proforma invoice",
        "cii need to approve reject",
      ],
      responsibility: "Admin",
    },
    {
      label: "2nd payment has been rejected by CII",
      aliases: [
        "2nd payment has been rejected by cii",
        "proforma invoice payment has been rejected by cii",
        "tax invoice payment has been rejected by cii",
        "payment rejected by cii",
        "rejected",
      ],
      responsibility: "CII",
    },
    {
      label: "2nd payment needs to be re-uploaded by consultant",
      aliases: [
        "2nd payment needs to be re-uploaded by consultant",
        "proforma invoice payment proof needs to be re-uploaded by consultant",
        "tax invoice payment proof needs to be re-uploaded by consultant",
        "re-upload payment by consultant",
        "payment reupload",
      ],
      responsibility: "Consultant",
    },
    {
      label: "2nd invoice re-upload has been done",
      aliases: [
        "2nd invoice re-upload has been done",
        "proforma invoice payment re-upload has been done",
        "tax invoice payment re-upload has been done",
        "invoice reupload done",
        "payment reupload done",
      ],
      responsibility: "Consultant",
    },
    { label: "CII need to re-verify and approve or reject the payment", aliases: ["cii need to re-verify and approve or reject the payment", "reverify and approve or reject payment", "re verify payment"], responsibility: "CII" },
    {
      label: "Re-uploaded 2nd invoice has been accepted",
      aliases: [
        "re-uploaded 2nd invoice has been accepted",
        "re-uploaded proforma invoice has been accepted",
        "re-uploaded tax invoice has been accepted",
        "2nd invoice accepted after reupload",
        "reupload accepted",
      ],
      responsibility: "CII",
    },
    { label: "Plaque and PQ need to be raised by CII", aliases: ["plaque and pq need to be raised by cii", "plaque and pq", "pq raised by cii"], responsibility: "CII" },
    { label: "Plaque and PR has been done", aliases: ["plaque and pr has been done", "plaque and pr done", "pr done"], responsibility: "CII" },
    { label: "Feedback report need to upload by CII", aliases: ["feedback report need to upload by cii", "feedback report upload", "feedback report"], responsibility: "CII" },
    { label: "Feedback done by CII", aliases: ["feedback done by cii", "feedback uploaded", "feedback report done"], responsibility: "CII" },
    { label: "Certificate has been issued", aliases: ["certificate has been issued", "certificate issued", "certificate is issued"], responsibility: "CII" },
    {
      label: "Admin Accepted Primary Data Form",
      aliases: ["admin accepted primary data form", "admin accepted primary data"],
      responsibility: "CII",
    },
    {
      label: "All Assessment Submittals to be uploaded",
      aliases: [
        "all assessment submittals to be uploaded",
        "all assessment submittals",
        "assessment submittals to be uploaded",
      ],
      responsibility: "Company",
    },
    {
      label: "Company Uploaded All Primary Data",
      aliases: ["company uploaded all primary data", "uploaded all primary data"],
      responsibility: "Company",
    },
    {
      label: "Admin Need to Accept Primary Data",
      aliases: ["admin need to accept primary data", "admin need to accept primary data form"],
      responsibility: "Admin",
    },
    { label: "Company needs to upload primary data form", aliases: ["company needs to upload primary data form", "primary data form"], responsibility: "Company" },
    { label: "CII accept or reject primary data form", aliases: ["cii accept or reject primary data form", "primary data accepted", "primary data rejected"], responsibility: "CII" },
  ];
  const flow2FlowSteps: Array<{ label: string; aliases: string[]; responsibility: string }> = [
    { label: "Company Registered", aliases: ["company registered by company", "company registered"], responsibility: "Company" },
    { label: "Company Filled Registration Info", aliases: ["company filled registration info", "registration filled", "fill registration info"], responsibility: "Company" },
    { label: "CII Uploaded Proposal Document", aliases: ["cii uploaded proposal document", "cii will upload proposal document", "proposal document"], responsibility: "CII" },
    { label: "Company Uploaded Work Order Document", aliases: ["company uploaded work order", "company will upload work order", "work order document", "work order uploaded"], responsibility: "Company" },
    { label: "Work Order / Contract Document Accepted", aliases: ["work order accepted", "work order contract document accepted", "cii will approve reject work order", "cii approved work order"], responsibility: "CII" },
    { label: "CII provided Project Code", aliases: ["cii provided project code", "upload project code", "project code"], responsibility: "CII" },
    { label: "Assign Project Co-Ordinator", aliases: ["assign project coordinator", "project coordinator assigned", "assign project co-ordinator"], responsibility: "CII" },
    { label: "CII uploaded the PI/Tax Invoice", aliases: ["cii uploaded pi tax invoice", "cii to upload the pi tax invoice", "pi tax invoice uploaded", "pi tax invoice"], responsibility: "CII" },
    { label: "Consultant Uploaded Site Visit Report", aliases: ["consultant uploaded site visit report", "consultant will upload site visit report", "site visit report"], responsibility: "Consultant" },
    { label: "CII Assigned A Facilitator", aliases: ["cii assigned a facilitator", "cii will assign a facilitator", "facilitator assigned", "assign facilitator"], responsibility: "CII" },
    { label: "Facilitator Uploaded Signed Contract Fee Document", aliases: ["facilitator uploaded signed contract fee document", "facilitator will upload signed contract fee document", "signed contract fee document", "contract fee document"], responsibility: "Facilitator" },
    { label: "CII Accepted Fee Contract Document", aliases: ["cii accepted fee contract document", "cii will acknowledge signed contract fee document", "cii acknowledge contract fee", "fee contract document accepted", "cii disapproved contract fee document"], responsibility: "CII" },
    { label: "Consultant/Company Paid 1st Proforma Invoice", aliases: ["consultant company paid 1st proforma invoice", "1st proforma invoice", "consultant company will make payment", "payment done"], responsibility: "Consultant/Company" },
    { label: "CII Acknowledged Proforma Invoice", aliases: ["cii acknowledged proforma invoice", "cii will acknowledge proforma invoice", "proforma invoice acknowledged"], responsibility: "CII" },
    { label: "Company Uploaded All Primary Data", aliases: ["company uploaded all primary data", "uploaded all primary data", "need to upload primary data form", "primary data form"], responsibility: "Company" },
    { label: "CII Approved All Primary Data", aliases: ["cii approved all primary data", "cii need to accept primary data", "cii accepted primary data", "primary data accepted"], responsibility: "CII" },
    { label: "All Assessment Submittals Uploaded", aliases: ["all assessment submittals uploaded", "all checklist documents uploaded", "all assessment submittals to be uploaded", "assessment submittals"], responsibility: "Company" },
    { label: "CII Approved All Assessment Submittals", aliases: ["cii approved all assessment submittals", "cii will approve all checklist documents", "assessment submittals approved"], responsibility: "CII" },
    { label: "CII Assigned an Assessor", aliases: ["cii assigned an assessor", "cii will assign assessor", "assessor assigned"], responsibility: "CII" },
    { label: "Preliminary Scoring Submitted by CII", aliases: ["preliminary scoring submitted by cii", "preliminary scoring to be submitted by cii", "preliminary scoring"], responsibility: "CII" },
    { label: "Final Scoring Submitted (Rating Declaration)", aliases: ["final scoring submitted", "final scoring is submitted", "final scoring is to be submitted", "rating declaration"], responsibility: "Assessor" },
    { label: "CII Uploaded Certificate", aliases: ["cii uploaded certificate", "cii will upload certificate", "certificate uploaded"], responsibility: "CII" },
    { label: "CII Uploaded 2nd Proforma Invoice", aliases: ["cii uploaded 2nd proforma invoice", "cii will raise 2nd proforma invoice", "2nd proforma invoice"], responsibility: "CII" },
    { label: "2nd Proforma Invoice Payment by Consultant/Company", aliases: ["2nd proforma invoice payment", "consultant company will make payment", "2nd proforma payment"], responsibility: "Consultant/Company" },
    { label: "CII Accepted 2nd Proforma Invoice", aliases: ["cii accepted 2nd proforma invoice", "cii will acknowledge 2nd proforma invoice", "2nd proforma invoice acknowledged"], responsibility: "CII" },
    { label: "CII Dispatched Plaque & Certificate", aliases: ["cii dispatched plaque", "plaque and pr data", "plaque and pr has been done", "plaque dispatched"], responsibility: "CII" },
    { label: "CII Uploaded Feedback Report", aliases: ["cii uploaded feedback report", "cii will upload feedback report", "feedback report", "feedback done by cii"], responsibility: "CII" },
  ];
  const activeFlowSteps = isFlow2 ? flow2FlowSteps : facilitatorFlowSteps;
  const normalizedLatest = normalizeStepText(flowSteps.latest.activity);
  const normalizedNext = normalizeStepText(flowSteps.next.activity);
  const matchesStep = (step: { label: string; aliases: string[] }, normalizedInput: string): boolean => {
    if (!normalizedInput) return false;
    const candidates = [step.label, ...step.aliases].map(normalizeStepText);
    return candidates.some((candidate) =>
      candidate.includes(normalizedInput) ||
      normalizedInput.includes(candidate) ||
      normalizedInput.split(" ").filter(Boolean).every((token) => candidate.includes(token))
    );
  };
  const latestIndex = activeFlowSteps.findIndex((step) => matchesStep(step, normalizedLatest));
  const nextIndex = activeFlowSteps.findIndex((step) => matchesStep(step, normalizedNext));
  const resolvedLatestIndex = latestIndex >= 0 ? latestIndex : Math.max(0, nextIndex - 1);
  const resolvedNextIndex = nextIndex >= 0 ? nextIndex : Math.min(resolvedLatestIndex + 1, activeFlowSteps.length - 1);
  const facilitatorActivityLog = isFacilitatorProject
    ? activeFlowSteps.map((step, idx) => {
        if (idx < resolvedNextIndex) {
          return { title: step.label, subtitle: `Completed • ${step.responsibility}`, state: "done" as const };
        }
        if (idx === resolvedNextIndex) {
          return { title: step.label, subtitle: `${flowSteps.next.status} • ${flowSteps.next.responsibility}`, state: "pending" as const };
        }
        return { title: step.label, subtitle: "Upcoming", state: "upcoming" as const };
      })
    : [];
  const facilitatorMilestones = isFacilitatorProject
    ? activeFlowSteps.map((step, idx) => ({ label: step.label, done: idx <= resolvedLatestIndex }))
    : [];

  return (
    <div className="space-y-2">
      <div className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Company Details">
          <KVRow label="Company Name" value={companyName} hidePlaceholder />
          <KVRow label="Company ID" value={companyRegId} hidePlaceholder />
          <KVRow label="Project ID" value={projectId} hidePlaceholder />
          <KVRow label="Project Code" value={projectCode} hidePlaceholder />
          <KVRow label="Email" value={companyEmail} hidePlaceholder />
          <KVRow label="Mobile Number" value={companyMobile} hidePlaceholder />
          <KVRow label="Turnover Of The Unit" value={company.turnover} hidePlaceholder />
          <KVRow label="Account Status" value={accountStatusLabel} hidePlaceholder />
          <KVRow
            label="Activation Date"
            value={formatDateDDMMYYYY(
              company.activationDate ??
                company.activation_date ??
                company.status_updated_at ??
                company.created_at,
            )}
            hidePlaceholder
          />
        </SectionCard>

        <SectionCard title="Facilitator Details">
          <KVRow label="Name" value={facilitatorResolved.name ?? facilitatorResolved.facilitator_name} hidePlaceholder />
          <KVRow
            label="Facilitator Code"
            value={
              facilitatorResolved.consultant_id ??
              facilitatorResolved.consultant_code ??
              facilitatorResolved.facilitator_code
            }
            hidePlaceholder
          />
          <KVRow label="Email" value={facilitatorResolved.email} hidePlaceholder />
          <KVRow label="Mobile Number" value={facilitatorResolved.mobile} hidePlaceholder />
          <KVRow label="State" value={facilitatorResolved.state} hidePlaceholder />
          <KVRow label="City" value={facilitatorResolved.city} hidePlaceholder />
          <KVRow label="Address" value={facilitatorResolved.address_line_1 ?? facilitatorResolved.addressLine1} hidePlaceholder />
          <KVRow label="Pincode" value={facilitatorResolved.pincode} hidePlaceholder />
          <KVRow
            label="Industry Category"
            value={facilitatorResolved.industry_category ?? facilitatorResolved.industryCategory}
            hidePlaceholder
          />
        </SectionCard>
      </div>

      {!isFacilitatorProject && (showStepStatusSection || showLatestNextStepSection) ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {showStepStatusSection && (
            <SectionCard title="Step Status">
              <div className="space-y-2">
                {visibleMilestoneRows.map(({ rowName, rowStatus, idx }) => {
                  return (
                    <div key={`${textValue(rowName)}-${idx}`} className="rounded border border-[#e7ecf3] bg-white px-3 py-2">
                      <KVRow label={textValue(rowName)} value={rowStatus} hidePlaceholder />
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {showLatestNextStepSection && (
            <SectionCard title="Latest / Next Step">
              {contractBinding.mode === "facilitator_contract" && contractBinding.instruction ? (
                <p className="mb-3 rounded border border-[#d5e8dc] bg-[#f4faf6] px-3 py-2 text-xs text-[#2d6a3e]">
                  {contractBinding.instruction}
                </p>
              ) : null}
              <KVRow
                label="Latest Step"
                value={`${flowSteps.latest.activity} (${flowSteps.latest.status} - ${flowSteps.latest.responsibility})`}
                hidePlaceholder
              />
              <KVRow
                label="Next Step"
                value={`${flowSteps.next.activity} (${flowSteps.next.status} - ${flowSteps.next.responsibility})`}
                hidePlaceholder
              />
            </SectionCard>
          )}
        </div>
      ) : null}

      {showContractUploadCta ? (
        <div className="rounded border border-[#b8dfc9] bg-[#f4faf6] px-4 py-3">
          <p className="text-sm font-medium text-[#2d6a3e]">
            Upload your signed contract (PDF, max 10MB) on the Contract Document tab.
          </p>
          <Link
            href={contractDocumentHref}
            className="mt-2 inline-flex rounded bg-[#2f8f4e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#267641]"
          >
            Open Contract Document →
          </Link>
        </div>
      ) : null}

      {isFacilitatorProject && showLatestNextStepSection ? (
        <div className="space-y-3">
          {facilitatorCertificateIssuedNextRow ? (
            <div className="grid items-start gap-3 xl:grid-cols-2">
              <SectionCard title="Latest Step Completed">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                        <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Activity</th>
                        <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Status</th>
                        <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Responsibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-[#d9dde7] px-3 py-3 font-medium text-[#4b5563]">
                          {flowSteps.latest.activity}
                        </td>
                        <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">
                          {flowSteps.latest.status}
                        </td>
                        <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">
                          {flowSteps.latest.responsibility}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <div className="self-start rounded border border-[#047857] bg-[#047857] px-3 py-1.5 text-xs font-semibold leading-tight text-white">
                Certification Completed By Greenco Team.
              </div>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
                <SectionCard title="Latest Step Completed">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Activity</th>
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Status</th>
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Responsibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-[#d9dde7] px-3 py-3 font-medium text-[#4b5563]">{flowSteps.latest.activity}</td>
                          <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">{flowSteps.latest.status}</td>
                          <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">{flowSteps.latest.responsibility}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title={facilitatorNextStepCardTitle}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Activity</th>
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Status</th>
                          <th className="border border-[#d9dde7] bg-[#f3f4f8] px-3 py-2">Responsibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className={`font-medium ${facilitatorNextRowCellBase}`}>{flowSteps.next.activity}</td>
                          <td className={facilitatorNextRowCellBase}>{flowSteps.next.status}</td>
                          <td className={facilitatorNextRowCellBase}>{flowSteps.next.responsibility}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
            </div>
          )}
        </div>
      ) : null}

      {(showCoordinatorSection || showFacilitatorSection) && (
        <div className="grid gap-3 xl:grid-cols-2">
          {showCoordinatorSection && (
            <SectionCard title="Co-ordinator Details">
              <KVRow label="Name" value={coordinatorResolved.name ?? coordinatorResolved.coordinator_name} hidePlaceholder />
              <KVRow label="Email" value={coordinatorResolved.email} hidePlaceholder />
              <KVRow label="Mobile Number" value={coordinatorResolved.mobile ?? coordinatorResolved.phone} hidePlaceholder />
            </SectionCard>
          )}

          {showFacilitatorSection && (
            <SectionCard title="Facilitator Details">
            <div className="space-y-2">
                {assessors.slice(0, 2).map((assessor, idx) => (
                  <div key={`${textValue(assessor.name ?? assessor.assessor_name)}-${idx}`} className={idx > 0 ? "border-t border-[#eef2f7] pt-3" : ""}>
                    <KVRow label="Name" value={assessor?.name ?? assessor?.assessor_name} hidePlaceholder />
                    <KVRow label="Email" value={assessor?.email} hidePlaceholder />
                    <KVRow
                      label="Site Visit Date"
                      value={(() => {
                        const dates =
                          assessor?.visit_dates ??
                          assessor?.visitDate ??
                          assessor?.visit_date ??
                          assessor?.site_visit_date;
                        if (Array.isArray(dates)) {
                          return dates.map((d) => formatDateDDMMYYYY(d)).join(", ");
                        }
                        return formatDateDDMMYYYY(dates);
                      })()}
                      hidePlaceholder
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {isFacilitatorProject ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <SectionCard title="Company Activity Log">
            <div className="space-y-0">
              {facilitatorActivityLog.map((entry, idx) => (
                <div key={`${entry.title}-${idx}`} className="relative flex items-start gap-3 pb-3 last:pb-0">
                  {idx < facilitatorActivityLog.length - 1 ? (
                    <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[#cfd8e3]" />
                  ) : null}
                  <span
                    className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      entry.state === "done" ? "bg-[#22c55e]" : entry.state === "pending" ? "bg-[#f59e0b]" : "bg-[#cbd5e1]"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2f3a46]">{entry.title}</p>
                    <p className="text-xs text-[#6b7280]">{entry.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Company Milestone Flow">
            <div className="space-y-0">
              {facilitatorMilestones.map((entry, idx) => (
                <div key={`${entry.label}-${idx}`} className="relative flex items-start gap-3 pb-3 last:pb-0">
                  {idx < facilitatorMilestones.length - 1 ? (
                    <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[#cfd8e3]" />
                  ) : null}
                  <span
                    className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      entry.done ? "bg-[#22c55e]" : "bg-[#cbd5e1]"
                    }`}
                  />
                  <p className={`text-sm ${entry.done ? "text-[#2f3a46]" : "text-[#64748b]"}`}>{entry.label}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

