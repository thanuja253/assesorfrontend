"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthApiError, fetchIndustries, fetchStates, getApiUrl, type SelectOption } from "@/lib/auth-api";
import {
  type AssessorProfileFileKey,
  buildAssessorProfileFormData,
  getFacilitatorApprovalStatus,
  getFacilitatorByEmail,
  getAssessorMyProfile,
  patchAssessorSelfProfile,
} from "@/lib/assessor-profile-api";
import { mapServerProfileToFormValues, type AssessorProfileFormValues } from "@/lib/assessor-profile-map";
import {
  appendProfileSubmitMeta,
  DOC_STATUS_FORM_KEYS,
  emptyDocCheckStatuses,
  extractDocCheckStatuses,
  extractHasProfileImageFromServer,
  getDocumentFileValidationError,
  hasEducationalQualificationKeyword,
  hasSpecializationKeyword,
  isAreaSpecializationPattern,
  isDigitsOnly,
  isIndianMobile,
  isPincodeDigits,
  isQualificationCertificationPattern,
  type DocStatusFileKey,
  type ProfileFieldErrors,
  validateAssessorProfile,
} from "@/lib/assessor-profile-validation";
import { AUTH_LOGIN_EMAIL_KEY, getAssessorIdFromStoredUser } from "@/lib/auth-user";

const emptyForm: AssessorProfileFormValues = {
  consultantId: "",
  accountStatus: "",
  accountActivationDate: "",
  name: "",
  email: "",
  mobile: "",
  industryCategory: "",
  enrollmentDate: "",
  leadAssessor: "",
  assessorGrade: "",
  alternateMobile: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  pancardNumber: "",
  gstNumber: "",
  companyWebsiteDetails: "",
  linkedinProfile: "",
  gstYes: true,
  declarationAccepted: true,
  emergencyContactName: "",
  emergencyMobile: "",
  emergencyAddressLine1: "",
  emergencyAddressLine2: "",
  emergencyCity: "",
  emergencyState: "",
  emergencyPincode: "",
  bankName: "",
  accountNumber: "",
  branchName: "",
  ifscCode: "",
};

const DOCUMENT_ROWS: { label: string; key: AssessorProfileFileKey }[] = [
  { label: "Upload Vendor Form", key: "vendor_registration_form" },
  { label: "Brief Profile - Individual", key: "biodata" },
  { label: "Brief Profile - Organization", key: "non_disclosure_agreement" },
  { label: "Projects Handled (in last 2 years)", key: "health_declaration" },
];

type ProfileTab = "profile" | "bankDocs";

const PROFILE_TAB_FIELDS = new Set<string>([
  "profile_image",
  "consultantId",
  "name",
  "email",
  "mobile",
  "industryCategory",
  "alternateMobile",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "accountStatus",
  "accountActivationDate",
  "pancardNumber",
  "gstNumber",
  "companyWebsiteDetails",
  "linkedinProfile",
  "declarationAccepted",
]);

const BANK_DOC_TAB_FIELDS = new Set<string>([
  ...DOCUMENT_ROWS.map((row) => row.key),
]);

function docStatusBadge(status: string | undefined): { label: string; className: string } | null {
  const normalized = (status ?? "").trim();
  if (!normalized || normalized === "0") {
    return null;
  }
  if (normalized === "1") {
    return { label: "Accepted", className: "bg-[#e8f6ea] text-[#2d6a3e]" };
  }
  if (normalized === "2") {
    return { label: "Rejected", className: "bg-[#fdeaea] text-[#a94442]" };
  }
  return { label: "Pending", className: "bg-[#eef2ff] text-[#2f3a46]" };
}

function effectiveDocRowStatus(
  docKey: DocStatusFileKey,
  docStatuses: Record<DocStatusFileKey, string>,
  serverDocNames: Record<DocStatusFileKey, string>,
  profileApprovalStatus: "Pending" | "Approved" | "Rejected" | "Draft" | "" = "",
): string {
  const rawStatus = (docStatuses[docKey] ?? "0").trim();
  const serverName = serverDocNames[docKey]?.trim() ?? "";
  if (rawStatus !== "0") {
    return rawStatus;
  }
  if (!serverName) {
    return "0";
  }
  if (profileApprovalStatus === "Approved") {
    return "1";
  }
  if (profileApprovalStatus === "Rejected") {
    return "2";
  }
  return "3";
}

function fileNameOrDash(file: File | null | undefined): string {
  if (file?.name) {
    return file.name;
  }
  return "—";
}

function emptyDocMeta(): Record<DocStatusFileKey, string> {
  return {
    biodata: "",
    cancelled_cheque: "",
    gst_declaration: "",
    vendor_registration_form: "",
    non_disclosure_agreement: "",
    health_declaration: "",
    pan_card: "",
  };
}

function fileNameFromPath(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  const noQuery = raw.split("?")[0] ?? raw;
  const clean = noQuery.replace(/\/+$/, "");
  const lastSlash = clean.lastIndexOf("/");
  const base = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

function pickServerDocFileName(payload: Record<string, unknown>, key: string): string {
  const aliasByKey: Record<string, string[]> = {
    biodata: ["brief_profile_individual"],
    non_disclosure_agreement: ["brief_profile_organization"],
    health_declaration: ["projects_handled"],
  };
  const aliases = aliasByKey[key] ?? [];
  const candidates = [
    key,
    ...aliases,
    `${key}_url`,
    `${key}Url`,
    `${key}_path`,
    `${key}Path`,
    `${key}_file`,
    `${key}File`,
    `${key}_filename`,
    `${key}Filename`,
    `${key}_name`,
    `${key}Name`,
    ...aliases.map((alias) => `${alias}_url`),
    ...aliases.map((alias) => `${alias}Url`),
    ...aliases.map((alias) => `${alias}_path`),
    ...aliases.map((alias) => `${alias}Path`),
    ...aliases.map((alias) => `${alias}_file`),
    ...aliases.map((alias) => `${alias}File`),
    ...aliases.map((alias) => `${alias}_filename`),
    ...aliases.map((alias) => `${alias}Filename`),
    ...aliases.map((alias) => `${alias}_name`),
    ...aliases.map((alias) => `${alias}Name`),
  ];
  for (const k of candidates) {
    const value = payload[k];
    if (typeof value === "string" && value.trim()) {
      const name = fileNameFromPath(value);
      if (name) return name;
    }
  }
  return "";
}

function normalizeApprovalState(value: unknown): "approved" | "rejected" | "pending" | "" {
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "1" || lowered === "approved" || lowered === "accept" || lowered === "accepted") {
      return "approved";
    }
    if (lowered === "2" || lowered === "rejected" || lowered === "reject") {
      return "rejected";
    }
    if (lowered === "0" || lowered === "pending" || lowered === "uploaded" || lowered === "submitted") {
      return "pending";
    }
  }
  if (typeof value === "number") {
    if (value === 1) return "approved";
    if (value === 2) return "rejected";
    if (value === 0) return "pending";
  }
  return "";
}

function formatAccountActivationDate(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "-";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());
  return `${day}-${month}-${year}`;
}

function normalizeAccountStatus(value: string): { label: string; className: string } {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return { label: "-", className: "text-[#2b3340]" };
  }
  if (raw === "1" || raw === "active") {
    return { label: "Active", className: "text-[#2e7d32]" };
  }
  if (raw === "0" || raw === "inactive") {
    return { label: "Inactive", className: "text-[#a94442]" };
  }
  return { label: value.trim(), className: "text-[#2b3340]" };
}

