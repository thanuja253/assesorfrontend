"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError, fetchAssessorGrades, fetchIndustries, fetchStates, type SelectOption } from "@/lib/auth-api";
import {
  type AssessorProfileFileKey,
  buildAssessorProfileFormData,
  getAssessorAdminProfile,
  lookupBankDetailsByIfsc,
  patchAssessorSelfProfile,
} from "@/lib/assessor-profile-api";
import { mapServerProfileToFormValues, type AssessorProfileFormValues } from "@/lib/assessor-profile-map";
import {
  appendProfileSubmitMeta,
  emptyDocCheckStatuses,
  extractDocCheckStatuses,
  extractHasProfileImageFromServer,
  type DocStatusFileKey,
  type ProfileFieldErrors,
  validateAssessorProfile,
} from "@/lib/assessor-profile-validation";
import { AUTH_LOGIN_EMAIL_KEY, getAssessorIdFromStoredUser } from "@/lib/auth-user";

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
    return { label: "Attempted", className: "bg-[#fff7e6] text-[#8a5a00]" };
  }
  return { label: "Pending", className: "bg-[#eef2ff] text-[#2f3a46]" };
}

function fileNameOrDash(file: File | null | undefined): string {
  if (file?.name) {
    return file.name;
  }
  return "—";
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
        className={`h-8 w-full rounded border bg-white px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${borderClass}`}
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

  return (
    <div ref={rootRef} className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-[#606a78]">
        {label} {required ? <span className="text-[#d63f3f]">*</span> : null}
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
        className={`flex h-8 w-full items-center justify-between rounded border bg-white px-2 text-left text-xs text-[#2b3340] outline-none focus:ring-1 disabled:opacity-60 ${borderClass}`}
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
                className="h-8 w-full rounded border border-[#d7dbe4] bg-white px-2 text-xs text-[#2b3340] outline-none focus:ring-1 focus:border-[var(--gc-focus)] focus:ring-[var(--gc-focus-ring)]"
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
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [assessorId, setAssessorId] = useState<string | null>(null);
  const [form, setForm] = useState<AssessorProfileFormValues>(emptyForm);
  const [files, setFiles] = useState<Partial<Record<AssessorProfileFileKey, File | null>>>({});
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [hasServerProfileImage, setHasServerProfileImage] = useState(false);
  const [serverProfileImageUrl, setServerProfileImageUrl] = useState("");
  const [profileImagePreviewUrl, setProfileImagePreviewUrl] = useState("");
  const [docStatuses, setDocStatuses] = useState<Record<DocStatusFileKey, string>>(emptyDocCheckStatuses());
  const [serverDocNames, setServerDocNames] = useState<Record<DocStatusFileKey, string>>(
    emptyDocCheckStatuses() as Record<DocStatusFileKey, string>,
  );
  const snapshotRef = useRef<AssessorProfileFormValues | null>(null);
  const filesSnapshotRef = useRef<Partial<Record<AssessorProfileFileKey, File | null>>>({});
  const docStatusesSnapshotRef = useRef<Record<DocStatusFileKey, string>>(emptyDocCheckStatuses());
  const hasServerProfileImageSnapshotRef = useRef(false);
  const serverProfileImageUrlSnapshotRef = useRef("");
  const serverDocNamesSnapshotRef = useRef<Record<DocStatusFileKey, string>>(
    emptyDocCheckStatuses() as Record<DocStatusFileKey, string>,
  );
  const [savingKind, setSavingKind] = useState<"draft" | "final" | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState(false);
  const [ifscLookupLoading, setIfscLookupLoading] = useState(false);
  const [ifscLookupError, setIfscLookupError] = useState("");
  const ifscLookupTimerRef = useRef<number | null>(null);
  const lastIfscLookupRef = useRef<string>("");
  const accountNumberTimerRef = useRef<number | null>(null);
  const [profileLocked, setProfileLocked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [assessorGrades, setAssessorGrades] = useState<string[]>([]);
  const [assessorGradesError, setAssessorGradesError] = useState("");
  const [stateOptions, setStateOptions] = useState<SelectOption[]>([]);
  const [industryOptions, setIndustryOptions] = useState<SelectOption[]>([]);
  const [stateOptionsError, setStateOptionsError] = useState("");
  const [industryOptionsError, setIndustryOptionsError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"Pending" | "Approved" | "Rejected" | "">("");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const fileInputsRef = useRef<Partial<Record<AssessorProfileFileKey, HTMLInputElement | null>>>(
    {},
  );
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const setField = useCallback(<K extends keyof AssessorProfileFormValues>(key: K, value: AssessorProfileFormValues[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  }, []);

  const applyValues = useCallback((values: AssessorProfileFormValues) => {
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

  useEffect(() => {
    startTransition(() => {
      const id = getAssessorIdFromStoredUser();
      if (!id) {
        setLoadError("Missing assessor account id. Please sign in again.");
        setLoading(false);
        return;
      }
      setAssessorId(id);

      const loginEmail = getLoginEmailFromStorage();

      getAssessorAdminProfile(id)
        .then((payload) => {
          const statusValue = payload.approval_status ?? payload.approvalStatus ?? "";
          const statusRaw = typeof statusValue === "string" ? statusValue.trim() : String(statusValue ?? "").trim();
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
          applyValues(mapped);
          const doc = extractDocCheckStatuses(payload);
          const hasImg = extractHasProfileImageFromServer(payload);
          const imgUrl = pickProfileImageUrl(payload);
          const docNames: Record<DocStatusFileKey, string> = {
            biodata: pickServerDocFileName(payload, "biodata"),
            cancelled_cheque: pickServerDocFileName(payload, "cancelled_cheque"),
            gst_declaration: pickServerDocFileName(payload, "gst_declaration"),
            vendor_registration_form: pickServerDocFileName(payload, "vendor_registration_form"),
            non_disclosure_agreement: pickServerDocFileName(payload, "non_disclosure_agreement"),
            health_declaration: pickServerDocFileName(payload, "health_declaration"),
            pan_card: pickServerDocFileName(payload, "pan_card"),
          };
          setDocStatuses(doc);
          docStatusesSnapshotRef.current = doc;
          setServerDocNames(docNames);
          serverDocNamesSnapshotRef.current = docNames;
          setHasServerProfileImage(hasImg);
          hasServerProfileImageSnapshotRef.current = hasImg;
          setServerProfileImageUrl(imgUrl);
          serverProfileImageUrlSnapshotRef.current = imgUrl;
          setHasExistingProfile(true);

          // If assessor updated profile/docs, approval should follow doc statuses:
          // - any "2" => Rejected (re-upload requested)
          // - else if any not "1" => Pending
          // - else Approved
          const docValues = Object.values(doc);
          const hasRejectedDoc = docValues.some((value) => String(value).trim() === "2");
          const allApprovedDocs =
            docValues.length > 0 && docValues.every((value) => String(value).trim() === "1");
          const hasNonApprovedDoc = docValues.some((value) => String(value).trim() !== "1");

          let derivedStatus = statusNormalized;
          if (hasRejectedDoc) {
            derivedStatus = "Rejected";
          } else if (hasNonApprovedDoc) {
            derivedStatus = "Pending";
          } else if (allApprovedDocs) {
            derivedStatus = "Approved";
          }

          setApprovalStatus(derivedStatus);
          const remarksValue = payload.approval_remarks ?? payload.approvalRemarks ?? payload.remarks ?? "";
          const remarks =
            typeof remarksValue === "string" ? remarksValue.trim() : String(remarksValue ?? "").trim();
          setApprovalRemarks(remarks);

          // Lock behavior:
          // - Approved => locked
          // - Pending after submission => locked (some backends don't reliably return `profile_updated`,
          //   so treat "Pending" + any uploaded doc/image as submitted)
          // - Rejected => unlocked for profile fields, but only doc status "2" can re-upload
          const hasAnyUploadedDoc =
            Object.values(doc).some((value) => String(value).trim() !== "0") ||
            Object.values(docNames).some((value) => Boolean(value?.trim())) ||
            hasImg ||
            Boolean(imgUrl);

          const locked =
            derivedStatus === "Approved" ||
            (derivedStatus === "Pending" && hasAnyUploadedDoc) ||
            (isProfileLockedFromPayload(payload) && derivedStatus !== "Rejected");

          // Rejected flow:
          // - by default keep locked and show "Update" button
          // - once user clicks Update, editMode=true and we unlock everything except non-rejected docs upload
          const baseLocked = derivedStatus === "Rejected" ? true : locked;
          setProfileLocked(editMode ? false : baseLocked);
          if (derivedStatus !== "Rejected") {
            setEditMode(false);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof AuthApiError && error.status === 404) {
            setProfileLocked(false);
            setApprovalStatus("");
            setApprovalRemarks("");
            setHasExistingProfile(false);
            const blankDoc = emptyDocCheckStatuses();
            setDocStatuses(blankDoc);
            docStatusesSnapshotRef.current = blankDoc;
            const blankNames = blankDoc as Record<DocStatusFileKey, string>;
            setServerDocNames(blankNames);
            serverDocNamesSnapshotRef.current = blankNames;
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
  }, [applyValues, editMode]);

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
    setFieldErrors({});
    setIfscLookupError("");
    if (snapshotRef.current) {
      setForm(snapshotRef.current);
      setFiles({ ...filesSnapshotRef.current });
      setDocStatuses({ ...docStatusesSnapshotRef.current });
      setHasServerProfileImage(hasServerProfileImageSnapshotRef.current);
      setServerProfileImageUrl(serverProfileImageUrlSnapshotRef.current);
      setServerDocNames({ ...serverDocNamesSnapshotRef.current });
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
      const blankNames = blankDoc as Record<DocStatusFileKey, string>;
      setServerDocNames(blankNames);
      serverDocNamesSnapshotRef.current = blankNames;
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

  const validateProfileStep = (): ProfileFieldErrors => {
    const errors: ProfileFieldErrors = {};
    const requireText = (key: keyof AssessorProfileFormValues, label: string, value: string) => {
      if (!value.trim()) {
        errors[key as string] = `${label} is required.`;
      }
    };

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

    return errors;
  };

  const saveAndContinue = async (): Promise<void> => {
    setSaveError("");
    setSaveSuccess("");
    setIfscLookupError("");

    const stepErrors = validateProfileStep();
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors(stepErrors);
      return;
    }

    setSavingKind("draft");
    setSaving(true);
    try {
      const body = buildAssessorProfileFormData(form, files, {
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

    const body = buildAssessorProfileFormData(form, files);
    appendProfileSubmitMeta(body, finalSubmit, docStatuses);
    setSavingKind(finalSubmit ? "final" : "draft");
    setSaving(true);
    try {
      await patchAssessorSelfProfile(body);
      setHasExistingProfile(true);
      // Once saved/submitted successfully, don't keep showing old validation states.
      setFieldErrors({});
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
      <section className="rounded border border-[#dfe3ec] bg-white p-8 text-sm text-[#5f6876]">
        Loading profile…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded border border-[#f5c6cb] bg-[#fff5f5] p-6 text-sm text-[#a94442]">
        {loadError}
      </section>
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
      <section className="rounded border border-[#dfe3ec] bg-white">
      <div className="border-b border-[#e2e6ef] px-4 py-3">
        <p className="text-sm font-semibold text-[#3a4352]">Profile Details</p>
      </div>

      <div className="space-y-6 p-4">
        <div className="flex flex-wrap gap-2 border-b border-[#e8edf4] pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${
              activeTab === "profile"
                ? "bg-[var(--gc-primary)] text-white"
                : "border border-[#d5dae3] bg-white text-[#667083]"
            }`}
          >
            Profile Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bankDocs")}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${
              activeTab === "bankDocs"
                ? "bg-[var(--gc-primary)] text-white"
                : "border border-[#d5dae3] bg-white text-[#667083]"
            }`}
          >
            Bank Details & Upload Documents
          </button>
        </div>

        {approvalStatus && approvalStatus !== "Pending" ? (
          <div
            className={`rounded border px-3 py-2 text-sm ${
              approvalStatus === "Approved"
                ? "border-[#c3e6cb] bg-[#e8f6ea] text-[#2d6a3e]"
                : approvalStatus === "Rejected"
                  ? "border-[#f5c6cb] bg-[#fdeaea] text-[#a94442]"
                  : "border-[#ffe6a6] bg-[#fff7e6] text-[#8a5a00]"
            }`}
          >
            <p className="font-semibold">Approval Status: {approvalStatus}</p>
            {approvalStatus === "Rejected" && approvalRemarks ? (
              <p className="mt-1 text-sm">Remarks: {approvalRemarks}</p>
            ) : null}
          </div>
        ) : null}

        {activeTab === "profile" ? (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold text-[#4f5a68]">Basic Details</p>
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-dashed border-[#b7c4d6] bg-[#f7f9fc]">
                    {profileImagePreviewUrl || serverProfileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profileImagePreviewUrl || serverProfileImageUrl}
                        alt="Profile"
                        className="h-full w-full object-cover"
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
                            href={profileImagePreviewUrl || serverProfileImageUrl}
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
                      label="Industry Category"
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
                  <TextField label="Alternate Mobile Number" {...bindText("alternateMobile")} />
                  <TextField label="Address Line 1 *" {...bindText("addressLine1")} />
                  <TextField label="Address Line 2" {...bindText("addressLine2")} />
                  <TextField label="City *" {...bindText("city")} />
                  <div className="space-y-1">
                    <SearchableSelect
                      id="state"
                      label="State"
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
                  <TextField label="Pincode *" {...bindText("pincode")} />
                  <TextField label="Pancard Number *" {...bindText("pancardNumber")} />
                  <div className="space-y-1">
                    <SearchableSelect
                      id="assessor-grade"
                      label="Assessor Grade"
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
                      className={`h-8 w-full rounded border bg-white px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
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
                <TextField label="Mobile Number *" {...bindText("emergencyMobile")} />
                <TextField label="Address Line 1 *" {...bindText("emergencyAddressLine1")} />
                <TextField label="Address Line 2" {...bindText("emergencyAddressLine2")} />
                <TextField label="City *" {...bindText("emergencyCity")} />
                <TextField label="State *" {...bindText("emergencyState")} />
                <TextField label="Pincode *" {...bindText("emergencyPincode")} />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {showUpdateButton ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditMode(true);
                    setProfileLocked(false);
                  }}
                  className="rounded bg-[var(--gc-primary)] px-4 py-1.5 text-xs text-white hover:bg-[var(--gc-primary-hover)] disabled:opacity-60"
                >
                  Update
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving || profileLocked}
                onClick={() => {
                  void (editMode ? persistProfile(false) : saveAndContinue());
                }}
                className={`${profileLocked ? "hidden" : ""} rounded bg-[var(--gc-primary)] px-4 py-1.5 text-xs text-white hover:bg-[var(--gc-primary-hover)] disabled:opacity-60`}
              >
                {saving && savingKind === "draft"
                  ? "Saving…"
                  : editMode
                    ? "Save"
                    : "Save & Continue"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold text-[#4f5a68]">Bank Details</p>
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
                    className={`h-8 w-full rounded border bg-white px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
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
                    className={`h-8 w-full rounded border bg-white px-2 text-xs text-[#2b3340] outline-none focus:ring-1 ${
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

            <div>
              <p className="mb-2 text-xs font-semibold text-[#4f5a68]">
                Upload Documents [.pdf, .jpg, .png, .jpeg] — max 10MB each (profile image: PNG/JPEG)
              </p>
              <div className="rounded border border-[#e6eaf2] bg-white">
                <div className="border-b border-[#eef2f7] bg-[#fbfcff] px-3 py-2 text-xs font-semibold text-[#4f5a68]">
                  Upload Documents <span className="text-[#d63f3f]">*</span>
                </div>
                <div className="divide-y divide-[#eef2f7]">
                  {DOCUMENT_ROWS.map((row, index) => {
                    const docKey = row.key as DocStatusFileKey;
                    const serverName = serverDocNames[docKey]?.trim() ?? "";
                    const rawStatus = (docStatuses[docKey] ?? "0").trim();
                    const effectiveStatus =
                      rawStatus !== "0" ? rawStatus : serverName ? "3" : "0";
                    const badge = docStatusBadge(effectiveStatus);
                    const selected = files[row.key] ?? null;
                    const hasSelected = Boolean(selected);
                    const hasServer = effectiveStatus !== "0";
                    const hasFile = hasSelected || hasServer;
                    const canUploadDoc =
                      approvalStatus === "Rejected"
                        ? !profileLocked && docStatuses[docKey] === "2"
                        : !profileLocked && (!hasServer || docStatuses[docKey] === "2");
                    let fileLabel = "No file selected";
                    if (hasSelected) {
                      fileLabel = fileNameOrDash(selected);
                    } else if (hasServer) {
                      fileLabel = serverName || "Uploaded File";
                    }

                    return (
                      <div
                        key={row.key}
                        className={`flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                          fieldErrors[row.key] ? "bg-[#fff7f7]" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-medium text-[#2f3a46]">
                              {index + 1}. {row.label} <span className="text-[#d63f3f]">*</span>
                            </p>
                            {badge ? (
                              <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                                {badge.label}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-[#5f6876]">
                            {fileLabel}
                          </p>
                          {fieldErrors[row.key] ? (
                            <p className="mt-1 text-xs text-[#c62828]">{fieldErrors[row.key]}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-shrink-0 items-center justify-end gap-2">
                          {canUploadDoc ? (
                            <>
                              <input
                                ref={(node) => {
                                  fileInputsRef.current[row.key] = node;
                                }}
                                type="file"
                                accept="application/pdf,image/jpg,image/jpeg,image/png"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  setFiles((previous) => ({ ...previous, [row.key]: file }));
                                  clearFieldError(row.key);
                                }}
                              />
                              <button
                                type="button"
                                className="rounded border border-[#d2dbe8] bg-white px-2 py-1 text-xs text-[#3b79b3] hover:bg-[#f3f7ff]"
                                onClick={() => fileInputsRef.current[row.key]?.click()}
                              >
                                Upload
                              </button>
                            </>
                          ) : null}
                          {hasSelected ? (
                            <a
                              className="rounded border border-[#d2dbe8] bg-white px-2 py-1 text-xs text-[#3b79b3] hover:bg-[#f3f7ff]"
                              href={URL.createObjectURL(selected!)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View
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
              {showUpdateButton ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditMode(true);
                    setProfileLocked(false);
                  }}
                  className="rounded bg-[#2e6b4a] px-4 py-1.5 text-xs text-white hover:bg-[#255a3e] disabled:opacity-60"
                >
                  Update
                </button>
              ) : null}
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
