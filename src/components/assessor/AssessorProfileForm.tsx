"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthApiError, fetchAssessorGrades, fetchIndustries, fetchStates, type SelectOption } from "@/lib/auth-api";
import { resolvePublicFileUrl } from "@/lib/storage/public-url";
import {
  type AssessorProfileFileKey,
  buildAssessorProfileFormDataWithStorage,
  getAssessorMyProfile,
  lookupBankDetailsByIfsc,
  patchAssessorSelfProfile,
} from "@/lib/assessor-profile-api";
import { mapServerProfileToFormValues, type AssessorProfileFormValues } from "@/lib/assessor-profile-map";
import {
  appendProfileSubmitMeta,
  DOC_STATUS_FORM_KEYS,
  emptyDocCheckStatuses,
  extractDocCheckStatuses,
  extractHasProfileImageFromServer,
  isDigitsOnly,
  isIndianMobile,
  isPincodeDigits,
  type DocStatusFileKey,
  type ProfileFieldErrors,
  validateAssessorProfile,
} from "@/lib/assessor-profile-validation";
import { AUTH_LOGIN_EMAIL_KEY, getAssessorIdFromStoredUser } from "@/lib/auth-user";
import { formatUploadAllowedHint, UPLOAD_ALLOWED } from "@/lib/upload-allowed";

const emptyForm: AssessorProfileFormValues = {
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
  gstYes: true,
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
  { label: "Bio Data", key: "biodata" },
  { label: "Vendor Registration Form", key: "vendor_registration_form" },
  { label: "Non-Disclosure Agreement", key: "non_disclosure_agreement" },
  { label: "Health Declaration", key: "health_declaration" },
  { label: "GST Declaration", key: "gst_declaration" },
  { label: "PAN Card", key: "pan_card" },
  { label: "Cancelled Cheque", key: "cancelled_cheque" },
];

type ProfileTab = "profile" | "bankDocs";

const PROFILE_TAB_FIELDS = new Set<string>([
  "profile_image",
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
  "pancardNumber",
  "gstNumber",
  "emergencyContactName",
  "emergencyMobile",
  "emergencyAddressLine1",
  "emergencyAddressLine2",
  "emergencyCity",
  "emergencyState",
  "emergencyPincode",
]);

