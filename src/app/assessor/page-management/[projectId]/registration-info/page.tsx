"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import {
  getCompanyProjectFacilitatorRegistrationInfo,
  getCompanyProjectQuickView,
  getCompanyRegisterInfo,
} from "@/lib/assessor-project-api";
import { SectionCard, textValue } from "../_ui";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function normalizeCandidate(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function enqueueChildren(current: unknown, queue: unknown[]): void {
  if (!current || typeof current !== "object") return;
  if (Array.isArray(current)) {
    current.forEach((item) => queue.push(item));
    return;
  }
  Object.values(current as Record<string, unknown>).forEach((value) => {
    if (value && typeof value === "object") {
      queue.push(value);
    }
  });
}

function findValueInRecord(
  rec: Record<string, unknown>,
  targetKeys: Set<string>,
): string {
  for (const [key, value] of Object.entries(rec)) {
    if (!targetKeys.has(key.toLowerCase())) continue;
    const normalized = normalizeCandidate(value);
    if (normalized) return normalized;
  }
  return "";
}

function deepPickString(source: unknown, keys: string[]): string {
  const targetKeys = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<unknown>();
  const queue: unknown[] = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (!Array.isArray(current)) {
      const found = findValueInRecord(current as Record<string, unknown>, targetKeys);
      if (found) return found;
    }
    enqueueChildren(current, queue);
  }
  return "";
}

