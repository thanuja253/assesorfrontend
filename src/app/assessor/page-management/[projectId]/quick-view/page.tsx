"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getAdminProjectRegistrationData,
  getCompanyCoordinators,
  getCompanyProjectAssignments,
  getCompanyProjectFacilitatorRegistrationInfo,
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
    void Promise.all([
      getCompanyProjectQuickView(projectId),
      getCompanyProjectAssignments(projectId),
      getCompanyCoordinators(),
    ])
      .then(async ([quickViewPayload, assignmentsPayload, coordinatorsPayload]) => {
        if (cancelled) return;
        setQuickView(quickViewPayload);
        setAssignments(assignmentsPayload);
        const list = pickRecordList(coordinatorsPayload, ["items", "rows", "data", "coordinators", "result"]);
        setCoordinatorCatalog(list);

        const isFacilitatorProcess = detectFacilitatorProcessType(quickViewPayload);
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
  const isFacilitatorProcess = detectFacilitatorProcessType(quickView);
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
    </div>
  );
}

