"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { refreshAssessorNotifications } from "@/lib/assessor-notifications-api";
import {
  getAdminProjectRegistrationData,
  getCompanyCoordinators,
  getCompanyProjectFacilitatorRegistrationInfo,
  loadProjectHybridContext,
} from "@/lib/assessor-project-api";
import {
  buildStepperFromWorkflow,
  resolveHybridStepIndex,
  shouldShowAddFacilitator,
  workflowStepPairFromStatus,
  type HybridContext,
} from "@/lib/hybrid-workflow";
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

/* ─── Flow 2: CII assigns facilitator — step resolution engine ─── */

type FlowStepPair = {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
};

function resolveActivityId(quickView: Record<string, unknown>): number | null {
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
    milestoneFlow.current_activity_id,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isCiiAssignsFacilitatorFlow(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const mf = (quickView.milestone_flow as Record<string, unknown> | undefined) ?? {};
  const flowCandidates: unknown[] = [
    profile.flow_type, profile.flowType, profile.flow_id, profile.flowId,
    project.flow_type, project.flowType, project.flow_id, project.flowId,
    company.flow_type, company.flowType, company.flow_id, company.flowId,
    quickView.flow_type, quickView.flowType, quickView.flow_id, quickView.flowId,
    mf.flow_type, mf.flowType,
  ];
  for (const c of flowCandidates) {
    const t = typeof c === "string" || typeof c === "number" ? String(c).trim() : "";
    if (t === "2") return true;
  }
  const aid = resolveActivityId(quickView);
  if (aid !== null && aid >= 62 && aid <= 66) return true;
  return false;
}

function hasRejectionSignal(quickView: Record<string, unknown>, keys: string[]): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  for (const key of keys) {
    const raw = profile[key] ?? quickView[key];
    const t = typeof raw === "string" || typeof raw === "number" ? String(raw).trim().toLowerCase() : "";
    if (t.includes("reject") || t === "2") return true;
  }
  return false;
}