function listFrom(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = payload[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

function mapNameById(list: Record<string, unknown>[]): Map<string, string> {
  const pairs: Array<readonly [string, string]> = [];
  list.forEach((item) => {
    const name = pickString(item, ["name", "label", "value"]);
    const id = pickString(item, ["id", "_id", "value"]).toLowerCase();
    const code = pickString(item, ["code", "state_code"]).toLowerCase();
    if (id) pairs.push([id, name] as const);
    if (code) pairs.push([code, name] as const);
  });
  return new Map(pairs);
}

function resolveLookupValue(
  profile: Record<string, unknown>,
  keys: string[],
  lookup: Map<string, string>,
): string {
  const raw = pickString(profile, keys);
  if (!raw) return "";
  return lookup.get(raw.toLowerCase()) ?? raw;
}

function ReadonlyField({
  label,
  value,
  fullWidth = false,
}: Readonly<{ label: string; value: unknown; fullWidth?: boolean }>) {
  return (
    <div className={fullWidth ? "md:col-span-2" : ""}>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-[#5f6b7a]">{label}</p>
      <div className="flex min-h-10 items-center rounded-md border border-[#d8e1ee] bg-[#fbfcff] px-3 py-2 text-sm text-[#2d3746]">
        {textValue(value)}
      </div>
    </div>
  );
}

function StepChip({
  index,
  title,
  active = false,
}: Readonly<{ index: number; title: string; active?: boolean }>) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] px-1.5 text-[11px] font-semibold ${
          active ? "bg-[#1f4f8a] text-white" : "bg-[#e7edf7] text-[#52617a]"
        }`}
      >
        {index}
      </span>
      <span className={`text-xs font-medium ${active ? "text-[#1f2937]" : "text-[#607087]"}`}>{title}</span>
    </div>
  );
}

function hasValue(value: unknown): boolean {
  return textValue(value) !== "—";
}

export default function AssessorProjectRegistrationInfoPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(1);
  const [quickView, setQuickView] = useState<Record<string, unknown>>({});
  const [registrationData, setRegistrationData] = useState<Record<string, unknown>>({});
  const [registerInfo, setRegisterInfo] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      setError("Invalid project id.");
      setQuickView({});
      setRegistrationData({});
      setRegisterInfo({});
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");
    void Promise.all([
      getCompanyProjectQuickView(projectId),
      getCompanyProjectFacilitatorRegistrationInfo(projectId),
      getCompanyRegisterInfo(),
    ])
      .then(([quickviewPayload, registrationPayload, registerInfoPayload]) => {
        if (cancelled) return;
        setQuickView(quickviewPayload);
        setRegistrationData(registrationPayload);
        setRegisterInfo(registerInfoPayload);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load registration info.");
        setQuickView({});
        setRegistrationData({});
        setRegisterInfo({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const profile = useMemo(() => {
    const quickviewProfile =
      (quickView.profile as Record<string, unknown> | undefined) ??
      (quickView.company as Record<string, unknown> | undefined) ??
      {};
    const registration =
      (registrationData.profile as Record<string, unknown> | undefined) ??
      (registrationData.data as Record<string, unknown> | undefined) ??
      registrationData;
    return { ...quickviewProfile, ...toRecord(registration) };
  }, [registrationData, quickView]);

  const industryLookup = useMemo(() => mapNameById(listFrom(registerInfo, "industries")), [registerInfo]);
  const entityLookup = useMemo(() => mapNameById(listFrom(registerInfo, "entities")), [registerInfo]);
  const sectorLookup = useMemo(() => mapNameById(listFrom(registerInfo, "sectors")), [registerInfo]);
  const stateLookup = useMemo(() => mapNameById(listFrom(registerInfo, "states")), [registerInfo]);
  const mergedSource = useMemo(() => ({ ...quickView, ...registrationData, profile }), [profile, quickView, registrationData]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const companyAndContact = {
    companyName: deepPickString(mergedSource, ["name", "company_name", "companyName"]),
    existingGreencoCode: deepPickString(mergedSource, ["existing_green_co_code", "existing_greenco_code", "existing_code"]),
    state: resolveLookupValue(
      { ...profile, state_id: deepPickString(mergedSource, ["state_id", "stateId", "state"]) },
      ["state_id", "state", "stateId"],
      stateLookup,
    ),
    city: deepPickString(mergedSource, ["city", "district"]),
    mobile: deepPickString(mergedSource, ["mobile", "mobile_no", "mobileno", "contact_number"]),
    phone1: deepPickString(mergedSource, ["phone1", "phone", "telephone", "plant_contact", "contact_no", "contact_number"]),
    email: deepPickString(mergedSource, ["email", "company_email"]),
    postalAddress: deepPickString(mergedSource, ["postal_address", "address", "postalAddress", "plant_address"]),
    postalPincode: deepPickString(mergedSource, ["postal_pincode", "postalPincode", "pincode", "plant_pincode"]),
    officeAddress: deepPickString(mergedSource, ["office_address", "official_address", "billing_address"]),
    officePincode: deepPickString(mergedSource, ["office_pincode", "billing_pincode", "billingPincode"]),
    plantHeadName: deepPickString(mergedSource, ["plant_head_name", "contact_person", "planthead_name", "contact_person_name"]),
    designation: deepPickString(mergedSource, ["designation", "plant_head_designation"]),
    plantEmail: deepPickString(mergedSource, ["plant_email", "plant_email_id", "plant_head_email", "contact_person_email"]),
  };

  const industryAndSector = {
    industry: resolveLookupValue(
      { ...profile, industry_id: deepPickString(mergedSource, ["industry_id", "industry", "industry_category"]) },
      ["industry_id", "industry", "industry_category"],
      industryLookup,
    ),
    entityType: resolveLookupValue(
      { ...profile, entity_id: deepPickString(mergedSource, ["entity_id", "entity", "entity_type"]) },
      ["entity_id", "entity", "entity_type"],
      entityLookup,
    ),
    sector: resolveLookupValue(
      { ...profile, sector_id: deepPickString(mergedSource, ["sector_id", "sector"]) },
      ["sector_id", "sector"],
      sectorLookup,
    ),
    companySez: deepPickString(mergedSource, ["company_sez", "is_sez"]),
    commonOrSectoral: deepPickString(mergedSource, ["common_or_sectoral", "common_sectoral", "sectoral"]),
  };

  const facilityAndTurnover = {
    productsServices: deepPickString(mergedSource, ["products_services", "product_services", "product", "services"]),
    turnover: deepPickString(mergedSource, ["turnover"]),
    permanentEmployees: deepPickString(mergedSource, ["permanent_employees"]),
    contractEmployees: deepPickString(mergedSource, ["contract_employees"]),
    totalAreaAcres: deepPickString(mergedSource, ["total_area_acres", "total_area"]),
    turnoverDocument: deepPickString(mergedSource, ["turnover_document", "turnover_doc", "turnover_file"]),
  };

  const taxIdentifiers = {
    tan: deepPickString(mergedSource, ["tan", "tan_no"]),
    pan: deepPickString(mergedSource, ["pan", "pan_no", "pancard_no"]),
    gstin: deepPickString(mergedSource, ["gstin", "gst_no"]),
  };
  const facilitatorInfo = {
    name: deepPickString(mergedSource, ["facilitator_name", "facilitatorName", "name"]),
    code: deepPickString(mergedSource, ["facilitator_code", "facilitatorCode", "consultant_code", "consultant_id"]),
    email: deepPickString(mergedSource, ["facilitator_email", "email"]),
    mobile: deepPickString(mergedSource, ["facilitator_mobile", "mobile"]),
  };
  const selectedFacilitator = toRecord(registrationData.selected_facilitator);
  if (!hasValue(facilitatorInfo.name)) {
    facilitatorInfo.name = pickString(selectedFacilitator, ["name"]);
  }
  if (!hasValue(facilitatorInfo.code)) {
    facilitatorInfo.code = pickString(selectedFacilitator, ["facilitator_code", "consultant_code", "consultant_id"]);
  }
  if (!hasValue(facilitatorInfo.email)) {
    facilitatorInfo.email = pickString(selectedFacilitator, ["email"]);
  }
  if (!hasValue(facilitatorInfo.mobile)) {
    facilitatorInfo.mobile = pickString(selectedFacilitator, ["mobile"]);
  }
  const documentInfo = {
    briefProfile: deepPickString(mergedSource, ["company_brief_profile", "brief_profile"]),
    turnoverDocument: deepPickString(mergedSource, ["turnover_document", "turnover_doc", "turnover_file"]),
    sezDocument: deepPickString(mergedSource, ["sez_document", "sez_doc"]),
  };
  const accountStatusRaw = deepPickString(mergedSource, ["account_status", "status", "accountStatus"]).toLowerCase();
  let accountStatusLabel = "—";
  if (accountStatusRaw === "1" || accountStatusRaw === "active") {
    accountStatusLabel = "Active";
  } else if (accountStatusRaw === "0" || accountStatusRaw === "inactive") {
    accountStatusLabel = "Inactive";
  }
  const facilitatorConsultant = hasValue(facilitatorInfo.code) ? facilitatorInfo.code : facilitatorInfo.name;
  const companySezLabel = hasValue(industryAndSector.companySez) ? industryAndSector.companySez : documentInfo.sezDocument;
  const totalSteps = 4;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#dbe4f0] bg-gradient-to-r from-[#f9fbff] to-[#f4f8ff] px-5 py-4">
        <h2 className="text-lg font-semibold text-[#2f3a46]">Registration Info</h2>
        <p className="mt-1 text-xs text-[#6f7c90]">Company registration snapshot and facilitator onboarding details.</p>
      </div>

      <div className="rounded border border-[#e2e8f3] bg-white p-3">
        <div className="flex flex-wrap items-center gap-5">
          <StepChip index={1} title="Basic Info" active={activeStep === 1} />
          <span className="text-[#9ba6b8]">›</span>
          <StepChip index={2} title="Industry Details" active={activeStep === 2} />
          <span className="text-[#9ba6b8]">›</span>
          <StepChip index={3} title="Infrastructure Details" active={activeStep === 3} />
          <span className="text-[#9ba6b8]">›</span>
          <StepChip index={4} title="Income Details" active={activeStep === 4} />
        </div>
      </div>

      {activeStep === 1 && (
        <SectionCard title="1. Basic Info">
          <div className="grid gap-4 md:grid-cols-4">
            <ReadonlyField label="Name of the Company *" value={companyAndContact.companyName} />
            <ReadonlyField label="State *" value={companyAndContact.state} />
            <ReadonlyField label="Postal Address *" value={companyAndContact.postalAddress} />
            <ReadonlyField label="Billing Address *" value={companyAndContact.officeAddress} />
            <ReadonlyField label="Phone Number" value={companyAndContact.mobile} />
            <ReadonlyField label="City *" value={companyAndContact.city} />
            <ReadonlyField label="Postal Address Pincode *" value={companyAndContact.postalPincode} />
            <ReadonlyField label="Billing Address Pincode *" value={companyAndContact.officePincode} />
            <ReadonlyField label="Email Address *" value={companyAndContact.email} />
            <ReadonlyField label="Account Status *" value={accountStatusLabel} />
            <ReadonlyField label="Facilitator / Consultant" value={facilitatorConsultant} />
            <ReadonlyField label="Plant Head Name *" value={companyAndContact.plantHeadName} />
            <ReadonlyField label="Plant Contact No *" value={companyAndContact.phone1 || facilitatorInfo.mobile} />
            <ReadonlyField label="Plant Head Designation" value={companyAndContact.designation} />
            <ReadonlyField label="Plant Email *" value={companyAndContact.plantEmail || facilitatorInfo.email} />
          </div>
        </SectionCard>
      )}

      {activeStep === 2 && (
        <SectionCard title="2. Industry Details">
          <div className="grid gap-4 md:grid-cols-3">
            <ReadonlyField label="Type of the Industry *" value={industryAndSector.industry} />
            <ReadonlyField label="Which type of Entity you are? *" value={industryAndSector.entityType} />
            <ReadonlyField label="Type of Sector *" value={industryAndSector.sector} />
            <ReadonlyField label="Upload Company Brief Profile" value={documentInfo.briefProfile} />
            <ReadonlyField label="Is your company SEZ? *" value={companySezLabel} />
            <ReadonlyField label="Facilitator Name" value={facilitatorInfo.name} />
          </div>
        </SectionCard>
      )}

      {activeStep === 3 && (
        <SectionCard title="3. Infrastructure Details">
          <div className="grid gap-4 md:grid-cols-3">
            <ReadonlyField label="Name of the Products manufactured / Services offered" value={facilityAndTurnover.productsServices} />
            <ReadonlyField label="Latest Turnover of the unit / facility, in Rs Crores only *" value={facilityAndTurnover.turnover} />
            <ReadonlyField label="Total no of permanent employees *" value={facilityAndTurnover.permanentEmployees} />
            <ReadonlyField label="Total no of contract employees *" value={facilityAndTurnover.contractEmployees} />
            <ReadonlyField label="Total area of the unit / facility *" value={facilityAndTurnover.totalAreaAcres} fullWidth />
            <ReadonlyField label="Upload Turnover Document" value={documentInfo.turnoverDocument || facilityAndTurnover.turnoverDocument} />
          </div>
        </SectionCard>
      )}

      {activeStep === 4 && (
        <SectionCard title="4. Income Details">
          <div className="grid gap-4 md:grid-cols-3">
            <ReadonlyField label="TAN (Tax Deduction Account Number) *" value={taxIdentifiers.tan} />
            <ReadonlyField label="PAN (Permanent Account Number) *" value={taxIdentifiers.pan} />
            <ReadonlyField label="GSTIN (Goods and Services Tax Identification Number) *" value={taxIdentifiers.gstin} />
          </div>
        </SectionCard>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
          disabled={activeStep === 1}
          className="rounded border border-[#d4dbe7] bg-white px-4 py-1.5 text-xs font-medium text-[#475569] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setActiveStep((prev) => Math.min(totalSteps, prev + 1))}
          disabled={activeStep === totalSteps}
          className="rounded bg-[#1f4f8a] px-4 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
