"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getApiUrl } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

type TabItem = {
  key: string;
  label: string;
  href: string;
};

function hasPayloadData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return Object.values(rec).some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
    return false;
  });
}

function hasRegistrationStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const companyName = typeof rec.company_name === "string" ? rec.company_name.trim() : "";
  const plantAddress = typeof rec.plant_address === "string" ? rec.plant_address.trim() : "";
  const gstinRaw = rec.gstin ?? rec.gstin_no;
  const gstin = typeof gstinRaw === "string" ? gstinRaw.trim() : "";
  const briefProfile =
    typeof rec.company_brief_profile === "string" ? rec.company_brief_profile.trim() : "";
  const turnoverDoc = typeof rec.turnover_document === "string" ? rec.turnover_document.trim() : "";
  const sezDoc = typeof rec.sez_document === "string" ? rec.sez_document.trim() : "";

  // Strict registration unlock: actual company registration content only.
  if (!companyName) return false;
  return Boolean(plantAddress || gstin || briefProfile || turnoverDoc || sezDoc);
}

function hasContractStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const statusRaw = rec.approval_status ?? rec.status ?? rec.document_status;
  const status =
    typeof statusRaw === "string" || typeof statusRaw === "number"
      ? String(statusRaw).trim().toLowerCase()
      : "";
  const hasFile = [rec.file_url, rec.document_url, rec.url, rec.file_path, rec.file].some(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
  return hasFile || ["1", "approved", "accepted"].includes(status);
}

function hasLaunchTrainingStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const sessions = Array.isArray(rec.sessions) ? rec.sessions : [];
  return sessions.some((session) => {
    if (!session || typeof session !== "object") return false;
    const entry = session as Record<string, unknown>;
    return [entry.document_url, entry.file_url, entry.url].some(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
  });
}

function hasFinanceStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const invoices = Array.isArray(rec.invoices) ? rec.invoices : [];
  return invoices.length > 0;
}

function hasFinanceCompletedStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const invoices = Array.isArray(rec.invoices) ? rec.invoices : [];
  if (invoices.length === 0) return false;
  return invoices.some((item) => {
    if (!item || typeof item !== "object") return false;
    const invoice = item as Record<string, unknown>;
    const approvalRaw =
      invoice.approval_status ??
      invoice.approvalStatus ??
      invoice.status ??
      invoice.invoice_status;
    const approvalText =
      typeof approvalRaw === "string" || typeof approvalRaw === "number"
        ? String(approvalRaw).trim().toLowerCase()
        : "";
    const labelRaw = invoice.approval_status_label ?? invoice.approvalStatusLabel ?? invoice.status_label;
    const labelText =
      typeof labelRaw === "string" || typeof labelRaw === "number"
        ? String(labelRaw).trim().toLowerCase()
        : "";
    return (
      approvalText === "1" ||
      approvalText === "approved" ||
      approvalText === "completed" ||
      labelText.includes("approved") ||
      labelText.includes("completed")
    );
  });
}

function hasAssessmentSubmittalsData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const candidateKeys = ["rows", "items", "documents", "checklist", "data", "result"];
  return candidateKeys.some((key) => {
    const item = rec[key];
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
    return false;
  });
}

function hasScoringStepData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const candidateKeys = ["rows", "items", "scores", "scoring", "data", "result"];
  return candidateKeys.some((key) => {
    const item = rec[key];
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
    return false;
  });
}

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

function hasCoordinatorAssignedPayload(
  quickView: Record<string, unknown> | null,
  assignments: Record<string, unknown> | null,
): boolean {
  const quickViewRec = quickView ?? {};
  const assignmentsRec = assignments ?? {};

  const assignmentRoot = pickFirstRecord(assignmentsRec, [
    "assignment_details",
    "assignment",
    "data",
    "result",
  ]);
  const mergedAssignments = { ...assignmentsRec, ...assignmentRoot } as Record<string, unknown>;
  const coordinatorFromAssignments = pickFirstRecord(mergedAssignments, [
    "coordinators",
    "coordinator",
    "coordinator_details",
    "coordinator_detail",
    "assigned_coordinator",
  ]);
  const quickviewCoordinatorContainer = pickFirstRecord(quickViewRec, ["companies_coordinator"]);
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

function normalizeAlpha(value: string): string {
  return value.replaceAll(/[^a-z]/g, "");
}

function hasLaunchTrainingPhrase(text: string): boolean {
  const compact = normalizeAlpha(text);
  const hasLaunch = compact.includes("launch");
  const hasTrainingWord =
    compact.includes("training") ||
    compact.includes("train") ||
    compact.includes("tarining") ||
    compact.includes("tarin");
  return hasLaunch && hasTrainingWord;
}

function collectCandidateText(candidate: unknown): string {
  if (typeof candidate === "string" || typeof candidate === "number") {
    return String(candidate).toLowerCase();
  }
  if (Array.isArray(candidate)) {
    return candidate.map(collectCandidateText).join(" ");
  }
  if (!candidate || typeof candidate !== "object") return "";
  const rec = candidate as Record<string, unknown>;
  const keys = [
    "activity",
    "name",
    "step",
    "title",
    "status_label",
    "label",
    "text",
    "description",
    "responsibility",
  ];
  return keys
    .map((key) => rec[key])
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).toLowerCase())
    .join(" ");
}