function resolveFlow2Steps(quickView: Record<string, unknown>): FlowStepPair | null {
  const aid = resolveActivityId(quickView);
  if (aid === null) return null;

  switch (aid) {
    case 1: return {
      latest: { activity: "Company Registered", status: "Completed", responsibility: "Company" },
      next: { activity: "Fill Registration Info", status: "Pending", responsibility: "Company" },
    };
    case 2: return {
      latest: { activity: "Company Filled Registration Info", status: "Completed", responsibility: "Company" },
      next: { activity: "CII will Upload Proposal Document", status: "Pending", responsibility: "CII" },
    };
    case 3: return {
      latest: { activity: "CII Uploaded Proposal Document", status: "Completed", responsibility: "CII" },
      next: { activity: "Company Will Upload Work Order", status: "Pending", responsibility: "Company" },
    };
    case 4: return {
      latest: { activity: "Company Uploaded Work Order Document", status: "Completed", responsibility: "Company" },
      next: { activity: "CII will Approve/Reject Work Order", status: "Pending", responsibility: "CII" },
    };
    case 5: {
      if (hasRejectionSignal(quickView, ["work_order_status", "workOrderStatus", "wo_status_label", "woStatusLabel"])) {
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
    case 6: return {
      latest: { activity: "CII to provide Project Code", status: "Completed", responsibility: "CII" },
      next: { activity: "Assign Project Co-Ordinator", status: "Pending", responsibility: "CII" },
    };
    case 61: return {
      latest: { activity: "Assign Project Co-Ordinator", status: "Completed", responsibility: "CII" },
      next: { activity: "CII to upload the PI/Tax Invoice", status: "Pending", responsibility: "CII" },
    };
    case 62: return {
      latest: { activity: "CII uploaded the PI/Tax Invoice", status: "Completed", responsibility: "CII" },
      next: { activity: "Consultant Will Upload Site Visit Report", status: "Pending", responsibility: "Consultant" },
    };
    case 63: return {
      latest: { activity: "Consultant Uploaded Site Visit Report", status: "Completed", responsibility: "Consultant" },
      next: { activity: "CII will Assign A Facilitator", status: "Pending", responsibility: "CII" },
    };
    case 64: return {
      latest: { activity: "CII Assigned A Facilitator", status: "Completed", responsibility: "CII" },
      next: { activity: "Facilitator will Upload Signed Contract Fee Document", status: "Pending", responsibility: "Facilitator" },
    };
    case 65: return {
      latest: { activity: "Facilitator Uploaded Signed Contract Fee Document", status: "Completed", responsibility: "Consultant" },
      next: { activity: "CII will Acknowledge Signed Contract Fee Document", status: "Pending", responsibility: "CII" },
    };
    case 66: {
      if (hasRejectionSignal(quickView, ["contract_fee_status", "contractFeeStatus", "facilitator_contract_fee_status", "signed_contract_fee_status"])) {
        return {
          latest: { activity: "CII Disapproved Contract Fee Document", status: "Rejected", responsibility: "CII" },
          next: { activity: "Facilitator will re-upload Signed Contract Fee Document", status: "Pending", responsibility: "Facilitator" },
        };
      }
      return {
        latest: { activity: "CII Accepted Fee Contract Document of the Facilitator", status: "Approved", responsibility: "CII" },
        next: { activity: "Consultant/Company Will Make Payment", status: "Pending", responsibility: "Consultant/Company" },
      };
    }
    case 7: return {
      latest: { activity: "Consultant/Company Paid 1st Proforma Invoice", status: "Completed", responsibility: "Consultant/Company" },
      next: { activity: "CII will Acknowledge Proforma Invoice", status: "Pending", responsibility: "CII" },
    };
    case 8: {
      if (hasRejectionSignal(quickView, ["proforma_status", "proformaStatus", "payment_status", "paymentStatus", "proforma_invoice_status"])) {
        return {
          latest: { activity: "1st Proforma Invoice Rejected by CII", status: "Rejected", responsibility: "CII" },
          next: { activity: "Consultant/Company will Re-pay 1st Proforma Invoice", status: "Pending", responsibility: "Consultant/Company" },
        };
      }
      return {
        latest: { activity: "CII Acknowledged Proforma Invoice", status: "Approved", responsibility: "CII" },
        next: { activity: "Need to Upload Primary Data Form", status: "Pending", responsibility: "Company" },
      };
    }
    case 9: return {
      latest: { activity: "Company Uploaded All Primary Data", status: "Completed", responsibility: "Company" },
      next: { activity: "CII Need to Accept Primary Data", status: "Pending", responsibility: "CII" },
    };
    case 10: return {
      latest: { activity: "CII Approved All Primary Data", status: "Completed", responsibility: "CII" },
      next: { activity: "All Assessment Submittals to be uploaded", status: "Pending", responsibility: "Company" },
    };
    case 11: return {
      latest: { activity: "All Checklist Documents Uploaded by Company", status: "Completed", responsibility: "Company" },
      next: { activity: "CII will Approve All Checklist Documents", status: "Pending", responsibility: "CII" },
    };
    case 12: return {
      latest: { activity: "CII Approved All Assessment Submittals", status: "Completed", responsibility: "CII" },
      next: { activity: "CII Will Assign Assessor", status: "Pending", responsibility: "CII" },
    };
    case 13: return {
      latest: { activity: "CII Assigned an Assessor", status: "Completed", responsibility: "CII" },
      next: { activity: "Preliminary Scoring to be submitted by CII", status: "Pending", responsibility: "CII" },
    };
    case 14: return {
      latest: { activity: "Preliminary Scoring submitted by CII", status: "Completed", responsibility: "CII" },
      next: { activity: "Final Scoring is to be submitted (Rating Declaration)", status: "Pending", responsibility: "Assessor" },
    };
    case 15: return {
      latest: { activity: "Final Scoring is submitted (Rating Declaration)", status: "Completed", responsibility: "Assessor" },
      next: { activity: "CII Will Upload Certificate", status: "Pending", responsibility: "CII" },
    };
    case 16: return {
      latest: { activity: "CII Uploaded Certificate", status: "Completed", responsibility: "CII" },
      next: { activity: "CII Will Raise 2nd Proforma Invoice", status: "Pending", responsibility: "CII" },
    };
    case 17: return {
      latest: { activity: "CII Uploaded 2nd Proforma Invoice", status: "Completed", responsibility: "CII" },
      next: { activity: "Consultant/Company Will Make Payment", status: "Pending", responsibility: "Consultant/Company" },
    };
    case 18: return {
      latest: { activity: "2nd Proforma Invoice Payment Receipt by Consultant/Company", status: "Completed", responsibility: "Consultant/Company" },
      next: { activity: "CII will Acknowledge 2nd Proforma Invoice", status: "Pending", responsibility: "CII" },
    };
    case 19: {
      if (hasRejectionSignal(quickView, ["proforma_2nd_status", "proforma2ndStatus", "second_proforma_status", "payment_2nd_status"])) {
        return {
          latest: { activity: "2nd Proforma Invoice Rejected By CII", status: "Rejected", responsibility: "CII" },
          next: { activity: "Consultant/Company will Re-pay 2nd Proforma Invoice", status: "Pending", responsibility: "Consultant/Company" },
        };
      }
      return {
        latest: { activity: "CII Accepted 2nd Proforma Invoice Acknowledgement", status: "Approved", responsibility: "CII" },
        next: { activity: "Plaque and PR Data should be Uploaded", status: "Pending", responsibility: "CII" },
      };
    }
    case 20: return {
      latest: { activity: "CII dispatched Plaque & Certificate", status: "Completed", responsibility: "CII" },
      next: { activity: "CII Will Upload Feedback Report", status: "Pending", responsibility: "CII" },
    };
    case 21: return {
      latest: { activity: "CII Uploaded Feedback Report", status: "Completed", responsibility: "CII" },
      next: { activity: "Process Complete", status: "Completed", responsibility: "CII" },
    };
    default: return null;
  }
}

const FLOW2_STEPS: Array<{ label: string; responsibility: string }> = [
  { label: "Company Registered", responsibility: "Company" },
  { label: "Company Filled Registration Info", responsibility: "Company" },
  { label: "CII Uploaded Proposal Document", responsibility: "CII" },
  { label: "Company Uploaded Work Order Document", responsibility: "Company" },
  { label: "Work Order / Contract Document Accepted", responsibility: "CII" },
  { label: "CII to provide Project Code", responsibility: "CII" },
  { label: "Assign Project Co-Ordinator", responsibility: "CII" },
  { label: "CII uploaded the PI/Tax Invoice", responsibility: "CII" },
  { label: "Consultant Uploaded Site Visit Report", responsibility: "Consultant" },
  { label: "CII Assigned A Facilitator", responsibility: "CII" },
  { label: "Facilitator Uploaded Signed Contract Fee Document", responsibility: "Facilitator" },
  { label: "CII Accepted Fee Contract Document", responsibility: "CII" },
  { label: "Consultant/Company Paid 1st Proforma Invoice", responsibility: "Consultant/Company" },
  { label: "CII Acknowledged Proforma Invoice", responsibility: "CII" },
  { label: "Company Uploaded All Primary Data", responsibility: "Company" },
  { label: "CII Approved All Primary Data", responsibility: "CII" },
  { label: "All Checklist Documents Uploaded by Company", responsibility: "Company" },
  { label: "CII Approved All Assessment Submittals", responsibility: "CII" },
  { label: "CII Assigned an Assessor", responsibility: "CII" },
  { label: "Preliminary Scoring submitted by CII", responsibility: "CII" },
  { label: "Final Scoring submitted (Rating Declaration)", responsibility: "Assessor" },
  { label: "CII Uploaded Certificate", responsibility: "CII" },
  { label: "CII Uploaded 2nd Proforma Invoice", responsibility: "CII" },
  { label: "2nd Proforma Invoice Payment by Consultant/Company", responsibility: "Consultant/Company" },
  { label: "CII Accepted 2nd Proforma Invoice", responsibility: "CII" },
  { label: "CII dispatched Plaque & Certificate", responsibility: "CII" },
  { label: "CII Uploaded Feedback Report", responsibility: "CII" },
];

const FLOW2_AID_TO_INDEX: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 61: 6, 62: 7, 63: 8, 64: 9, 65: 10, 66: 11,
  7: 12, 8: 13, 9: 14, 10: 15, 11: 16, 12: 17, 13: 18, 14: 19, 15: 20, 16: 21, 17: 22, 18: 23, 19: 24, 20: 25, 21: 26,
};

/* ─── End Flow 2 Engine ─── */

/** Facilitator (process_type &quot;f&quot;) — matches registration / quick view fields. */
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

function mergeSelectedFacilitatorFromRegistration(
  registration: Record<string, unknown> | null,
  facilitatorInfo: Record<string, unknown> | null,
): Record<string, unknown> {
  const reg = registration && Object.keys(registration).length > 0 ? registration : null;
  const fac = facilitatorInfo && Object.keys(facilitatorInfo).length > 0 ? facilitatorInfo : null;

  const selectedRaw =
    (reg?.selected_facilitator as Record<string, unknown> | undefined) ??
    (fac?.selected_facilitator as Record<string, unknown> | undefined);
  if (selectedRaw && typeof selectedRaw === "object" && !Array.isArray(selectedRaw)) {
    return selectedRaw;
  }

  const top = reg ?? fac;
  if (!top) return {};

  const name =
    top.facilitator_name ??
    top.facilitatorName ??
    top.contact_person_name ??
    top.company_name;
  const email = top.email ?? top.company_email ?? top.contact_person_email;
  const mobile = top.contact_person_mobile ?? top.contact_number ?? top.mobile;
  const code =
    top.facilitator_code ?? top.facilitatorCode ?? top.consultant_code ?? top.consultant_id;

  const out: Record<string, unknown> = {};
  const nameStr = toPlainString(name).trim();
  const emailStr = toPlainString(email).trim();
  const mobileStr = toPlainString(mobile).trim();
  const codeStr = toPlainString(code).trim();
  if (nameStr !== "") out.name = nameStr;
  if (emailStr !== "") out.email = emailStr;
  if (mobileStr !== "") out.mobile = mobileStr;
  if (codeStr !== "") {
    out.consultant_code = codeStr;
    out.facilitator_code = codeStr;
  }
  return out;
}

export default function AssessorProjectQuickViewPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hybridContext, setHybridContext] = useState<HybridContext | null>(null);
  const [quickView, setQuickView] = useState<Record<string, unknown>>({});
  const [assignments, setAssignments] = useState<Record<string, unknown>>({});
  const [coordinatorCatalog, setCoordinatorCatalog] = useState<Record<string, unknown>[]>([]);
  const [registrationData, setRegistrationData] = useState<Record<string, unknown> | null>(null);
  const [facilitatorRegistrationInfo, setFacilitatorRegistrationInfo] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      console.log("projectId", projectId);
      setError("Invalid project id.");
      setQuickView({});
      setAssignments({});
      setCoordinatorCatalog([]);
      setRegistrationData(null);
      setFacilitatorRegistrationInfo(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    void Promise.all([loadProjectHybridContext(projectId, "company"), getCompanyCoordinators()])
      .then(async ([ctx, coordinatorsPayload]) => {
        if (cancelled) return;
        refreshAssessorNotifications();
        setHybridContext(ctx);
        setQuickView(ctx.quickview);
        setAssignments(ctx.assignments);
        const list = pickRecordList(coordinatorsPayload, ["items", "rows", "data", "coordinators", "result"]);
        setCoordinatorCatalog(list);

        const isFacilitatorProcess =
          ctx.mode === "hybrid"
            ? ctx.processType === "f"
            : detectFacilitatorProcessType(ctx.quickview);
        if (!isFacilitatorProcess) {
          setRegistrationData(null);
          setFacilitatorRegistrationInfo(null);
          return;
        }
        try {
          const [regPayload, facPayload] = await Promise.all([
            getAdminProjectRegistrationData(projectId),
            getCompanyProjectFacilitatorRegistrationInfo(projectId),
          ]);
          if (cancelled) return;
          setRegistrationData(regPayload);
          setFacilitatorRegistrationInfo(facPayload);
        } catch {
          if (!cancelled) {
            setRegistrationData(null);
            setFacilitatorRegistrationInfo(null);
          }
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load quick view.");
        setHybridContext(null);
        setQuickView({});
        setAssignments({});
        setCoordinatorCatalog([]);
        setRegistrationData(null);
        setFacilitatorRegistrationInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isHybrid = hybridContext?.mode === "hybrid";
  const isFacFlow2Legacy =
    !isHybrid && detectFacilitatorProcessType(quickView) && isCiiAssignsFacilitatorFlow(quickView);
  const flow2StepsMemo = useMemo(() => {
    if (isHybrid) return workflowStepPairFromStatus(hybridContext.workflow);
    if (isFacFlow2Legacy) return resolveFlow2Steps(quickView);
    return null;
  }, [isHybrid, hybridContext, isFacFlow2Legacy, quickView]);
  const flow2AidMemo = useMemo(() => {
    if (isHybrid) return hybridContext.stepId;
    return resolveActivityId(quickView);
  }, [isHybrid, hybridContext, quickView]);
  const flow2IdxMemo = useMemo(() => {
    if (isHybrid) return resolveHybridStepIndex(hybridContext.workflow);
    return flow2AidMemo !== null ? (FLOW2_AID_TO_INDEX[flow2AidMemo] ?? -1) : -1;
  }, [isHybrid, hybridContext, flow2AidMemo, quickView]);
  const milestoneSteps = useMemo(() => {
    if (isHybrid) {
      const fromApi = buildStepperFromWorkflow(hybridContext.workflow);
      if (fromApi.length > 0) {
        return fromApi.map((step) => ({ label: step.label, responsibility: step.responsibility }));
      }
    }
    return FLOW2_STEPS;
  }, [isHybrid, hybridContext]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const company =
    (quickView.profile as Record<string, unknown> | undefined) ??
    (quickView.company as Record<string, unknown> | undefined) ??
    (quickView.project as Record<string, unknown> | undefined) ??
    quickView;
  const companyName = company.name ?? company.company_name ?? company.companyName;
  const companyRegId = company.reg_id ?? company.company_id ?? company.companyId;
  const projectCode =
    company.project_code ??
    company.projectCode ??
    company.project_id ??
    company.projectId;
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
  const isFacilitatorProcess =
    hybridContext?.mode === "hybrid"
      ? hybridContext.processType === "f"
      : detectFacilitatorProcessType(quickView);
  const isFlow2 = isHybrid || isFacFlow2Legacy;
  const showFacilitatorAssign =
    isHybrid && hybridContext
      ? shouldShowAddFacilitator(hybridContext.workflow, assignments)
      : false;
  const registrationFacilitator = mergeSelectedFacilitatorFromRegistration(
    registrationData,
    facilitatorRegistrationInfo,
  );
  const showFacilitatorFromRegistration =
    isFacilitatorProcess && Object.keys(registrationFacilitator).length > 0;
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

  const flow2Steps = flow2StepsMemo;
  const flow2CurrentIndex = flow2IdxMemo;

  return (
    <div className="space-y-2">
      {isHybrid && hybridContext ? (
        <div className="rounded border border-[#c7daf5] bg-[#eef5ff] px-3 py-2 text-xs text-[#1e3a5f]">
          <p>
            <span className="font-semibold">Hybrid workflow</span>
            {" · "}
            Phase: {hybridContext.phase === "facilitator" || hybridContext.processType === "f" ? "Facilitator" : "CII"}
            {" · "}
            Step {hybridContext.stepId}
          </p>
          <p className="mt-1">
            Next: {hybridContext.next} ({hybridContext.nextResp})
          </p>
          {showFacilitatorAssign ? (
            <p className="mt-1 font-medium text-[#9a6a0a]">
              Action required: assign facilitator (step 64, still CII phase).
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Company Details">
          <KVRow label="Company Name" value={companyName} />
          <KVRow label="Company ID" value={companyRegId} />
          <KVRow label="Project ID" value={projectId} />
          <KVRow label="Project Code" value={projectCode} />
          <KVRow label="Email" value={companyEmail} />
          <KVRow label="Mobile Number" value={companyMobile} />
          <KVRow label="Turnover Of The Unit" value={company.turnover ?? company.turnover_unit} />
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
          {showFacilitatorFromRegistration ? (
            <div className="space-y-0">
              <KVRow label="Name" value={registrationFacilitator.name} />
              <KVRow label="Email" value={registrationFacilitator.email} />
              <KVRow label="Mobile" value={registrationFacilitator.mobile} />
              <KVRow
                label="Consultant / facilitator code"
                value={
                  registrationFacilitator.consultant_code ??
                  registrationFacilitator.consultant_id ??
                  registrationFacilitator.facilitator_code
                }
              />
              <KVRow label="State" value={registrationFacilitator.state} />
              <KVRow label="City" value={registrationFacilitator.city} />
              <KVRow label="Address" value={registrationFacilitator.address_line_1} />
              <KVRow label="Pincode" value={registrationFacilitator.pincode} />
              <KVRow label="Industry category" value={registrationFacilitator.industry_category} />
            </div>
          ) : (
            <p className="text-sm text-[#2d3746]">
              {textValue(facilitator.name ?? facilitator.message ?? "Facilitator assigned by Greenco Team")}
            </p>
          )}
        </SectionCard>
      </div>

      {/* ─── Flow 2: Latest Step / Next Step ─── */}
      {flow2Steps ? (
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
                    <td className="border border-[#d9dde7] px-3 py-3 font-medium text-[#4b5563]">{flow2Steps.latest.activity}</td>
                    <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">{flow2Steps.latest.status}</td>
                    <td className="border border-[#d9dde7] px-3 py-3 text-[#4b5563]">{flow2Steps.latest.responsibility}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title={flow2Steps.next.activity === "Process Complete" ? "Certificate Issued" : "Next Step"}>
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
                    <td className={`font-medium ${flow2Steps.next.activity === "Process Complete" ? "border border-[#86efac] bg-[#dcfce7] px-3 py-3 text-[#166534]" : "border border-[#d9dde7] bg-[#fff700] px-3 py-3 text-[#4b5563]"}`}>
                      {flow2Steps.next.activity}
                    </td>
                    <td className={flow2Steps.next.activity === "Process Complete" ? "border border-[#86efac] bg-[#dcfce7] px-3 py-3 text-[#166534]" : "border border-[#d9dde7] bg-[#fff700] px-3 py-3 text-[#4b5563]"}>
                      {flow2Steps.next.status}
                    </td>
                    <td className={flow2Steps.next.activity === "Process Complete" ? "border border-[#86efac] bg-[#dcfce7] px-3 py-3 text-[#166534]" : "border border-[#d9dde7] bg-[#fff700] px-3 py-3 text-[#4b5563]"}>
                      {flow2Steps.next.responsibility}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <SectionCard title="Co-ordinator Details">
          <KVRow label="Name" value={coordinatorResolved.name ?? coordinatorResolved.coordinator_name} />
          <KVRow label="Email" value={coordinatorResolved.email} />
          <KVRow label="Mobile Number" value={coordinatorResolved.mobile ?? coordinatorResolved.phone} />
        </SectionCard>

        <SectionCard title="Assessor Details">
          {assessors.length === 0 ? (
            <p className="text-sm text-[#7f8a9a]">No assessor assigned.</p>
          ) : (
            <div className="space-y-4">
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
          )}
        </SectionCard>
      </div>

      {/* ─── Flow 2: Activity Log & Milestone Flow ─── */}
      {isFlow2 && flow2CurrentIndex >= 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <SectionCard title="Company Activity Log">
            <div className="space-y-0">
              {milestoneSteps.map((step, idx) => {
                const isDone = idx < flow2CurrentIndex;
                const isCurrent = idx === flow2CurrentIndex;
                let stateColor = "bg-[#cbd5e1]";
                if (isDone) stateColor = "bg-[#22c55e]";
                else if (isCurrent) stateColor = "bg-[#f59e0b]";

                let subtitle = "Upcoming";
                if (isDone) {
                  subtitle = `Completed • ${step.responsibility}`;
                } else if (isCurrent) {
                  subtitle = `${flow2Steps?.next.status ?? "Pending"} • ${flow2Steps?.next.responsibility ?? step.responsibility}`;
                }

                return (
                  <div key={`log-${step.label}-${idx}`} className="relative flex items-start gap-3 pb-3 last:pb-0">
                    {idx < milestoneSteps.length - 1 ? (
                      <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[#cfd8e3]" />
                    ) : null}
                    <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${stateColor}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#2f3a46]">{step.label}</p>
                      <p className="text-xs text-[#6b7280]">{subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Company Milestone Flow">
            <div className="space-y-0">
              {milestoneSteps.map((step, idx) => {
                const done = idx <= flow2CurrentIndex;
                return (
                  <div key={`ms-${step.label}-${idx}`} className="relative flex items-start gap-3 pb-3 last:pb-0">
                    {idx < milestoneSteps.length - 1 ? (
                      <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[#cfd8e3]" />
                    ) : null}
                    <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-[#22c55e]" : "bg-[#cbd5e1]"}`} />
                    <p className={`text-sm ${done ? "text-[#2f3a46]" : "text-[#64748b]"}`}>{step.label}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