const BANK_DOC_TAB_FIELDS = new Set<string>([
  "bankName",
  "accountNumber",
  "branchName",
  "ifscCode",
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
): string {
  const rawStatus = (docStatuses[docKey] ?? "0").trim();
  const serverName = serverDocNames[docKey]?.trim() ?? "";
  if (rawStatus !== "0") {
    return rawStatus;
  }
  return serverName ? "3" : "0";
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
  const candidates = [
    key,
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
    const entry = approvals[key];
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
  statusNormalized: "Pending" | "Approved" | "Rejected" | "",
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
  return resolvePublicFileUrl(value);
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
  const [ifscLookupLoading, setIfscLookupLoading] = useState(false);
  const [ifscLookupError, setIfscLookupError] = useState("");
  const ifscLookupTimerRef = useRef<number | null>(null);
  const lastIfscLookupRef = useRef<string>("");
  const accountNumberTimerRef = useRef<number | null>(null);
  const alternateMobileTimerRef = useRef<number | null>(null);
  const emergencyMobileTimerRef = useRef<number | null>(null);
  const pancardTimerRef = useRef<number | null>(null);
  const pincodeTimerRef = useRef<number | null>(null);
  const emergencyPincodeTimerRef = useRef<number | null>(null);
  const [profileLocked, setProfileLocked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [canOpenBankDocsInEditMode, setCanOpenBankDocsInEditMode] = useState(false);
  const [assessorGrades, setAssessorGrades] = useState<string[]>([]);
  const [assessorGradesError, setAssessorGradesError] = useState("");
  const [stateOptions, setStateOptions] = useState<SelectOption[]>([]);
  const [industryOptions, setIndustryOptions] = useState<SelectOption[]>([]);
  const [stateOptionsError, setStateOptionsError] = useState("");
  const [industryOptionsError, setIndustryOptionsError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"Pending" | "Approved" | "Rejected" | "">("");
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

  const validatePanInline = useCallback((valueRaw: string): string => {
    const compact = valueRaw.trim().replaceAll(" ", "").toUpperCase();
    if (!compact) {
      return "";
    }
    if (compact.length !== 10) {
      return "PAN must be exactly 10 characters.";
    }
    if (!/^[A-Z0-9]+$/.test(compact)) {
      return "Please Enter a Valid PAN Card No";
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
  const showUpdateButton = isRejected && !editMode;
  const showProfileStepActions = !profileLocked;

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

  const refreshProfileFromServer = useCallback(async () => {
    const loginEmail = getLoginEmailFromStorage();
    const payload = await getAssessorMyProfile();

    const statusValue = payload.approval_status ?? payload.approvalStatus ?? "";
    const statusRaw =
      typeof statusValue === "string" ? statusValue.trim() : String(statusValue ?? "").trim();
    let statusNormalized: "Pending" | "Approved" | "Rejected" | "" = "";
    const lowered = statusRaw.toLowerCase();
    if (lowered === "approved") {
      statusNormalized = "Approved";
    } else if (lowered === "rejected") {
      statusNormalized = "Rejected";
    } else if (lowered === "pending") {
      statusNormalized = "Pending";
    }

    const mapped = mapServerProfileToFormValues(payload);
    if (!mapped.email && loginEmail) {
      mapped.email = loginEmail;
    }
    // Don't clobber user typing during background refreshes.
    // Only overwrite the form when the profile is in view-only mode.
    if (!isDirtyRef.current || profileLocked) {
      applyValues(mapped);
    }

    const fromApprovals = docStatusesFromDocumentApprovals(payload);
    const legacyDocStatuses = extractDocCheckStatuses(payload);
    const doc = normalizeLegacyDocStatusesForProfileRejection(
      statusNormalized,
      fromApprovals,
      legacyDocStatuses,
    );
    const hasImg = extractHasProfileImageFromServer(payload);
    const imgUrl = pickProfileImageUrl(payload);
    setProfileImageLoadError("");
    const fallbackDocNames: Record<DocStatusFileKey, string> = {
      biodata: pickServerDocFileName(payload, "biodata"),
      cancelled_cheque: pickServerDocFileName(payload, "cancelled_cheque"),
      gst_declaration: pickServerDocFileName(payload, "gst_declaration"),
      vendor_registration_form: pickServerDocFileName(payload, "vendor_registration_form"),
      non_disclosure_agreement: pickServerDocFileName(payload, "non_disclosure_agreement"),
      health_declaration: pickServerDocFileName(payload, "health_declaration"),
      pan_card: pickServerDocFileName(payload, "pan_card"),
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

    const docKeys = Object.keys(DOC_STATUS_FORM_KEYS) as DocStatusFileKey[];
    const effectiveDocValues = docKeys.map((key) => effectiveDocRowStatus(key, doc, docNames));
    const hasRejectedDoc = effectiveDocValues.some((value) => String(value).trim() === "2");
    const allApprovedDocs =
      effectiveDocValues.length > 0 && effectiveDocValues.every((value) => String(value).trim() === "1");
    const hasNonApprovedDoc = effectiveDocValues.some((value) => String(value).trim() !== "1");

    let derivedStatus = statusNormalized;
    if (hasRejectedDoc) {
      derivedStatus = "Rejected";
    } else if (hasNonApprovedDoc) {
      derivedStatus = "Pending";
    } else if (allApprovedDocs) {
      derivedStatus = "Approved";
    }

      setApprovalStatus(derivedStatus);

    const hasAnyUploadedDoc =
      effectiveDocValues.some((value) => String(value).trim() !== "0") || hasImg || Boolean(imgUrl);

    const locked =
      derivedStatus === "Approved" ||
      (derivedStatus === "Pending" && hasAnyUploadedDoc) ||
      (isProfileLockedFromPayload(payload) && derivedStatus !== "Rejected");

    const baseLocked = derivedStatus === "Rejected" ? true : locked;
    setProfileLocked(editMode ? false : baseLocked);
    if (derivedStatus !== "Rejected") {
      setEditMode(false);
    }
  }, [applyValues, editMode]);

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
    fetchAssessorGrades()
      .then((grades) => {
        if (!cancelled) {
          setAssessorGrades(grades);
          setAssessorGradesError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssessorGrades([]);
          setAssessorGradesError(error instanceof AuthApiError ? error.message : "Could not load assessor grades.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setIfscLookupError("");
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
      if (saving || refreshing) return;
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
  }, [reloadLatestProfileStatus, refreshing, saving, shouldAutoPollProfile]);

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
    requireText("pancardNumber", "PAN card number", form.pancardNumber);
    requireText("assessorGrade", "Assessor grade", form.assessorGrade);
    requireText("enrollmentDate", "Enrollment date", form.enrollmentDate);
    requireText("leadAssessor", "Lead assessor", form.leadAssessor);
    if (form.gstYes) {
      requireText("gstNumber", "GST number", form.gstNumber);
    }

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

  const saveAndContinue = async (): Promise<void> => {
    setSaveError("");
    setSaveSuccess("");
    setIfscLookupError("");

    const stepErrors = validateProfileStep();
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors(stepErrors);
      setActiveTab("profile");
      return;
    }

    setSavingKind("draft");
    setSaving(true);
    try {
      const body = await buildAssessorProfileFormDataWithStorage(form, files, {
        includeBankDetails: false,
        includeDocuments: false,
      });
      await patchAssessorSelfProfile(body);
      setHasExistingProfile(true);
      setFieldErrors({});
      snapshotRef.current = { ...form };
      filesSnapshotRef.current = { ...files };
      setFiles((prev) => ({ ...prev, profile_image: prev.profile_image ?? null }));
    } catch (error) {
      setSaveError(error instanceof AuthApiError ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
      setSavingKind(null);
      // Even if draft-save fails (backend may still require bank/docs),
      // allow user to proceed to step-2 to complete bank + documents.
      setCanOpenBankDocsInEditMode(true);
      setActiveTab("bankDocs");
    }
  };

  const runIfscLookup = async (normalized: string) => {
    if (!normalized) return;
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) {
      setIfscLookupError("Enter valid IFSC format (example: SBIN0005943).");
      return;
    }
    if (lastIfscLookupRef.current === normalized) {
      return;
    }
    lastIfscLookupRef.current = normalized;

    setIfscLookupError("");
    setIfscLookupLoading(true);
    try {
      const details = await lookupBankDetailsByIfsc(normalized);
      if (details.bank_name?.trim()) {
        setField("bankName", details.bank_name.trim());
        clearFieldError("bankName");
      }
      if (details.branch_name?.trim()) {
        setField("branchName", details.branch_name.trim());
        clearFieldError("branchName");
      }
      clearFieldError("ifscCode");
    } catch (error) {
      setIfscLookupError(error instanceof AuthApiError ? error.message : "Could not fetch bank details.");
    } finally {
      setIfscLookupLoading(false);
    }
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

    const body = await buildAssessorProfileFormDataWithStorage(form, files);
    appendProfileSubmitMeta(body, finalSubmit, docStatuses);
    setSavingKind(finalSubmit ? "final" : "draft");
    setSaving(true);
    try {
      await patchAssessorSelfProfile(body);
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
      if (finalSubmit) {
        setProfileLocked(true);
        setEditMode(false);
      }
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
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`px-0 py-1 text-sm font-semibold ${
              activeTab === "profile"
                ? "text-[var(--gc-primary)] underline underline-offset-4"
                : "text-[#667083] hover:text-[#2f3a46]"
            }`}
          >
            Profile Details
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canAccessBankDocsTab) return;
              setActiveTab("bankDocs");
            }}
            disabled={!canAccessBankDocsTab}
            aria-disabled={!canAccessBankDocsTab ? true : undefined}
            className={`px-0 py-1 text-sm font-semibold ${
              activeTab === "bankDocs"
                ? "text-[var(--gc-primary)] underline underline-offset-4"
                : !canAccessBankDocsTab
                  ? "cursor-not-allowed text-[#a8b0bd]"
                  : "text-[#667083] hover:text-[#2f3a46]"
            }`}
          >
            Bank Details & Upload Documents
          </button>
        </div>

        {activeTab === "profile" ? (
          <>
            <div>
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
                      <p className="text-xs font-medium text-[#606a78]">Profile image</p>
                      <div className="flex max-w-full flex-wrap items-center gap-2">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept={UPLOAD_ALLOWED.profileImage.accept}
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
                        <span className="text-[11px] text-[#6f7b8f]">
                          {formatUploadAllowedHint(UPLOAD_ALLOWED.profileImage)}
                        </span>
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <TextField label="Name *" disabled {...bindText("name")} />
                  <TextField label="Email Address *" type="email" disabled {...bindText("email")} />
                  <TextField label="Mobile Number *" disabled {...bindText("mobile")} />
                  <div className="space-y-1">
                    <SearchableSelect
                      id="industry-category"
                      label="Industry Category *"
                      required
                      value={form.industryCategory}
                      onChange={(next) => {
                        setField("industryCategory", next);
                        clearFieldError("industryCategory");
                      }}
                      options={industryOptions}
                      placeholder="Select Industry"
                      disabled={profileLocked}
                      error={fieldErrors.industryCategory || industryOptionsError}
                    />
                  </div>
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
                      Pancard Number <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      value={form.pancardNumber}
                      onChange={(event) => {
                        const nextRaw = event.target.value;
                        setField("pancardNumber", nextRaw);
                        clearFieldError("pancardNumber");
                        if (pancardTimerRef.current !== null) {
                          globalThis.window?.clearTimeout(pancardTimerRef.current);
                          pancardTimerRef.current = null;
                        }
                        pancardTimerRef.current =
                          globalThis.window?.setTimeout(() => {
                            const msg = validatePanInline(nextRaw);
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
                        const normalized = form.pancardNumber.trim().toUpperCase();
                        setField("pancardNumber", normalized);
                        const msg = validatePanInline(normalized);
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
                  <div className="space-y-1">
                    <SearchableSelect
                      id="assessor-grade"
                      label="Assessor Grade *"
                      required
                      value={form.assessorGrade}
                      onChange={(next) => {
                        setField("assessorGrade", next);
                        clearFieldError("assessorGrade");
                      }}
                      options={assessorGrades.map((g) => ({ value: g, label: g }))}
                      placeholder="Select Grade"
                      disabled={profileLocked}
                      error={fieldErrors.assessorGrade || assessorGradesError}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="enrollment-date" className="text-xs font-medium text-[#606a78]">
                      Enrollment Date <span className="text-[#d63f3f]">*</span>
                    </label>
                    <input
                      id="enrollment-date"
                      type="date"
                      value={form.enrollmentDate}
                      onChange={(event) => {
                        setField("enrollmentDate", event.target.value);
                        clearFieldError("enrollmentDate");
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
                    <p className="text-xs font-medium text-[#606a78]">
                      Lead Assessor <span className="text-[#d63f3f]">*</span>
                    </p>
                    <div
                      className={`flex items-center gap-5 text-xs ${
                        fieldErrors.leadAssessor ? "text-[#c62828]" : "text-[#495261]"
                      }`}
                    >
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="leadAssessor"
                          checked={form.leadAssessor === "1"}
                          onChange={() => {
                            setField("leadAssessor", "1");
                            clearFieldError("leadAssessor");
                          }}
                          disabled={profileLocked}
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="leadAssessor"
                          checked={form.leadAssessor === "0"}
                          onChange={() => {
                            setField("leadAssessor", "0");
                            clearFieldError("leadAssessor");
                          }}
                          disabled={profileLocked}
                        />
                        <span>No</span>
                      </label>
                    </div>
                    {fieldErrors.leadAssessor ? (
                      <p className="text-xs text-[#c62828]">{fieldErrors.leadAssessor}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[#606a78]">
                      GST <span className="text-[#d63f3f]">*</span>
                    </p>
                    <div className="flex items-center gap-5 text-xs text-[#495261]">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="gst"
                          checked={form.gstYes}
                          onChange={() => {
                            setField("gstYes", true);
                            clearFieldError("gstNumber");
                          }}
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="gst"
                          checked={!form.gstYes}
                          onChange={() => {
                            setField("gstYes", false);
                            clearFieldError("gstNumber");
                          }}
                        />
                        <span>No</span>
                      </label>
                    </div>
                  </div>
                  {form.gstYes ? <TextField label="GST number *" {...bindText("gstNumber")} /> : null}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[#4f5a68]">Emergency Contact Details</p>
              <div className="grid gap-3 md:grid-cols-3">
                <TextField label="Contact Name *" {...bindText("emergencyContactName")} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#606a78]">
                    Mobile Number <span className="text-[#d63f3f]">*</span>
                  </label>
                  <input
                    value={form.emergencyMobile}
                    onChange={(event) => {
                      const next = event.target.value;
                      setField("emergencyMobile", next);
                      if (emergencyMobileTimerRef.current !== null) {
                        globalThis.window?.clearTimeout(emergencyMobileTimerRef.current);
                        emergencyMobileTimerRef.current = null;
                      }
                      emergencyMobileTimerRef.current =
                        globalThis.window?.setTimeout(() => {
                          const msg = validateMobileInline(next, "Mobile");
                          setFieldErrors((prev) => {
                            if (!msg) {
                              if (!prev.emergencyMobile) return prev;
                              const copy = { ...prev };
                              delete copy.emergencyMobile;
                              return copy;
                            }
                            return { ...prev, emergencyMobile: msg };
                          });
                          emergencyMobileTimerRef.current = null;
                        }, 150) ?? null;
                    }}
                    onBlur={() => {
                      const msg = validateMobileInline(form.emergencyMobile, "Mobile");
                      if (msg) {
                        setFieldErrors((prev) => ({ ...prev, emergencyMobile: msg }));
                      }
                    }}
                    disabled={profileLocked}
                    className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                      fieldErrors.emergencyMobile
                        ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                        : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                    }`}
                    aria-invalid={fieldErrors.emergencyMobile ? true : undefined}
                  />
                  {fieldErrors.emergencyMobile ? (
                    <p className="text-xs text-[#c62828]">{fieldErrors.emergencyMobile}</p>
                  ) : null}
                </div>
                <TextField label="Address Line 1 *" {...bindText("emergencyAddressLine1")} />
                <TextField label="Address Line 2" {...bindText("emergencyAddressLine2")} />
                <TextField label="City *" {...bindText("emergencyCity")} />
                <div className="space-y-1">
                  <SearchableSelect
                    id="emergency-state"
                    label="State *"
                    required
                    value={form.emergencyState}
                    onChange={(next) => {
                      setField("emergencyState", next);
                      clearFieldError("emergencyState");
                    }}
                    options={stateOptions.map((opt) => ({ value: opt.label, label: opt.label }))}
                    placeholder="Select State"
                    disabled={profileLocked}
                    error={fieldErrors.emergencyState || stateOptionsError}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#606a78]">
                    Pincode <span className="text-[#d63f3f]">*</span>
                  </label>
                  <input
                    value={form.emergencyPincode}
                    onChange={(event) => {
                      const next = event.target.value;
                      setField("emergencyPincode", next);
                      if (emergencyPincodeTimerRef.current !== null) {
                        globalThis.window?.clearTimeout(emergencyPincodeTimerRef.current);
                        emergencyPincodeTimerRef.current = null;
                      }
                      emergencyPincodeTimerRef.current =
                        globalThis.window?.setTimeout(() => {
                          const msg = validatePincodeInline(next, "Emergency pincode");
                          setFieldErrors((prev) => {
                            if (!msg) {
                              if (!prev.emergencyPincode) return prev;
                              const copy = { ...prev };
                              delete copy.emergencyPincode;
                              return copy;
                            }
                            return { ...prev, emergencyPincode: msg };
                          });
                          emergencyPincodeTimerRef.current = null;
                        }, 120) ?? null;
                    }}
                    onBlur={() => {
                      const msg = validatePincodeInline(form.emergencyPincode, "Emergency pincode");
                      if (msg) {
                        setFieldErrors((prev) => ({ ...prev, emergencyPincode: msg }));
                      }
                    }}
                    disabled={profileLocked}
                    className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                      fieldErrors.emergencyPincode
                        ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                        : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                    }`}
                    aria-invalid={fieldErrors.emergencyPincode ? true : undefined}
                  />
                  {fieldErrors.emergencyPincode ? (
                    <p className="text-xs text-[#c62828]">{fieldErrors.emergencyPincode}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {editMode ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCancel}
                  className="rounded border border-[#d5dae3] bg-white px-4 py-1.5 text-xs text-[#667083] hover:bg-[#f7f9fc] disabled:opacity-60"
                >
                  Cancel
                </button>
              ) : null}
              {showProfileStepActions ? (
                <button
                  type="button"
                  disabled={saving || profileLocked}
                  onClick={() => {
                    void saveAndContinue();
                  }}
                  className={`${profileLocked ? "hidden" : ""} rounded bg-[var(--gc-primary)] px-4 py-1.5 text-xs text-white hover:bg-[var(--gc-primary-hover)] disabled:opacity-60`}
                >
                  {saving && savingKind === "draft"
                    ? "Saving…"
                    : "Save & Continue"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="rounded-lg border border-[#e4e9f1] bg-[#fbfcff] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#2f3a46]">Bank Details</p>
                  <p className="text-xs text-[#7a8798]">Fill account information before final submit.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="ifsc-code" className="text-xs font-medium text-[#606a78]">
                    IFSC Code <span className="text-[#d63f3f]">*</span>
                  </label>
                  <input
                    id="ifsc-code"
                    value={form.ifscCode}
                    onChange={(event) => {
                      const next = event.target.value.toUpperCase();
                      setField("ifscCode", next);
                      clearFieldError("ifscCode");
                      setIfscLookupError("");

                      const normalized = next.trim().toUpperCase();
                      if (ifscLookupTimerRef.current !== null) {
                        globalThis.window?.clearTimeout(ifscLookupTimerRef.current);
                        ifscLookupTimerRef.current = null;
                      }
                      if (!normalized) {
                        setIfscLookupLoading(false);
                        lastIfscLookupRef.current = "";
                        return;
                      }
                      // Trigger lookup immediately once IFSC becomes valid (11 chars), with small debounce.
                      ifscLookupTimerRef.current =
                        globalThis.window?.setTimeout(() => {
                          void runIfscLookup(normalized);
                          ifscLookupTimerRef.current = null;
                        }, 250) ?? null;
                    }}
                    onBlur={() => {
                      const normalized = form.ifscCode.trim().toUpperCase();
                      setField("ifscCode", normalized);
                      if (ifscLookupTimerRef.current !== null) {
                        globalThis.window?.clearTimeout(ifscLookupTimerRef.current);
                        ifscLookupTimerRef.current = null;
                      }
                      void runIfscLookup(normalized);
                    }}
                    className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                      fieldErrors.ifscCode || ifscLookupError
                        ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                        : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                    }`}
                    aria-invalid={fieldErrors.ifscCode || ifscLookupError ? true : undefined}
                  />
                  {ifscLookupLoading ? (
                    <p className="text-xs text-[#5a6b63]">Fetching bank details...</p>
                  ) : null}
                  {ifscLookupError ? <p className="text-xs text-[#c62828]">{ifscLookupError}</p> : null}
                  {fieldErrors.ifscCode ? <p className="text-xs text-[#c62828]">{fieldErrors.ifscCode}</p> : null}
                </div>
                <TextField label="Bank Name *" {...bindText("bankName")} />
                <TextField label="Branch Name" {...bindText("branchName")} />
                <div className="space-y-1">
                  <label htmlFor="account-number" className="text-xs font-medium text-[#606a78]">
                    Account Number <span className="text-[#d63f3f]">*</span>
                  </label>
                  <input
                    id="account-number"
                    value={form.accountNumber}
                    onChange={(event) => {
                      const next = event.target.value;
                      setField("accountNumber", next);
                      if (accountNumberTimerRef.current !== null) {
                        globalThis.window?.clearTimeout(accountNumberTimerRef.current);
                        accountNumberTimerRef.current = null;
                      }
                      // Validate while typing with small debounce for immediate feedback.
                      accountNumberTimerRef.current =
                        globalThis.window?.setTimeout(() => {
                          const msg = validateAccountNumberInline(next);
                          setFieldErrors((prev) => {
                            if (!msg) {
                              if (!prev.accountNumber) return prev;
                              const copy = { ...prev };
                              delete copy.accountNumber;
                              return copy;
                            }
                            return { ...prev, accountNumber: msg };
                          });
                          accountNumberTimerRef.current = null;
                        }, 150) ?? null;
                    }}
                    onBlur={() => {
                      const msg = validateAccountNumberInline(form.accountNumber);
                      if (msg) {
                        setFieldErrors((prev) => ({ ...prev, accountNumber: msg }));
                      }
                    }}
                    disabled={profileLocked}
                    className={`h-8 w-full rounded border bg-transparent px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
                      fieldErrors.accountNumber
                        ? "border-[#c62828] focus:border-[#c62828] focus:ring-[#f8d7da]"
                        : "border-[#d7dbe4] focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
                    }`}
                    aria-invalid={fieldErrors.accountNumber ? true : undefined}
                  />
                  {fieldErrors.accountNumber ? (
                    <p className="text-xs text-[#c62828]">{fieldErrors.accountNumber}</p>
                  ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-[#e4e9f1] bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#2f3a46]">
                      Upload Documents <span className="text-[#d63f3f]">*</span>
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    {DOCUMENT_ROWS.map((row, index) => {
                      const docKey = row.key as DocStatusFileKey;
                      const serverName = serverDocNames[docKey]?.trim() ?? "";
                      const effectiveStatus = effectiveDocRowStatus(docKey, docStatuses, serverDocNames);
                      const selected = files[row.key] ?? null;
                      const hasSelected = Boolean(selected);
                      const isLocalReuploadForRejected = hasSelected && docStatuses[docKey] === "2";
                      const statusForDisplay = isLocalReuploadForRejected ? "3" : effectiveStatus;
                      const badgeForDisplay = docStatusBadge(statusForDisplay);
                      const hasServer = effectiveStatus !== "0";
                      const rejectedDocNeedsReupload = docStatuses[docKey] === "2";
                      const canUploadDoc =
                        approvalStatus === "Rejected"
                          ? editMode && rejectedDocNeedsReupload
                          : !profileLocked && (!hasServer || rejectedDocNeedsReupload);
                      let fileLabel = "No file selected";
                      if (hasSelected) {
                        fileLabel = fileNameOrDash(selected);
                      } else if (hasServer) {
                        fileLabel = serverName || "Uploaded File";
                      }

                      return (
                        <div
                          key={row.key}
                          className={`rounded-md border px-3 py-3 ${
                            fieldErrors[row.key] ? "border-[#f0caca] bg-[#fff8f8]" : "border-[#e7ecf3] bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium text-[#2f3a46]">
                                {index + 1}. {row.label} <span className="text-[#d63f3f]">*</span>
                              </p>
                              {badgeForDisplay ? (
                                <span
                                  className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${badgeForDisplay.className}`}
                                >
                                  {badgeForDisplay.label}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-[#5f6876]">
                              {fileLabel}
                            </p>
                            {docRemarks[docKey]?.trim() && !isLocalReuploadForRejected ? (
                              <p
                                className={`mt-1 text-xs ${
                                  statusForDisplay === "2" ? "text-[#a94442]" : "text-[#5f6876]"
                                }`}
                              >
                                Remarks: {docRemarks[docKey]}
                              </p>
                            ) : null}
                            {fieldErrors[row.key] ? (
                              <p className="mt-1 text-xs text-[#c62828]">{fieldErrors[row.key]}</p>
                            ) : null}
                            {approvalStatus === "Rejected" && rejectedDocNeedsReupload && !editMode ? (
                              <p className="mt-1 text-xs text-[#7a8798]">
                                Click Update to re-upload this rejected document.
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-shrink-0 items-center justify-start gap-2">
                            {canUploadDoc ? (
                              <>
                                <input
                                  ref={(node) => {
                                    fileInputsRef.current[row.key] = node;
                                  }}
                                  type="file"
                                  accept={UPLOAD_ALLOWED.profileDocument.accept}
                                  className="hidden"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    clearFieldError(row.key);
                                    if (!file) {
                                      return;
                                    }
                                    setFiles((previous) => ({ ...previous, [row.key]: file }));
                                    // Once user re-uploads a rejected doc, reflect it as pending in UI
                                    // and clear old rejection remark until fresh admin review.
                                    setDocStatuses((previous) => ({ ...previous, [docKey]: "3" }));
                                    setDocRemarks((previous) => ({ ...previous, [docKey]: "" }));
                                  }}
                                />
                                <button
                                  type="button"
                                  className="rounded border border-[#cdd8e8] bg-white px-3 py-1 text-xs font-medium text-[#2f6ea5] hover:bg-[#f1f6ff]"
                                  onClick={() => fileInputsRef.current[row.key]?.click()}
                                >
                                  Upload
                                </button>
                                <span className="text-[11px] text-[#6f7b8f]">
                                  {formatUploadAllowedHint(UPLOAD_ALLOWED.profileDocument)}
                                </span>
                              </>
                            ) : null}
                            {hasSelected ? (
                              <a
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#cdd8e8] bg-white text-[#2f6ea5] hover:bg-[#f1f6ff]"
                                href={URL.createObjectURL(selected!)}
                                target="_blank"
                                rel="noreferrer"
                              aria-label={`View ${row.label}`}
                              title="View"
                              >
                              <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                aria-hidden
                              >
                                <path
                                  d="M1.8 10C3.9 6.6 6.6 4.9 10 4.9C13.4 4.9 16.1 6.6 18.2 10C16.1 13.4 13.4 15.1 10 15.1C6.6 15.1 3.9 13.4 1.8 10Z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <circle cx="10" cy="10" r="2.2" fill="currentColor" />
                              </svg>
                              </a>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving || profileLocked}
                onClick={() => setShowFinalSubmitConfirm(true)}
                className={`${profileLocked ? "hidden" : ""} rounded bg-[#2e6b4a] px-4 py-1.5 text-xs text-white hover:bg-[#255a3e] disabled:opacity-60`}
              >
                {saving && savingKind === "final"
                  ? "Submitting…"
                  : "Final submit"}
              </button>
            </div>
          </>
        )}
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