function collectNextCandidates(value: unknown): unknown[] {
  const nextCandidates: unknown[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    const rec = current as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      const normalizedKey = normalizeAlpha(key.toLowerCase());
      if (normalizedKey.includes("next")) {
        nextCandidates.push(val);
      }
      if (val && typeof val === "object") {
        queue.push(val);
      }
    }
  }

  return nextCandidates;
}

function isLaunchTrainingNextStep(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const nextCandidates = collectNextCandidates(value);
  return nextCandidates.some((candidate) => hasLaunchTrainingPhrase(collectCandidateText(candidate)));
}

function TabIcon({ tabKey, active }: Readonly<{ tabKey: string; active: boolean }>): ReactNode {
  const iconPalette: Record<string, { active: string; idle: string }> = {
    "quick-view": { active: "#64748b", idle: "#94a3b8" },
    "registration-info": { active: "#64748b", idle: "#94a3b8" },
    "contract-document": { active: "#64748b", idle: "#94a3b8" },
    "launch-training": { active: "#64748b", idle: "#94a3b8" },
    expenses: { active: "#64748b", idle: "#94a3b8" },
    "assessment-checklist-documents": { active: "#64748b", idle: "#94a3b8" },
    scoring: { active: "#64748b", idle: "#94a3b8" },
  };
  const palette = iconPalette[tabKey] ?? { active: "#334155", idle: "#cbd5e1" };
  const color = active ? palette.active : palette.idle;
  const commonProps = {
    width: 13,
    height: 13,
    viewBox: "0 0 20 20",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;
  const strokeProps = {
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  if (tabKey === "quick-view") {
    return (
      <svg {...commonProps}>
        <path d="M1.5 10C3.6 6.4 6.4 4.6 10 4.6C13.6 4.6 16.4 6.4 18.5 10C16.4 13.6 13.6 15.4 10 15.4C6.4 15.4 3.6 13.6 1.5 10Z" {...strokeProps} />
        <circle cx="10" cy="10" r="2.3" fill={color} />
      </svg>
    );
  }
  if (tabKey === "registration-info") {
    return (
      <svg {...commonProps}>
        <rect x="3.5" y="3.5" width="13" height="13" rx="2" {...strokeProps} />
        <line x1="6.5" y1="7.2" x2="13.8" y2="7.2" {...strokeProps} />
        <line x1="6.5" y1="10.1" x2="13.8" y2="10.1" {...strokeProps} />
        <line x1="6.5" y1="13" x2="11.2" y2="13" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "contract-document") {
    return (
      <svg {...commonProps}>
        <path d="M6 2.5H12.8L16.5 6.2V16C16.5 16.8 15.8 17.5 15 17.5H6C5.2 17.5 4.5 16.8 4.5 16V4C4.5 3.2 5.2 2.5 6 2.5Z" {...strokeProps} />
        <path d="M12.5 2.8V6.2H16.2" {...strokeProps} />
        <line x1="7" y1="10" x2="14" y2="10" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "launch-training") {
    return (
      <svg {...commonProps}>
        <rect x="3.2" y="4.2" width="13.6" height="12" rx="2" {...strokeProps} />
        <line x1="3.2" y1="8" x2="16.8" y2="8" {...strokeProps} />
        <line x1="7" y1="2.8" x2="7" y2="6" {...strokeProps} />
        <line x1="13" y1="2.8" x2="13" y2="6" {...strokeProps} />
        <path d="M7.2 11.4H12.8" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "expenses") {
    return (
      <svg {...commonProps}>
        <rect x="2.2" y="5.2" width="15.6" height="9.8" rx="2.2" {...strokeProps} />
        <path d="M2.8 8.8H17.2" {...strokeProps} />
        <circle cx="12.8" cy="10.2" r="1.6" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "assessment-checklist-documents") {
    return (
      <svg {...commonProps}>
        <path d="M6 2.5H12.8L16.5 6.2V16C16.5 16.8 15.8 17.5 15 17.5H6C5.2 17.5 4.5 16.8 4.5 16V4C4.5 3.2 5.2 2.5 6 2.5Z" {...strokeProps} />
        <path d="M12.5 2.8V6.2H16.2" {...strokeProps} />
        <line x1="7" y1="9.2" x2="14" y2="9.2" {...strokeProps} />
        <line x1="7" y1="12" x2="14" y2="12" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "scoring") {
    return (
      <svg {...commonProps}>
        <path d="M3.2 16H17" {...strokeProps} />
        <rect x="5.2" y="10.2" width="2.2" height="5.8" rx="0.6" fill={color} />
        <rect x="9" y="7.5" width="2.2" height="8.5" rx="0.6" fill={color} />
        <rect x="12.8" y="5" width="2.2" height="11" rx="0.6" fill={color} />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <circle cx="10" cy="10" r="6" {...strokeProps} />
    </svg>
  );
}

export default function ProjectTabs({ tabs }: Readonly<{ tabs: TabItem[] }>) {
  const pathname = usePathname();
  const isFacilitatorFlow = pathname?.startsWith("/facilitator/") ?? false;
  const [enabledTabs, setEnabledTabs] = useState<Record<string, boolean>>({
    "quick-view": true,
  });
  const projectId = useMemo(() => {
    const projectIdRegex = /\/page-management\/([^/]+)/;
    for (const tab of tabs) {
      const match = projectIdRegex.exec(tab.href);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return "";
  }, [tabs]);

  useEffect(() => {
    if (!projectId || !isFacilitatorFlow) return;
    const token = globalThis.window?.localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    let cancelled = false;
    const request = async (path: string): Promise<Record<string, unknown> | null> => {
      try {
        const response = await fetch(getApiUrl(path), { headers, cache: "no-store" });
        if (!response.ok) return null;
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!data || typeof data !== "object") return null;
        return (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
      } catch {
        return null;
      }
    };
    const requestAny = async (paths: string[]): Promise<Record<string, unknown> | null> => {
      for (const path of paths) {
        const data = await request(path);
        if (data) return data;
      }
      return null;
    };
    const load = async () => {
      const [
        registrationInfo,
        contractDoc,
        launchTraining,
        financeInvoices,
        quickView,
        assignments,
        assessmentSubmittals,
        scoringData,
      ] = await Promise.all([
        requestAny([`/api/company/projects/${projectId}/facilitator-registration-info`]),
        requestAny([`/api/company/projects/${projectId}/work-order-document`]),
        requestAny([
          `/api/facilitator/projects/${projectId}/launch-and-training`,
          `/api/facilitator/projects/${projectId}/launch-training`,
          `/api/facilitators/projects/${projectId}/launch-and-training`,
          `/api/facilitators/projects/${projectId}/launch-training`,
        ]),
        requestAny([
          `/api/facilitator/projects/${projectId}/finance-v2/invoices`,
          `/api/facilitators/projects/${projectId}/finance-v2/invoices`,
          `/api/facilitator/projects/${projectId}/finance-v2/proforma`,
          `/api/facilitators/projects/${projectId}/finance-v2/proforma`,
        ]),
        requestAny([
          `/api/company/projects/${projectId}/quickview`,
          `/api/company/projects/${projectId}/quick-view`,
        ]),
        requestAny([
          `/api/company/projects/${projectId}/assignments`,
          `/api/company/projects/${projectId}/assignment-details`,
        ]),
        requestAny([
          `/api/company/projects/${projectId}/assessment-checklist-documents`,
          `/api/company/projects/${projectId}/assessment-checklist-documents?criteria_id=1`,
        ]),
        requestAny([
          `/api/assessor/projects/${projectId}/scoring`,
          `/api/assessor/projects/${projectId}/assessment-scoring`,
          `/api/assessor/projects/${projectId}/assessment_scoring`,
        ]),
      ]);
      if (cancelled) return;
      const hasRegistration = hasRegistrationStepData(registrationInfo);
      const hasContract = hasRegistration || hasContractStepData(contractDoc);
      const hasCoordinatorAssigned = hasCoordinatorAssignedPayload(quickView, assignments);
      const hasLaunch =
        hasLaunchTrainingStepData(launchTraining) ||
        isLaunchTrainingNextStep(quickView) ||
        hasCoordinatorAssigned;
      const hasFinance = hasFinanceStepData(financeInvoices);
      const hasFinanceCompleted = hasFinanceCompletedStepData(financeInvoices);
      const hasSubmittals = hasAssessmentSubmittalsData(assessmentSubmittals) || hasFinanceCompleted;
      const hasScoring = hasScoringStepData(scoringData) || hasAssessmentSubmittalsData(assessmentSubmittals);
      setEnabledTabs({
        "quick-view": true,
        "registration-info": hasRegistration,
        "contract-document": hasContract,
        "launch-training": hasLaunch,
        expenses: hasFinance,
        "assessment-checklist-documents": hasSubmittals,
        scoring: hasScoring,
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, isFacilitatorFlow]);

  const visibleTabs = isFacilitatorFlow
    ? tabs.filter((tab) => {
        const canOpen = enabledTabs[tab.key] ?? tab.key === "quick-view";
        return canOpen || pathname === tab.href;
      })
    : tabs;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
      {visibleTabs.map((tab, idx) => {
        const isActive = pathname === tab.href;
        return (
          <div key={tab.key} className="inline-flex items-center">
            <Link
              href={tab.href}
              className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium ${
                isActive ? "text-[#2f3a46]" : "text-[#7b8798] hover:text-[#2f3a46]"
              }`}
            >
              <span className="inline-flex items-center justify-center opacity-80">
                <TabIcon tabKey={tab.key} active={isActive} />
              </span>
              <span>{tab.label}</span>
            </Link>
            {idx < visibleTabs.length - 1 ? (
              <span className="mx-1 text-[#c1c9d6]">›</span>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