function docStatusesFromDocumentApprovals(
  payload: Record<string, unknown>,
): {
  statuses: Record<DocStatusFileKey, string>;
  remarks: Record<DocStatusFileKey, string>;
  names: Record<DocStatusFileKey, string>;
} | null {
  const raw =
    payload.document_approvals ?? payload.documentApprovals ?? payload.doc_approvals ?? payload.docApprovals;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const approvals = raw as Record<string, unknown>;
  const keys: DocStatusFileKey[] = [
    "biodata",
    "vendor_registration_form",
    "non_disclosure_agreement",
    "health_declaration",
    "gst_declaration",
    "pan_card",
    "cancelled_cheque",
  ];

  const statuses = emptyDocCheckStatuses();
  const remarks = emptyDocMeta();
  const names = emptyDocMeta();

  for (const key of keys) {
    const aliasByKey: Partial<Record<DocStatusFileKey, string>> = {
      biodata: "brief_profile_individual",
      non_disclosure_agreement: "brief_profile_organization",
      health_declaration: "projects_handled",
    };
    const aliasEntry = aliasByKey[key] ? approvals[aliasByKey[key]!] : undefined;
    const entry = aliasEntry ?? approvals[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const state =
      normalizeApprovalState(rec.status ?? rec.approval_status ?? rec.approved ?? rec.state ?? rec.document_status);
    if (state === "approved") statuses[key] = "1";
    if (state === "rejected") statuses[key] = "2";
    if (state === "pending") statuses[key] = "3";

    const remarkValue = rec.remarks ?? rec.remark ?? rec.reason ?? rec.comment ?? rec.message;
    remarks[key] = typeof remarkValue === "string" ? remarkValue.trim() : "";

    const fileValue =
      rec.file_name ??
      rec.filename ??
      rec.name ??
      rec.file ??
      rec.file_url ??
      rec.url ??
      rec.path ??
      rec.file_path;
    if (typeof fileValue === "string" && fileValue.trim()) {
      names[key] = fileNameFromPath(fileValue);
    }
  }

  return { statuses, remarks, names };
}

function normalizeLegacyDocStatusesForProfileRejection(
  statusNormalized: "Draft" | "Pending" | "Approved" | "Rejected" | "",
  fromApprovals: {
    statuses: Record<DocStatusFileKey, string>;
    remarks: Record<DocStatusFileKey, string>;
    names: Record<DocStatusFileKey, string>;
  } | null,
  legacyStatuses: Record<DocStatusFileKey, string>,
): Record<DocStatusFileKey, string> {
  // If backend sent explicit document_approvals, trust those statuses.
  if (fromApprovals) {
    return fromApprovals.statuses;
  }
  // If only profile got rejected (without per-document rejection mapping),
  // do NOT convert all docs to rejected just from legacy doccheck flags.
  if (statusNormalized !== "Rejected") {
    return legacyStatuses;
  }
  const next = { ...legacyStatuses };
  (Object.keys(next) as DocStatusFileKey[]).forEach((key) => {
    if ((next[key] ?? "").trim() === "2") {
      next[key] = "3";
    }
  });
  return next;
}

function pickProfileImageUrl(payload: Record<string, unknown>): string {
  const keys = [
    "profile_image_url",
    "profileImageUrl",
    "profile_image",
    "profileImage",
    "company_logo",
    "companyLogo",
    "logo",
    "logoUrl",
  ];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveServerAssetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(blob:|data:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return getApiUrl(normalized);
}

function isProfileLockedFromPayload(payload: Record<string, unknown>): boolean {
  const candidates = [
    payload.profile_updated,
    payload.profileUpdated,
    payload.profile_update,
    payload.profileLocked,
    payload.profile_locked,
    payload.profile_updated_flag,
    payload.profileUpdatedFlag,
  ];
  for (const value of candidates) {
    if (value === 1 || value === "1" || value === true || value === "true") {
      return true;
    }
  }
  return false;
}

function getLoginEmailFromStorage(): string {
  if (globalThis.window === undefined) {
    return "";
  }
  return globalThis.window.localStorage.getItem(AUTH_LOGIN_EMAIL_KEY)?.trim() ?? "";
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  error,
  disabled,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email";
  error?: string;
  disabled?: boolean;
}>) {
  const borderClass = error
    ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
    : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]";

  const isRequired = label.includes("*");
  const labelText = label.replace("*", "").trim();
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[#606a78]">
        {labelText}
        {isRequired ? <span className="text-[#d63f3f]"> *</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${borderClass}`}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-xs text-[#c62828]">{error}</p> : null}
    </div>
  );
}

function SearchableSelect({
  id,
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
}: Readonly<{
  id: string;
  label: React.ReactNode;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    globalThis.window?.addEventListener("pointerdown", onPointerDown);
    globalThis.window?.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.window?.removeEventListener("pointerdown", onPointerDown);
      globalThis.window?.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const handle = globalThis.window?.setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        if (handle !== undefined) {
          globalThis.window?.clearTimeout(handle);
        }
      };
    }
  }, [open]);

  const borderClass = error
    ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
    : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]";

  const selectedLabel =
    options.find((opt) => opt.value === value)?.label ??
    options.find((opt) => opt.label === value)?.label ??
    "";

  const normalizedQuery = query.trim().toLowerCase();
  const filtered =
    normalizedQuery.length === 0
      ? options
      : options.filter((opt) => opt.label.toLowerCase().includes(normalizedQuery));

  const isRequired =
    Boolean(required) || (typeof label === "string" ? label.includes("*") : false);
  const labelNode =
    typeof label === "string" ? label.replace("*", "").trim() : label;

  return (
    <div ref={rootRef} className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-[#606a78]">
        {labelNode}
        {isRequired ? <span className="ml-0.5 font-semibold text-[#d63f3f]">*</span> : null}
      </label>

      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery("");
        }}
        className={`flex h-8 w-full items-center justify-between rounded border bg-transparent px-2 text-left text-xs text-[#2b3340] outline-none focus:ring-1 disabled:opacity-60 ${borderClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedLabel ? "" : "text-[#8a94a3]"}>
          {selectedLabel || placeholder || "Select"}
        </span>
        <span className="ml-2 text-[#7a8798]">▾</span>
      </button>

      {open ? (
        <div className="relative">
          <div className="absolute z-30 mt-1 w-full rounded border border-[#d7dbe4] bg-white shadow-lg">
            <div className="p-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="h-8 w-full rounded border border-[#d7dbe4] bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
              />
            </div>
            <div role="listbox" className="max-h-48 overflow-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[#7a8798]">No results</p>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={`${opt.value}__${opt.label}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#f3f7ff] ${
                        isSelected ? "bg-[#eef6ff] text-[#1f4d7a]" : "text-[#2b3340]"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected ? <span className="text-[#1f4d7a]">✓</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-[#c62828]">{error}</p> : null}
    </div>
  );
}

function Toast({
  message,
  onClose,
}: Readonly<{
  message: string;
  onClose: () => void;
}>) {
  if (!message) return null;
  return (
    <div className="fixed right-4 top-4 z-[60] w-[min(420px,calc(100vw-2rem))] rounded border border-[#c3e6cb] bg-[#e8f6ea] px-3 py-2 text-sm text-[#2d6a3e] shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-sm text-[#2d6a3e] hover:bg-[#d7f0dc]"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function validateAccountNumberInline(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (/\s{2,}/.test(raw)) {
    return "Account number cannot contain consecutive spaces.";
  }
  if (value.length < 10 || value.length > 50) {
    return "Account number must be 10–50 characters.";
  }
  if (!/^[a-zA-Z0-9]+$/.test(value)) {
    return "Account number may contain letters and numbers only.";
  }
  return "";
}

export function AssessorProfileForm() {
  const pathname = usePathname();
  const isFacilitatorFlow = (pathname ?? "").includes("/facilitator");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const toastTimerRef = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [assessorId, setAssessorId] = useState<string | null>(null);
  const [form, setForm] = useState<AssessorProfileFormValues>(emptyForm);
  const [files, setFiles] = useState<Partial<Record<AssessorProfileFileKey, File | null>>>({});
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [hasServerProfileImage, setHasServerProfileImage] = useState(false);
  const [serverProfileImageUrl, setServerProfileImageUrl] = useState("");
  const [profileImagePreviewUrl, setProfileImagePreviewUrl] = useState("");
  const [profileImageLoadError, setProfileImageLoadError] = useState("");
  const [docStatuses, setDocStatuses] = useState<Record<DocStatusFileKey, string>>(emptyDocCheckStatuses());
  const [serverDocNames, setServerDocNames] = useState<Record<DocStatusFileKey, string>>(
    emptyDocMeta(),
  );
  const [docRemarks, setDocRemarks] = useState<Record<DocStatusFileKey, string>>(
    emptyDocMeta(),
  );
  const snapshotRef = useRef<AssessorProfileFormValues | null>(null);
  const isDirtyRef = useRef(false);
  const filesSnapshotRef = useRef<Partial<Record<AssessorProfileFileKey, File | null>>>({});
  const docStatusesSnapshotRef = useRef<Record<DocStatusFileKey, string>>(emptyDocCheckStatuses());
  const hasServerProfileImageSnapshotRef = useRef(false);
  const serverProfileImageUrlSnapshotRef = useRef("");
  const serverDocNamesSnapshotRef = useRef<Record<DocStatusFileKey, string>>(
    emptyDocMeta(),
  );
  const docRemarksSnapshotRef = useRef<Record<DocStatusFileKey, string>>(
    emptyDocMeta(),
  );
  const [savingKind, setSavingKind] = useState<"draft" | "final" | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState(false);
  const alternateMobileTimerRef = useRef<number | null>(null);
  const pancardTimerRef = useRef<number | null>(null);
  const pincodeTimerRef = useRef<number | null>(null);
  const educationalQualificationTimerRef = useRef<number | null>(null);
  const qualificationTimerRef = useRef<number | null>(null);
  const specializationTimerRef = useRef<number | null>(null);
  const enrollmentTimerRef = useRef<number | null>(null);
  const companyWebsiteTimerRef = useRef<number | null>(null);
  const linkedinTimerRef = useRef<number | null>(null);
  const [profileLocked, setProfileLocked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [canOpenBankDocsInEditMode, setCanOpenBankDocsInEditMode] = useState(false);
  const savingRef = useRef(false);
  const refreshingRef = useRef(false);
  const editModeRef = useRef(false);
  const [stateOptions, setStateOptions] = useState<SelectOption[]>([]);
  const [industryOptions, setIndustryOptions] = useState<SelectOption[]>([]);
  const [stateOptionsError, setStateOptionsError] = useState("");
  const [industryOptionsError, setIndustryOptionsError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"Draft" | "Pending" | "Approved" | "Rejected" | "">("");
  const [documentsApprovalStatus, setDocumentsApprovalStatus] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const fileInputsRef = useRef<Partial<Record<AssessorProfileFileKey, HTMLInputElement | null>>>(
    {},
  );
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const setField = useCallback(<K extends keyof AssessorProfileFormValues>(key: K, value: AssessorProfileFormValues[K]) => {
    isDirtyRef.current = true;
    setForm((previous) => ({ ...previous, [key]: value }));
  }, []);

  const applyValues = useCallback((values: AssessorProfileFormValues) => {
    isDirtyRef.current = false;
    setForm(values);
    snapshotRef.current = values;
    filesSnapshotRef.current = {};
  }, []);

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((previous) => {
      if (!previous[key]) {
        return previous;
      }
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, []);

  const validateMobileInline = useCallback((valueRaw: string, fieldLabel: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!isDigitsOnly(value)) {
      return `${fieldLabel} must contain digits only.`;
    }
    if (value.length !== 10) {
      return `${fieldLabel} must be exactly 10 digits.`;
    }
    if (!isIndianMobile(value)) {
      return `Enter a valid 10-digit ${fieldLabel.toLowerCase()} starting with 6–9.`;
    }
    return "";
  }, []);

  const validateYearsInline = useCallback((valueRaw: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!/^\d+$/.test(value)) {
      return "Only numbers are allowed.";
    }
    const numericYears = Number(value);
    if (!Number.isFinite(numericYears) || numericYears < 0 || numericYears > 99) {
      return "Enter valid years between 0 and 99.";
    }
    return "";
  }, []);

  const validatePincodeInline = useCallback((valueRaw: string, label: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!isPincodeDigits(value)) {
      return `${label} must be exactly 6 digits.`;
    }
    return "";
  }, []);

  const validateUrlInline = useCallback((valueRaw: string, label: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return `${label} must be a valid URL (http/https).`;
      }
    } catch {
      return `${label} must be a valid URL (http/https).`;
    }
    return "";
  }, []);

  const validateQualificationInline = useCallback((valueRaw: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!isQualificationCertificationPattern(value)) {
      return "Enter valid qualification/certification details (letters, numbers and , . / ( ) & + - only).";
    }
    if (value.length < 3 || value.length > 120) {
      return "Qualification/certification must be 3 to 120 characters.";
    }
    return "";
  }, []);

  const validateEducationalQualificationInline = useCallback((valueRaw: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!isQualificationCertificationPattern(value)) {
      return "Enter valid educational qualification (letters, numbers and , . / ( ) & + - only).";
    }
    if (value.length < 2 || value.length > 80) {
      return "Educational qualification must be 2 to 80 characters.";
    }
    if (!hasEducationalQualificationKeyword(value)) {
      return "Enter a valid educational qualification.";
    }
    return "";
  }, []);

  const validateSpecializationInline = useCallback((valueRaw: string): string => {
    const value = valueRaw.trim();
    if (!value) {
      return "";
    }
    if (!isAreaSpecializationPattern(value)) {
      return "Enter valid area(s) of specialization (letters and , . / & + - only).";
    }
    if (value.length < 2 || value.length > 120) {
      return "Area(s) of specialization must be 2 to 120 characters.";
    }
    if (!hasSpecializationKeyword(value)) {
      return "Enter a valid area of specialization.";
    }
    return "";
  }, []);

  type TextFieldKey = {
    [K in keyof AssessorProfileFormValues]: AssessorProfileFormValues[K] extends string ? K : never;
  }[keyof AssessorProfileFormValues];

  const bindText = useCallback(
    (key: TextFieldKey) => ({
      value: form[key],
      error: fieldErrors[key],
      onChange: (value: string) => {
        setField(key, value);
        clearFieldError(key);
      },
    }),
    [clearFieldError, fieldErrors, form, setField],
  );

  const isRejected = approvalStatus === "Rejected";
  const hasRejectedDocs = useMemo(() => {
    const docKeys = Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[];
    return docKeys.some((key) => (docStatuses[key] ?? "0").trim() === "2");
  }, [docStatuses]);
  const showUpdateButton = (isRejected || hasRejectedDocs) && !editMode;
  const hasFormChanges = useMemo(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      return true;
    }
    return (Object.keys(form) as (keyof AssessorProfileFormValues)[]).some((key) => form[key] !== snapshot[key]);
  }, [form]);
  const hasDocStatusChanges = useMemo(() => {
    const snapshot = docStatusesSnapshotRef.current;
    const docKeys = Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[];
    return docKeys.some((key) => (docStatuses[key] ?? "").trim() !== (snapshot[key] ?? "").trim());
  }, [docStatuses]);
  const hasPendingFileSelections = useMemo(
    () => (Object.keys(files) as AssessorProfileFileKey[]).some((key) => Boolean(files[key])),
    [files],
  );
  const showProfileStepActions = !profileLocked && (hasFormChanges || hasDocStatusChanges || hasPendingFileSelections);
  const showApprovalStatusPanel =
    !isFacilitatorFlow && Boolean(approvalStatus || documentsApprovalStatus || profileStatus || approvalRemarks);
  const accountStatusView = useMemo(() => normalizeAccountStatus(form.accountStatus), [form.accountStatus]);
  const accountActivationDateView = useMemo(
    () => formatAccountActivationDate(form.accountActivationDate),
    [form.accountActivationDate],
  );

  const shouldAutoPollProfile = useMemo(() => {
    if (loading) {
      return false;
    }
    // Avoid UI flicker while user is editing/typing.
    // Polling is only needed in read-only submitted states.
    if (!profileLocked) {
      return false;
    }
    if (approvalStatus === "Pending") {
      return true;
    }
    const docKeys = Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[];
    return docKeys.some((key) => {
      const s = (docStatuses[key] ?? "0").trim();
      return s === "2" || s === "3";
    });
  }, [approvalStatus, docStatuses, loading, profileLocked]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  const refreshProfileFromServer = useCallback(async () => {
    const loginEmail = getLoginEmailFromStorage();
    const payload = await getAssessorMyProfile();
    const facilitatorRecord = loginEmail ? await getFacilitatorByEmail(loginEmail).catch(() => null) : null;
    const facilitatorIdForApprovalStatus = (() => {
      const candidates = [
        facilitatorRecord?.id,
        facilitatorRecord?._id,
        payload.id,
        payload._id,
        payload.facilitator_id,
        payload.facilitatorId,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
      return "";
    })();
    const facilitatorApprovalStatus = facilitatorIdForApprovalStatus
      ? await getFacilitatorApprovalStatus(facilitatorIdForApprovalStatus).catch(() => null)
      : null;
    const mergedPayload = { ...payload };
    if (facilitatorRecord) {
      Object.assign(mergedPayload, facilitatorRecord);
    }
    if (facilitatorApprovalStatus) {
      Object.assign(mergedPayload, facilitatorApprovalStatus);
    }

    const statusValue =
      mergedPayload.approval_status ??
      mergedPayload.approvalStatus ??
      mergedPayload.overall_approval_status ??
      mergedPayload.overallApprovalStatus ??
      mergedPayload.documents_approval_status ??
      mergedPayload.documentsApprovalStatus ??
      "";
    const statusRaw =
      typeof statusValue === "string" ? statusValue.trim() : String(statusValue ?? "").trim();
    let statusNormalized: "Draft" | "Pending" | "Approved" | "Rejected" | "" = "";
    const lowered = statusRaw.toLowerCase();
    if (lowered === "approved") {
      statusNormalized = "Approved";
    } else if (lowered === "rejected") {
      statusNormalized = "Rejected";
    } else if (lowered === "pending") {
      statusNormalized = "Pending";
    } else if (lowered === "draft") {
      statusNormalized = "Draft";
    }
    const remarksValue =
      mergedPayload.approval_remarks ??
      mergedPayload.approvalRemarks ??
      mergedPayload.admin_remarks ??
      mergedPayload.adminRemarks;
    setApprovalRemarks(typeof remarksValue === "string" ? remarksValue.trim() : "");
    const documentsStatusValue =
      mergedPayload.documents_approval_status ?? mergedPayload.documentsApprovalStatus ?? "";
    setDocumentsApprovalStatus(
      typeof documentsStatusValue === "string" ? documentsStatusValue.trim() : "",
    );
    const profileStatusValue = mergedPayload.profile_status ?? mergedPayload.profileStatus ?? "";
    setProfileStatus(typeof profileStatusValue === "string" ? profileStatusValue.trim() : "");

    const mapped = mapServerProfileToFormValues(mergedPayload);
    if (!mapped.email && loginEmail) {
      mapped.email = loginEmail;
    }
    // Don't clobber user typing during background refreshes.
    // Only overwrite the form when the profile is in view-only mode.
    if (!isDirtyRef.current || profileLocked) {
      applyValues(mapped);
    }

    const fromApprovals = docStatusesFromDocumentApprovals(mergedPayload);
    const legacyDocStatuses = extractDocCheckStatuses(mergedPayload);
    const doc = normalizeLegacyDocStatusesForProfileRejection(
      statusNormalized,
      fromApprovals,
      legacyDocStatuses,
    );
    const hasImg = extractHasProfileImageFromServer(mergedPayload);
    const imgUrl = pickProfileImageUrl(mergedPayload);
    setProfileImageLoadError("");
    const fallbackDocNames: Record<DocStatusFileKey, string> = {
      biodata: pickServerDocFileName(mergedPayload, "biodata"),
      cancelled_cheque: pickServerDocFileName(mergedPayload, "cancelled_cheque"),
      gst_declaration: pickServerDocFileName(mergedPayload, "gst_declaration"),
      vendor_registration_form: pickServerDocFileName(mergedPayload, "vendor_registration_form"),
      non_disclosure_agreement: pickServerDocFileName(mergedPayload, "non_disclosure_agreement"),
      health_declaration: pickServerDocFileName(mergedPayload, "health_declaration"),
      pan_card: pickServerDocFileName(mergedPayload, "pan_card"),
    };
    const docNames: Record<DocStatusFileKey, string> = (() => {
      if (!fromApprovals?.names) {
        return fallbackDocNames;
      }
      const merged = { ...fallbackDocNames };
      (Object.keys(fallbackDocNames) as DocStatusFileKey[]).forEach((key) => {
        const approvalName = fromApprovals.names[key]?.trim() ?? "";
        if (approvalName) {
          merged[key] = approvalName;
        }
      });
      return merged;
    })();
    const docRmks: Record<DocStatusFileKey, string> = fromApprovals?.remarks ?? emptyDocMeta();

    setDocStatuses(doc);
    docStatusesSnapshotRef.current = doc;
    setServerDocNames(docNames);
    serverDocNamesSnapshotRef.current = docNames;
    setDocRemarks(docRmks);
    docRemarksSnapshotRef.current = docRmks;
    setHasServerProfileImage(hasImg);
    hasServerProfileImageSnapshotRef.current = hasImg;
    setServerProfileImageUrl(imgUrl);
    serverProfileImageUrlSnapshotRef.current = imgUrl;
    setHasExistingProfile(true);

    // Approval state must come from backend as source of truth.
    setApprovalStatus(statusNormalized);
    const canEditRaw = mergedPayload.can_edit_profile ?? mergedPayload.canEditProfile;
    const canEditProfile =
      typeof canEditRaw === "boolean"
        ? canEditRaw
        : typeof canEditRaw === "number"
          ? canEditRaw !== 0
          : typeof canEditRaw === "string"
            ? !["false", "0", "no"].includes(canEditRaw.trim().toLowerCase())
            : null;
    const lockFromPayload = isProfileLockedFromPayload(mergedPayload);
    const locked =
      canEditProfile !== null ? !canEditProfile : statusNormalized === "Approved" || lockFromPayload;

    const baseLocked = locked;
    setProfileLocked(editModeRef.current ? false : baseLocked);
    if (baseLocked) {
      setEditMode(false);
    }
  }, [applyValues, isFacilitatorFlow]);

  const reloadLatestProfileStatus = useCallback(async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      await refreshProfileFromServer();
    } catch (error) {
      setLoadError(error instanceof AuthApiError ? error.message : "Could not load profile.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfileFromServer]);

  useEffect(() => {
    startTransition(() => {
      const id = getAssessorIdFromStoredUser();
      if (id) {
        setAssessorId(id);
      }

      const loginEmail = getLoginEmailFromStorage();

      refreshProfileFromServer()
        .catch((error: unknown) => {
          if (error instanceof AuthApiError && error.status === 404) {
            setProfileLocked(false);
            setApprovalStatus("");
            setApprovalRemarks("");
            setHasExistingProfile(false);
            const blankDoc = emptyDocCheckStatuses();
            setDocStatuses(blankDoc);
            docStatusesSnapshotRef.current = blankDoc;
            const blankNames = emptyDocMeta();
            setServerDocNames(blankNames);
            serverDocNamesSnapshotRef.current = blankNames;
            const blankRemarks = emptyDocMeta();
            setDocRemarks(blankRemarks);
            docRemarksSnapshotRef.current = blankRemarks;
            setHasServerProfileImage(false);
            hasServerProfileImageSnapshotRef.current = false;
            setServerProfileImageUrl("");
            serverProfileImageUrlSnapshotRef.current = "";
            applyValues({
              ...emptyForm,
              email: loginEmail,
            });
            return;
          }
          setLoadError(error instanceof AuthApiError ? error.message : "Could not load profile.");
        })
        .finally(() => {
          setLoading(false);
        });
    });
  }, [applyValues, refreshProfileFromServer]);

  useEffect(() => {
    let cancelled = false;
    fetchStates()
      .then((options) => {
        if (!cancelled) {
          setStateOptions(options);
          setStateOptionsError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStateOptions([]);
          setStateOptionsError(error instanceof AuthApiError ? error.message : "Could not load states.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchIndustries()
      .then((options) => {
        if (!cancelled) {
          setIndustryOptions(options);
          setIndustryOptionsError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setIndustryOptions([]);
          setIndustryOptionsError(error instanceof AuthApiError ? error.message : "Could not load industries.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCancel = () => {
    setSaveError("");
    setSaveSuccess("");
    if (toastTimerRef.current !== null) {
      globalThis.window?.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setEditMode(false);
    setCanOpenBankDocsInEditMode(false);
    setFieldErrors({});
    if (snapshotRef.current) {
      setForm(snapshotRef.current);
      setFiles({ ...filesSnapshotRef.current });
      setDocStatuses({ ...docStatusesSnapshotRef.current });
      setHasServerProfileImage(hasServerProfileImageSnapshotRef.current);
      setServerProfileImageUrl(serverProfileImageUrlSnapshotRef.current);
      setServerDocNames({ ...serverDocNamesSnapshotRef.current });
      setDocRemarks({ ...docRemarksSnapshotRef.current });
    } else {
      const loginEmail = getLoginEmailFromStorage();
      setForm({ ...emptyForm, email: loginEmail });
      setFiles({});
      const blankDoc = emptyDocCheckStatuses();
      setDocStatuses(blankDoc);
      docStatusesSnapshotRef.current = blankDoc;
      setHasServerProfileImage(false);
      hasServerProfileImageSnapshotRef.current = false;
      setServerProfileImageUrl("");
      serverProfileImageUrlSnapshotRef.current = "";
      const blankNames = emptyDocMeta();
      setServerDocNames(blankNames);
      serverDocNamesSnapshotRef.current = blankNames;
      const blankRemarks = emptyDocMeta();
      setDocRemarks(blankRemarks);
      docRemarksSnapshotRef.current = blankRemarks;
    }

    // After cancel, keep submitted profiles locked (Pending/Approved/Rejected view mode).
    if (approvalStatus) {
      setProfileLocked(true);
    }
  };

  useEffect(() => {
    if (!files.profile_image) {
      if (profileImagePreviewUrl) {
        URL.revokeObjectURL(profileImagePreviewUrl);
      }
      setProfileImagePreviewUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(files.profile_image);
    if (profileImagePreviewUrl) {
      URL.revokeObjectURL(profileImagePreviewUrl);
    }
    setProfileImagePreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.profile_image]);

  // Auto-refetch latest admin document approvals while anything is still pending/rejected at doc level,
  // or while overall approval is pending (even if top-level banner is hidden).
  useEffect(() => {
    if (!shouldAutoPollProfile) {
      return;
    }

    let cancelled = false;
    const tryReload = () => {
      if (cancelled) return;
      if (savingRef.current || refreshingRef.current) return;
      void reloadLatestProfileStatus();
    };

    tryReload();

    const intervalId = globalThis.window?.setInterval(tryReload, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tryReload();
      }
    };
    const onFocus = () => {
      tryReload();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    globalThis.window?.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (intervalId) {
        globalThis.window?.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      globalThis.window?.removeEventListener("focus", onFocus);
    };
  }, [reloadLatestProfileStatus, shouldAutoPollProfile]);

  const validateProfileStep = (): ProfileFieldErrors => {
    const errors: ProfileFieldErrors = {};
    const requireText = (key: keyof AssessorProfileFormValues, label: string, value: string) => {
      if (!value.trim()) {
        errors[key as string] = `${label} is required.`;
      }
    };

    // Profile image required before proceeding to step-2 (bank + documents).
    if (!profileLocked && !hasServerProfileImage && !files.profile_image) {
      errors.profile_image = "Profile image is required (JPEG/PNG).";
    }

    // Basic details required on Save & Continue (step 1)
    requireText("name", "Name", form.name);
    requireText("email", "Email", form.email);
    requireText("mobile", "Mobile number", form.mobile);
    requireText("industryCategory", "Industry category", form.industryCategory);
    requireText("addressLine1", "Address line 1", form.addressLine1);
    requireText("city", "City", form.city);
    requireText("state", "State", form.state);
    requireText("pincode", "Pincode", form.pincode);
    requireText(
      "pancardNumber",
      "No. of years working in environmental sustainability facilitation services",
      form.pancardNumber,
    );
    requireText("assessorGrade", "Educational qualification", form.assessorGrade);
    requireText("enrollmentDate", "Total no. of years of professional experience", form.enrollmentDate);
    requireText(
      "leadAssessor",
      "Additional professional qualification/certifications",
      form.leadAssessor,
    );
    requireText("gstNumber", "Areas of specialization", form.gstNumber);

    // Emergency contact required on Save & Continue (step 1)
    requireText("emergencyContactName", "Emergency contact name", form.emergencyContactName);
    requireText("emergencyMobile", "Emergency contact mobile", form.emergencyMobile);
    requireText("emergencyAddressLine1", "Emergency address line 1", form.emergencyAddressLine1);
    requireText("emergencyCity", "Emergency city", form.emergencyCity);
    requireText("emergencyState", "Emergency state", form.emergencyState);
    requireText("emergencyPincode", "Emergency pincode", form.emergencyPincode);

    if (form.pincode.trim() && !isPincodeDigits(form.pincode)) {
      errors.pincode = "Pincode must be exactly 6 digits.";
    }
    if (form.emergencyPincode.trim() && !isPincodeDigits(form.emergencyPincode)) {
      errors.emergencyPincode = "Emergency pincode must be exactly 6 digits.";
    }

    return errors;
  };

  const isProfileStepComplete = useMemo(() => {
    if (profileLocked) {
      return true;
    }
    const stepErrors = validateProfileStep();
    return Object.keys(stepErrors).length === 0;
  }, [profileLocked, validateProfileStep]);
  const canAccessBankDocsTab = isProfileStepComplete && (!editMode || canOpenBankDocsInEditMode);

  const handleSaveClick = (): void => {
    setSaveError("");
    setSaveSuccess("");
    const validationContext = {
      finalSubmit: true,
      hasServerProfileImage,
      docStatuses,
    };
    const errors = validateAssessorProfile(form, files, validationContext);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setShowFinalSubmitConfirm(true);
  };

  const persistProfile = async (finalSubmit: boolean): Promise<boolean> => {
    setSaveError("");
    setSaveSuccess("");
    const validationContext = {
      finalSubmit,
      hasServerProfileImage,
      docStatuses,
    };
    const errors = validateAssessorProfile(form, files, validationContext);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const hasProfileErrors = Object.keys(errors).some((key) => PROFILE_TAB_FIELDS.has(key));
      const hasBankDocErrors = Object.keys(errors).some((key) => BANK_DOC_TAB_FIELDS.has(key));
      if (hasProfileErrors) {
        setActiveTab("profile");
      } else if (hasBankDocErrors) {
        setActiveTab("bankDocs");
      }
      return false;
    }
    setFieldErrors({});

    const body = buildAssessorProfileFormData(form, files);
    appendProfileSubmitMeta(body, finalSubmit, docStatuses);
    setSavingKind(finalSubmit ? "final" : "draft");
    setSaving(true);
    try {
      await patchAssessorSelfProfile(body);
      await refreshProfileFromServer();
      setHasExistingProfile(true);
      // Once saved/submitted successfully, don't keep showing old validation states.
      setFieldErrors({});
      isDirtyRef.current = false;
      const toastMessage = finalSubmit ? "Profile created successfully." : "Profile saved successfully.";
      setSaveSuccess(toastMessage);
      if (toastTimerRef.current !== null) {
        globalThis.window?.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = globalThis.window?.setTimeout(() => {
        setSaveSuccess("");
        toastTimerRef.current = null;
      }, 3500) ?? null;
      snapshotRef.current = { ...form };
      filesSnapshotRef.current = { ...files };
      docStatusesSnapshotRef.current = { ...docStatuses };
      hasServerProfileImageSnapshotRef.current =
        hasServerProfileImage || Boolean(files.profile_image);
      if (files.profile_image) {
        setHasServerProfileImage(true);
      }
      setFiles({});
      return true;
    } catch (error) {
      setSaveError(error instanceof AuthApiError ? error.message : "Could not save profile.");
      return false;
    } finally {
      setSaving(false);
      setSavingKind(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-[#5f6876]">Loading profile…</div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 text-sm text-[#a94442]">{loadError}</div>
    );
  }

  return (
    <>
      <Toast
        message={saveSuccess}
        onClose={() => {
          if (toastTimerRef.current !== null) {
            globalThis.window?.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
          setSaveSuccess("");
        }}
      />
      <section className="px-4 py-3">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-[#2f3a46]">Profile</p>
        {showUpdateButton ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditMode(true);
              setProfileLocked(false);
              setCanOpenBankDocsInEditMode(false);
              setActiveTab("profile");
            }}
            className="rounded bg-[#2e6b4a] px-4 py-1.5 text-xs text-white hover:bg-[#255a3e] disabled:opacity-60"
          >
            Update
          </button>
        ) : null}
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <p className="px-0 py-1 text-sm font-semibold text-[var(--gc-primary)]">
            Profile Details & Attachments
          </p>
        </div>

        {
          <>
            <div>
              {showApprovalStatusPanel ? (
                <div className="mb-3 rounded border border-[#e4e9f1] bg-[#fafbff] px-3 py-2 text-xs text-[#4f5a68]">
                  {approvalStatus ? (
                    <p>
                      <span className="font-semibold">Approval status:</span> {approvalStatus}
                    </p>
                  ) : null}
                  {documentsApprovalStatus ? (
                    <p className="mt-1">
                      <span className="font-semibold">Documents status:</span> {documentsApprovalStatus}
                    </p>
                  ) : null}
                  {profileStatus ? (
                    <p className="mt-1">
                      <span className="font-semibold">Profile status:</span> {profileStatus}
                    </p>
                  ) : null}
                  {approvalRemarks ? (
                    <p className="mt-1">
                      <span className="font-semibold">Admin remarks:</span> {approvalRemarks}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="mb-2 text-xs font-semibold text-[#4f5a68]">Basic Details</p>
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  {(() => {
                    const serverUrl = resolveServerAssetUrl(serverProfileImageUrl);
                    const imageSrc = profileImagePreviewUrl || serverUrl;
                    return (
                      <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-dashed border-[#b7c4d6] bg-[#f7f9fc]">
                        {imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageSrc}
                        alt="Profile"
                        className="h-full w-full object-cover"
                        onError={() => {
                          if (profileImagePreviewUrl) {
                            setProfileImageLoadError("Could not load selected image preview.");
                          } else if (serverUrl) {
                            setProfileImageLoadError(`Could not load profile image from server (${serverUrl}).`);
                          } else {
                            setProfileImageLoadError("Could not load profile image.");
                          }
                        }}
                      />
                    ) : (
                      <svg className="h-14 w-14 text-[#98a4b3]" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
                        <path
                          d="M5 19.2c0-3 3-5.2 7-5.2s7 2.2 7 5.2"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                      </div>
                    );
                  })()}
                  {profileImageLoadError ? (
                    <p className="text-xs text-[#c62828]">{profileImageLoadError}</p>
                  ) : null}
                  {serverProfileImageUrl ? (
                    <a
                      className="text-xs font-medium text-[#3b79b3] hover:underline"
                      href={resolveServerAssetUrl(serverProfileImageUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open server image
                    </a>
                  ) : null}
                  {!profileLocked ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-[#606a78]">Profile image (PNG / JPEG)</p>
                      <div className="flex max-w-[260px] items-center gap-2">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setFiles((previous) => ({ ...previous, profile_image: file }));
                            clearFieldError("profile_image");
                          }}
                        />
                        <button
                          type="button"
                          className={`rounded border bg-white px-2 py-1 text-xs text-[#3b79b3] hover:bg-[#f3f7ff] ${
                            fieldErrors.profile_image ? "border-[#c62828]" : "border-[#d2dbe8]"
                          }`}
                          onClick={() => profileImageInputRef.current?.click()}
                        >
                          Upload
                        </button>
                        {profileImagePreviewUrl || serverProfileImageUrl ? (
                          <a
                            className="rounded border border-[#d2dbe8] bg-white px-2 py-1 text-xs text-[#3b79b3] hover:bg-[#f3f7ff]"
                            href={profileImagePreviewUrl || resolveServerAssetUrl(serverProfileImageUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        ) : null}
                      </div>
                      {fieldErrors.profile_image ? (
                        <p className="text-xs text-[#c62828]">{fieldErrors.profile_image}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[#7a8798]">Profile image is locked after submission.</p>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 lg:col-start-2">
                  <TextField label="Name *" disabled {...bindText("name")} />
                  <TextField label="Consultant ID" disabled {...bindText("consultantId")} />
                  <TextField label="Email Address *" type="email" disabled {...bindText("email")} />
                  <TextField label="Mobile Number *" disabled {...bindText("mobile")} />
                  <TextField
                    label="Organization *"
                    value={form.industryCategory}
                    onChange={(next) => {
                      setField("industryCategory", next);
                      clearFieldError("industryCategory");
                    }}
                    error={fieldErrors.industryCategory}
                    disabled={profileLocked}
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">Alternate Mobile Number</label>
                    <input
                      value={form.alternateMobile}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("alternateMobile", next);
                        if (alternateMobileTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(alternateMobileTimerRef.current);
                          alternateMobileTimerRef.current = null;
                        }
                        alternateMobileTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateMobileInline(next, "Alternate mobile");
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.alternateMobile) return prev;
                                const copy = { ...prev };
                                delete copy.alternateMobile;
                                return copy;
                              }
                              return { ...prev, alternateMobile: msg };
                            });
                            alternateMobileTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const msg = validateMobileInline(form.alternateMobile, "Alternate mobile");
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, alternateMobile: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.alternateMobile
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.alternateMobile ? true : undefined}
                    />
                    {fieldErrors.alternateMobile ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.alternateMobile}</p>
                    ) : null}
                  </div>
                  <TextField label="Address Line 1 *" {...bindText("addressLine1")} />
                  <TextField label="Address Line 2" {...bindText("addressLine2")} />
                  <TextField label="City *" {...bindText("city")} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">Account Status</label>
                    <p
                      className={`h-8 w-full rounded border border-[#d7dbe4] bg-[#f7f9fc] px-2 py-2 text-xs font-medium ${accountStatusView.className}`}
                    >
                      {accountStatusView.label}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">Account Activation Date</label>
                    <p className="h-8 w-full rounded border border-[#d7dbe4] bg-[#f7f9fc] px-2 py-2 text-xs text-[#2b3340]">
                      {accountActivationDateView}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <SearchableSelect
                      id="state"
                      label="State *"
                      required
                      value={form.state}
                      onChange={(next) => {
                        setField("state", next);
                        clearFieldError("state");
                      }}
                      options={stateOptions.map((opt) => ({ value: opt.label, label: opt.label }))}
                      placeholder="Select State"
                      disabled={profileLocked}
                      error={fieldErrors.state || stateOptionsError}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">
                      Pincode <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.pincode}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("pincode", next);
                        if (pincodeTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(pincodeTimerRef.current);
                          pincodeTimerRef.current = null;
                        }
                        pincodeTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validatePincodeInline(next, "Pincode");
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.pincode) return prev;
                                const copy = { ...prev };
                                delete copy.pincode;
                                return copy;
                              }
                              return { ...prev, pincode: msg };
                            });
                            pincodeTimerRef.current = null;
                          }, 120) ?? null;
                      }}
                      onBlur={() => {
                        const msg = validatePincodeInline(form.pincode, "Pincode");
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, pincode: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.pincode
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.pincode ? true : undefined}
                    />
                    {fieldErrors.pincode ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.pincode}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">
                      No. of years working in environmental sustainability facilitation services{" "}
                      <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.pancardNumber}
                      onChange={(event) => {
                        const nextRaw = event.target.value;
                        const hasInvalidChars = /[^\d]/.test(nextRaw);
                        const sanitized = nextRaw.replaceAll(/[^\d]/g, "");
                        setField("pancardNumber", sanitized);
                        if (pancardTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(pancardTimerRef.current);
                          pancardTimerRef.current = null;
                        }
                        if (hasInvalidChars) {
                          setFieldErrors((prev) => ({ ...prev, pancardNumber: "Only numbers are allowed." }));
                          return;
                        }
                        clearFieldError("pancardNumber");
                        pancardTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateYearsInline(sanitized);
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.pancardNumber) return prev;
                                const copy = { ...prev };
                                delete copy.pancardNumber;
                                return copy;
                              }
                              return { ...prev, pancardNumber: msg };
                            });
                            pancardTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.pancardNumber.trim();
                        setField("pancardNumber", normalized);
                        const msg = validateYearsInline(normalized);
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, pancardNumber: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.pancardNumber
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.pancardNumber ? true : undefined}
                    />
                    {fieldErrors.pancardNumber ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.pancardNumber}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 lg:col-start-2">
                  <h4 className="mb-3 text-sm font-semibold text-[#2f3a46]">Professional Details</h4>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">
                      Educational Qualification <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.assessorGrade}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("assessorGrade", next);
                        clearFieldError("assessorGrade");
                        if (educationalQualificationTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(educationalQualificationTimerRef.current);
                          educationalQualificationTimerRef.current = null;
                        }
                        educationalQualificationTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateEducationalQualificationInline(next);
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.assessorGrade) return prev;
                                const copy = { ...prev };
                                delete copy.assessorGrade;
                                return copy;
                              }
                              return { ...prev, assessorGrade: msg };
                            });
                            educationalQualificationTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.assessorGrade.trim();
                        setField("assessorGrade", normalized);
                        const msg = validateEducationalQualificationInline(normalized);
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, assessorGrade: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.assessorGrade
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.assessorGrade ? true : undefined}
                    />
                    {fieldErrors.assessorGrade ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.assessorGrade}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="enrollment-date" className="text-xs font-medium text-[#606a78]">
                      Total no. of Years of Professional Experience{" "}
                      <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      id="enrollment-date"
                      type="text"
                      value={form.enrollmentDate}
                      placeholder="Enter total years"
                      onChange={(event) => {
                        const nextRaw = event.target.value;
                        const hasInvalidChars = /[^\d]/.test(nextRaw);
                        const sanitized = nextRaw.replaceAll(/[^\d]/g, "");
                        setField("enrollmentDate", sanitized);
                        if (enrollmentTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(enrollmentTimerRef.current);
                          enrollmentTimerRef.current = null;
                        }
                        if (hasInvalidChars) {
                          setFieldErrors((prev) => ({ ...prev, enrollmentDate: "Only numbers are allowed." }));
                          return;
                        }
                        clearFieldError("enrollmentDate");
                        enrollmentTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateYearsInline(sanitized);
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.enrollmentDate) return prev;
                                const copy = { ...prev };
                                delete copy.enrollmentDate;
                                return copy;
                              }
                              return { ...prev, enrollmentDate: msg };
                            });
                            enrollmentTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.enrollmentDate.trim();
                        setField("enrollmentDate", normalized);
                        const msg = validateYearsInline(normalized);
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, enrollmentDate: msg }));
                        }
                      }}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.enrollmentDate
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      disabled={profileLocked}
                    />
                    {fieldErrors.enrollmentDate ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.enrollmentDate}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">
                      Additional Professional Qualification/Certifications{" "}
                      <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.leadAssessor}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("leadAssessor", next);
                        clearFieldError("leadAssessor");
                        if (qualificationTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(qualificationTimerRef.current);
                          qualificationTimerRef.current = null;
                        }
                        qualificationTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateQualificationInline(next);
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.leadAssessor) return prev;
                                const copy = { ...prev };
                                delete copy.leadAssessor;
                                return copy;
                              }
                              return { ...prev, leadAssessor: msg };
                            });
                            qualificationTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.leadAssessor.trim();
                        setField("leadAssessor", normalized);
                        const msg = validateQualificationInline(normalized);
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, leadAssessor: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.leadAssessor
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.leadAssessor ? true : undefined}
                    />
                    {fieldErrors.leadAssessor ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.leadAssessor}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">
                      Areas of Specialization <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.gstNumber}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("gstNumber", next);
                        clearFieldError("gstNumber");
                        if (specializationTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(specializationTimerRef.current);
                          specializationTimerRef.current = null;
                        }
                        specializationTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateSpecializationInline(next);
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.gstNumber) return prev;
                                const copy = { ...prev };
                                delete copy.gstNumber;
                                return copy;
                              }
                              return { ...prev, gstNumber: msg };
                            });
                            specializationTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.gstNumber.trim();
                        setField("gstNumber", normalized);
                        const msg = validateSpecializationInline(normalized);
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, gstNumber: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.gstNumber
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.gstNumber ? true : undefined}
                    />
                    {fieldErrors.gstNumber ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.gstNumber}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">Company website details</label>
                    <input
                      value={form.companyWebsiteDetails}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("companyWebsiteDetails", next);
                        clearFieldError("companyWebsiteDetails");
                        if (companyWebsiteTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(companyWebsiteTimerRef.current);
                          companyWebsiteTimerRef.current = null;
                        }
                        companyWebsiteTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateUrlInline(next, "Company website details");
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.companyWebsiteDetails) return prev;
                                const copy = { ...prev };
                                delete copy.companyWebsiteDetails;
                                return copy;
                              }
                              return { ...prev, companyWebsiteDetails: msg };
                            });
                            companyWebsiteTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.companyWebsiteDetails.trim();
                        setField("companyWebsiteDetails", normalized);
                        const msg = validateUrlInline(normalized, "Company website details");
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, companyWebsiteDetails: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.companyWebsiteDetails
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.companyWebsiteDetails ? true : undefined}
                    />
                    {fieldErrors.companyWebsiteDetails ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.companyWebsiteDetails}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#606a78]">LinkedIn Profile</label>
                    <input
                      value={form.linkedinProfile}
                      onChange={(event) => {
                        const next = event.target.value;
                        setField("linkedinProfile", next);
                        clearFieldError("linkedinProfile");
                        if (linkedinTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(linkedinTimerRef.current);
                          linkedinTimerRef.current = null;
                        }
                        linkedinTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validateUrlInline(next, "LinkedIn Profile");
                            setFieldErrors((prev) => {
                              if (!msg) {
                                if (!prev.linkedinProfile) return prev;
                                const copy = { ...prev };
                                delete copy.linkedinProfile;
                                return copy;
                              }
                              return { ...prev, linkedinProfile: msg };
                            });
                            linkedinTimerRef.current = null;
                          }, 150) ?? null;
                      }}
                      onBlur={() => {
                        const normalized = form.linkedinProfile.trim();
                        setField("linkedinProfile", normalized);
                        const msg = validateUrlInline(normalized, "LinkedIn Profile");
                        if (msg) {
                          setFieldErrors((prev) => ({ ...prev, linkedinProfile: msg }));
                        }
                      }}
                      disabled={profileLocked}
                      className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                        fieldErrors.linkedinProfile
                          ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                          : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                      }`}
                      aria-invalid={fieldErrors.linkedinProfile ? true : undefined}
                    />
                    {fieldErrors.linkedinProfile ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.linkedinProfile}</p>
                    ) : null}
                  </div>
                  </div>
                </div>
              </div>
            </div>

            
          
            <div className="space-y-4">
              <div className="rounded-lg border border-[#e4e9f1] bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#2f3a46]">
                      Upload Documents <span className="text-[#d63f3f]">*</span>
                    </p>
                    <p className="mt-1 text-xs text-[#6f7b8f]">
                      Allowed: .pdf, .jpg, .png, .jpeg (max 10MB each). Profile image supports PNG/JPEG.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                    {DOCUMENT_ROWS.map((row, index) => {
                      const docKey = row.key as DocStatusFileKey;
                      const serverName = serverDocNames[docKey]?.trim() ?? "";
                      const effectiveStatus = effectiveDocRowStatus(
                        docKey,
                        docStatuses,
                        serverDocNames,
                        approvalStatus,
                      );
                      const selected = files[row.key] ?? null;
                      const hasSelected = Boolean(selected);
                      const isLocalReuploadForRejected = hasSelected && docStatuses[docKey] === "2";
                      const statusForDisplay = isLocalReuploadForRejected ? "3" : effectiveStatus;
                      const badgeForDisplay = docStatusBadge(statusForDisplay);
                      const hasServer = effectiveStatus !== "0";
                      const rejectedDocNeedsReupload = docStatuses[docKey] === "2";
                      const canUploadDoc = rejectedDocNeedsReupload
                        ? editMode
                        : !profileLocked && !hasServer;
                      let fileLabel = "No file selected";
                      if (hasSelected) {
                        fileLabel = fileNameOrDash(selected);
                      } else if (hasServer) {
                        fileLabel = serverName || "Uploaded File";
                      }

                      return (
                        <div key={row.key} className="rounded-md border border-[#e7ecf3] bg-white px-3 py-3">
                          <p className="text-xs font-medium text-[#2f3a46]">
                            {index + 1}. {row.label} <span className="text-[#d63f3f]">*</span>
                          </p>

                          <div className="mt-2 flex items-center gap-2">
                            <input
                              ref={(node) => {
                                fileInputsRef.current[row.key] = node;
                              }}
                              type="file"
                              accept="application/pdf,image/jpg,image/jpeg,image/png"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                clearFieldError(row.key);
                                if (!file) {
                                  return;
                                }
                                const fileError = getDocumentFileValidationError(file);
                                if (fileError) {
                                  setFieldErrors((prev) => ({ ...prev, [row.key]: fileError }));
                                  event.target.value = "";
                                  return;
                                }
                                setFiles((previous) => ({ ...previous, [row.key]: file }));
                                setDocStatuses((previous) => ({ ...previous, [docKey]: "3" }));
                                setDocRemarks((previous) => ({ ...previous, [docKey]: "" }));
                              }}
                            />
                            <input
                              readOnly
                              value={canUploadDoc ? (hasSelected ? fileLabel : "") : fileLabel}
                              placeholder="Choose file"
                              className="h-7 w-full rounded border border-[#d5dbe6] bg-white px-2 text-xs text-[#5f6876]"
                            />
                            {canUploadDoc ? (
                              <button
                                type="button"
                                className="h-7 rounded bg-[#2f6ea5] px-3 text-xs text-white hover:bg-[#285d8a]"
                                onClick={() => fileInputsRef.current[row.key]?.click()}
                              >
                                {isFacilitatorFlow && rejectedDocNeedsReupload ? "Re-upload" : "Upload"}
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <p className="truncate text-[11px] text-[#5f6876]">
                              <span className="font-medium">Uploaded File</span> {fileLabel}
                            </p>
                            {hasSelected ? (
                              <>
                                <a
                                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#cdd8e8] bg-white text-[#2f6ea5] hover:bg-[#f1f6ff]"
                                  href={selected ? URL.createObjectURL(selected) : undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`View ${row.label}`}
                                  title="View"
                                >
                                  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" aria-hidden>
                                    <path d="M1.8 10C3.9 6.6 6.6 4.9 10 4.9C13.4 4.9 16.1 6.6 18.2 10C16.1 13.4 13.4 15.1 10 15.1C6.6 15.1 3.9 13.4 1.8 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="10" cy="10" r="2.2" fill="currentColor" />
                                  </svg>
                                </a>
                                <a
                                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#cdd8e8] bg-white text-[#2f6ea5] hover:bg-[#f1f6ff]"
                                  href={selected ? URL.createObjectURL(selected) : undefined}
                                  download={selected?.name ?? ""}
                                  aria-label={`Download ${row.label}`}
                                  title="Download"
                                >
                                  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" aria-hidden>
                                    <path d="M10 3.5V11.5M10 11.5L13 8.5M10 11.5L7 8.5M4 13.5V15.5H16V13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </a>
                              </>
                            ) : null}
                            {badgeForDisplay ? (
                              <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${badgeForDisplay.className}`}>
                                {badgeForDisplay.label}
                              </span>
                            ) : null}
                          </div>

                          {docRemarks[docKey]?.trim() && !isLocalReuploadForRejected ? (
                            <p className={`mt-1 text-xs ${statusForDisplay === "2" ? "text-[#a94442]" : "text-[#5f6876]"}`}>
                              Remarks: {docRemarks[docKey]}
                            </p>
                          ) : null}
                          {fieldErrors[row.key] ? (
                            <p className="mt-1 text-xs text-[#c62828]">{fieldErrors[row.key]}</p>
                          ) : null}
                          {(approvalStatus === "Rejected" || hasRejectedDocs) &&
                          rejectedDocNeedsReupload &&
                          !editMode ? (
                            <p className="mt-1 text-xs text-[#7a8798]">
                              Click Update to re-upload this rejected document.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
                <div className="mt-3">
                  <label className="inline-flex items-start gap-2 text-xs text-[#495261]">
                    <input
                      type="checkbox"
                      checked={form.declarationAccepted}
                      onChange={(event) => {
                        setField("declarationAccepted", event.target.checked);
                        clearFieldError("declarationAccepted");
                      }}
                      disabled={profileLocked}
                      className="mt-0.5"
                    />
                    <span>
                      I declare that the above facts are true to the best of my knowledge, and if proven wrong; I
                      will not have any liability in this regard.
                    </span>
                  </label>
                  {fieldErrors.declarationAccepted ? (
                    <p className="mt-1 text-xs text-[#c62828]">{fieldErrors.declarationAccepted}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {showProfileStepActions ? (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCancel}
                  className="rounded border border-[#d5dae3] bg-white px-4 py-1.5 text-xs text-[#667083] hover:bg-[#f7f9fc] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || profileLocked}
                  onClick={handleSaveClick}
                  className={`${profileLocked ? "hidden" : ""} rounded bg-[var(--gc-primary)] px-4 py-1.5 text-xs text-white hover:bg-[var(--gc-primary-hover)] disabled:opacity-60`}
                >
                  {saving && savingKind === "final" ? "Submitting…" : "Save"}
                </button>
              </div>
            ) : null}
          </>
        }
      </div>

      {showFinalSubmitConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-[#2f3a46]">Confirm final submit</h3>
            <p className="mt-2 text-sm text-[#5f6876]">
              After final submit, you cannot revert this profile back to draft. Do you want to continue?
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
                  void persistProfile(true);
                }}
                className="rounded bg-[#2e6b4a] px-4 py-1.5 text-xs text-white hover:bg-[#255a3e]"
              >
                Yes, Final Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </section>
    </>
  );
}
