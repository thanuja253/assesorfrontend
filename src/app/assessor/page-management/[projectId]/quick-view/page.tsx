"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getFacilitatorFinanceInvoices,
  getFacilitatorFinanceInvoiceApprovalStatus,
  getFacilitatorProjectLaunchTraining,
  getCompanyProjectPrimaryData,
  getCompanyProjectFacilitatorRegistrationInfo,
  getCompanyProjectProjectCode,
  getCompanyProjectWorkOrderDocument,
  getCompanyCoordinators,
  getCompanyProjectAssignments,
  getCompanyProjectQuickView,
} from "@/lib/assessor-project-api";
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

function hasPrimaryDataFilledPayload(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== "object") return false;
  const savedByInfoType = data.saved_by_info_type;
  if (savedByInfoType && typeof savedByInfoType === "object" && !Array.isArray(savedByInfoType)) {
    const rec = savedByInfoType as Record<string, unknown>;
    const hasAnySectionRows = Object.values(rec).some((value) => Array.isArray(value) && value.length > 0);
    if (hasAnySectionRows) return true;
  }
  const savedByDataId = data.saved_by_data_id;
  if (savedByDataId && typeof savedByDataId === "object" && !Array.isArray(savedByDataId)) {
    return Object.keys(savedByDataId as Record<string, unknown>).length > 0;
  }
  return false;
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
  coordinatorAssigned: boolean,
  isFacilitatorProject: boolean,
): {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
} {
  const contractRoot =
    (contractDocument.data as Record<string, unknown> | undefined) ??
    contractDocument;
  const latestStepDetail = toStepDetail(latestStep);
  const nextStepDetail = toStepDetail(nextStep);
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
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
                const isProformaRejected =
                  approvalStatusText === "2" ||
                  approvalStatusText === "rejected" ||
                  approvalLabelText.includes("rejected");
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
                  if (hasPrimaryDataFilledPayload(primaryDataForm)) {
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
                  return {
                    latest: {
                      activity: "Consultant paid proforma invoice",
                      status: "Completed",
                      responsibility: "Consultant",
                    },
                    next: {
                      activity: "CII need to approve/reject the proforma invoice",
                      status: "Pending",
                      responsibility: "CII",
                    },
                  };
                }
                return {
                  latest: {
                    activity: "CII uploaded the proforma invoice",
                    status: "Completed",
                    responsibility: "CII",
                  },
                  next: {
                    activity: "Supporting document needs to be uploaded by consultant",
                    status: "Pending",
                    responsibility: "Consultant",
                  },
                };
              }
              return {
                latest: {
                  activity: "Launch and training submitted by consultant",
                  status: "Completed",
                  responsibility: "Consultant",
                },
                next: {
                  activity: "PII need to be done by consultant",
                  status: "Pending",
                  responsibility: "Consultant",
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
                activity: "Launch and training need to be submitted by consultant",
                status: "Pending",
                responsibility: "Consultant",
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
    if (isFacilitatorProject) {
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
  const [coordinatorCatalog, setCoordinatorCatalog] = useState<Record<string, unknown>[]>([]);

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
      setCoordinatorCatalog([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    void Promise.all([
      getCompanyProjectQuickView(projectId),
      getCompanyProjectAssignments(projectId),
      getCompanyCoordinators(),
    ])
      .then(([quickViewPayload, assignmentsPayload, coordinatorsPayload]) => {
        if (cancelled) return;
        setQuickView(quickViewPayload);
        setAssignments(assignmentsPayload);
        const list = pickRecordList(coordinatorsPayload, ["items", "rows", "data", "coordinators", "result"]);
        setCoordinatorCatalog(list);
        if (detectFacilitatorProject(quickViewPayload, pathname ?? "")) {
          getCompanyProjectFacilitatorRegistrationInfo(projectId)
            .then((regPayload) => {
              if (!cancelled) setFacilitatorRegistration(regPayload);
            })
            .catch(() => {
              if (!cancelled) setFacilitatorRegistration(null);
            });
          getCompanyProjectWorkOrderDocument(projectId)
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
              setFinanceInvoicesData(payload);
              const invoicesRaw = payload.invoices;
              const invoices = Array.isArray(invoicesRaw) ? invoicesRaw : [];
              const proformaInvoice = invoices.find((item) => {
                if (!item || typeof item !== "object") return false;
                const rec = item as Record<string, unknown>;
                const typeRaw = rec.invoice_type ?? rec.invoiceType ?? rec.payment_for_label;
                const typeText =
                  typeof typeRaw === "string" || typeof typeRaw === "number"
                    ? String(typeRaw).trim().toLowerCase()
                    : "";
                return typeText.includes("proforma") || typeText.includes("pro forma");
              }) as Record<string, unknown> | undefined;
              const proformaIdRaw = proformaInvoice?.id ?? proformaInvoice?._id ?? proformaInvoice?.invoice_id;
              const proformaId =
                typeof proformaIdRaw === "string" || typeof proformaIdRaw === "number"
                  ? String(proformaIdRaw).trim()
                  : "";
              if (!proformaId) {
                setProformaApprovalData(null);
                return;
              }
              getFacilitatorFinanceInvoiceApprovalStatus(projectId, proformaId, "proforma")
                .then((approvalPayload) => {
                  if (!cancelled) setProformaApprovalData(approvalPayload);
                })
                .catch(() => {
                  if (!cancelled) setProformaApprovalData(null);
                });
            })
            .catch(() => {
              if (!cancelled) {
                setFinanceInvoicesData(null);
                setProformaApprovalData(null);
              }
            });
          getCompanyProjectPrimaryData(projectId)
            .then((payload) => {
              if (!cancelled) setPrimaryDataForm(payload);
            })
            .catch(() => {
              if (!cancelled) setPrimaryDataForm(null);
            });
        } else {
          setFacilitatorRegistration(null);
          setContractDocument({});
          setProjectCodeAssignment(null);
          setLaunchTrainingData(null);
          setFinanceInvoicesData(null);
          setProformaApprovalData(null);
          setPrimaryDataForm(null);
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
        setCoordinatorCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
  const coordinatorAssigned = hasCoordinatorAssignedPayload(quickView, assignments);
  const flowSteps = resolveFlowSteps(
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
    coordinatorAssigned,
    isFacilitatorProject,
  );
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
  const showCoordinatorSection =
    hasDisplayValue(coordinatorResolved.name ?? coordinatorResolved.coordinator_name) ||
    hasDisplayValue(coordinatorResolved.email) ||
    hasDisplayValue(coordinatorResolved.mobile ?? coordinatorResolved.phone);
  const showFacilitatorSection = assessors.length > 0;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Company Details">
          <KVRow label="Company Name" value={companyName} />
          <KVRow label="Company ID" value={companyRegId} />
          <KVRow label="Project ID" value={projectId} />
          <KVRow label="Project Code" value={projectCode} />
          <KVRow label="Email" value={companyEmail} />
          <KVRow label="Mobile Number" value={companyMobile} />
          <KVRow label="Turnover Of The Unit" value={company.turnover} />
          <KVRow label="Account Status" value={accountStatusLabel} />
          <KVRow
            label="Activation Date"
            value={formatDateDDMMYYYY(
              company.activationDate ??
                company.activation_date ??
                company.status_updated_at ??
                company.created_at,
            )}
          />
        </SectionCard>

        <SectionCard title="Facilitator Details">
          <p className="text-sm text-[#2d3746]">
            {textValue(facilitator.name ?? facilitator.message ?? "Facilitator assigned by Greenco Team")}
          </p>
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
                      <KVRow label={textValue(rowName)} value={rowStatus} />
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {showLatestNextStepSection && (
            <SectionCard title="Latest / Next Step">
              <KVRow
                label="Latest Step"
                value={`${flowSteps.latest.activity} (${flowSteps.latest.status} - ${flowSteps.latest.responsibility})`}
              />
              <KVRow
                label="Next Step"
                value={`${flowSteps.next.activity} (${flowSteps.next.status} - ${flowSteps.next.responsibility})`}
              />
            </SectionCard>
          )}
        </div>
      ) : null}

      {isFacilitatorProject && (showStepStatusSection || showLatestNextStepSection) ? (
        <div className="space-y-3">
          {showStepStatusSection ? (
            <SectionCard title="Step Status">
              <div className="space-y-2">
                {visibleMilestoneRows.map(({ rowName, rowStatus, idx }) => {
                  return (
                    <div key={`${textValue(rowName)}-${idx}`} className="rounded border border-[#e7ecf3] bg-white px-3 py-2">
                      <KVRow label={textValue(rowName)} value={rowStatus} />
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}

          {showLatestNextStepSection ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <SectionCard title="Latest Step Completed">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
                        <th className="py-2 pr-3">Activity</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Responsibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#f1f5f9]">
                        <td className="py-3 pr-3 font-medium text-[#1e293b]">{flowSteps.latest.activity}</td>
                        <td className="py-3 pr-3 text-[#334155]">{flowSteps.latest.status}</td>
                        <td className="py-3 text-[#334155]">{flowSteps.latest.responsibility}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard
                title="Next Step"
                action={
                  flowSteps.next.responsibility === "Facilitator" ? (
                    <span className="rounded-full bg-[#e0f2fe] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0369a1]">
                      Facilitator step
                    </span>
                  ) : undefined
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
                        <th className="py-2 pr-3">Activity</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Responsibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-[#fffbeb]">
                        <td className="py-3 pr-3 font-medium text-[#1e293b]">{flowSteps.next.activity}</td>
                        <td className="py-3 pr-3 text-[#334155]">{flowSteps.next.status}</td>
                        <td className="py-3 text-[#334155]">{flowSteps.next.responsibility}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {flowSteps.next.responsibility === "Facilitator" ? (
                  <p className="mt-4 text-sm text-[#64748b]">
                    No immediate action is required from you. This step will be carried out by{" "}
                    <span className="font-semibold text-[#334155]">Facilitator</span>.
                  </p>
                ) : null}
              </SectionCard>
            </div>
          ) : null}
        </div>
      ) : null}

      {(showCoordinatorSection || showFacilitatorSection) && (
        <div className="grid gap-3 xl:grid-cols-2">
          {showCoordinatorSection && (
            <SectionCard title="Co-ordinator Details">
              <KVRow label="Name" value={coordinatorResolved.name ?? coordinatorResolved.coordinator_name} />
              <KVRow label="Email" value={coordinatorResolved.email} />
              <KVRow label="Mobile Number" value={coordinatorResolved.mobile ?? coordinatorResolved.phone} />
            </SectionCard>
          )}

          {showFacilitatorSection && (
            <SectionCard title="Facilitator Details">
            <div className="space-y-2">
                {assessors.slice(0, 2).map((assessor, idx) => (
                  <div key={`${textValue(assessor.name ?? assessor.assessor_name)}-${idx}`} className={idx > 0 ? "border-t border-[#eef2f7] pt-3" : ""}>
                    <KVRow label="Name" value={assessor?.name ?? assessor?.assessor_name} />
                    <KVRow label="Email" value={assessor?.email} />
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
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

