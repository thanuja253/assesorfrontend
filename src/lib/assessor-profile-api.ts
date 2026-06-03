import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY, getAssessorIdFromStoredUser, getFacilitatorIdFromStoredUser } from "@/lib/auth-user";
import { appendS3FileToFormData, S3_FOLDERS } from "@/lib/s3-upload";
import type { AssessorProfileFormValues } from "@/lib/assessor-profile-map";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function getBearerToken(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }
  return globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeadersJson(): HeadersInit {
  const token = getBearerToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function authHeadersMultipart(): HeadersInit {
  const token = getBearerToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

/** Multer / DTO file field names (CreateAssessorProfileDto). */
export const ASSESSOR_PROFILE_FILE_KEYS = {
  profile_image: "profile_image",
  biodata: "biodata",
  vendor_registration_form: "vendor_registration_form",
  non_disclosure_agreement: "non_disclosure_agreement",
  health_declaration: "health_declaration",
  gst_declaration: "gst_declaration",
  pan_card: "pan_card",
  cancelled_cheque: "cancelled_cheque",
} as const;

export type AssessorProfileFileKey = keyof typeof ASSESSOR_PROFILE_FILE_KEYS;

function normalizeProfilePayload(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const inner = root.data ?? root.assessor ?? root.result ?? root.payload;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return root;
}

/**
 * GET /api/admin/assessors/:assessorId — mapped assessor payload (Bearer token sent; backend must allow it).
 */
export async function getAssessorAdminProfile(assessorId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(assessorId);
  let response: Response;
  try {
    response = await apiFetch(getApiUrl(`/api/admin/assessors/${id}`), {
      method: "GET",
      headers: authHeadersJson(),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not load profile.",
    );
  }

  const normalized = normalizeProfilePayload(data);
  if (!normalized) {
    throw new AuthApiError(500, "Profile response was empty.");
  }
  return normalized;
}

/**
 * GET /api/assessor/profile/me — current assessor’s profile (AssessorJwtAuthGuard).
 * Use for initial load and after re-upload or admin document approval so `document_approvals`
 * and file paths match the signed-in assessor.
 */
export async function getAssessorMyProfile(): Promise<Record<string, unknown>> {
  const facilitatorId = getAssessorIdFromStoredUser();
  const query = facilitatorId ? `?facilitator_id=${encodeURIComponent(facilitatorId)}` : "";
  const paths = [
    `/api/facilitator/profile/me${query}`,
    `/facilitator/profile/me${query}`,
    `/api/facilitators/profile/me${query}`,
    `/facilitators/profile/me${query}`,
    "/api/facilitator/profile/me",
    "/facilitator/profile/me",
    "/api/facilitators/profile/me",
    "/facilitators/profile/me",
  ];
  let response: Response | null = null;
  let data: unknown = null;
  for (const path of paths) {
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "GET",
        headers: {
          ...authHeadersJson(),
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }
    data = await parseJsonSafe(response);
    if (response.ok || response.status !== 404) {
      break;
    }
  }
  if (!response || !response.ok) {
    throw new AuthApiError(
      response?.status ?? 500,
      parseApiErrorMessage(data) ?? "Could not load profile.",
    );
  }

  const normalized = normalizeProfilePayload(data);
  if (!normalized) {
    throw new AuthApiError(500, "Profile response was empty.");
  }
  return normalized;
}

export async function getFacilitatorByEmail(email: string): Promise<Record<string, unknown> | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  let response: Response;
  try {
    const query = new URLSearchParams({
      page: "1",
      limit: "10",
      email: normalizedEmail,
    });
    response = await apiFetch(getApiUrl(`/api/admin/facilitators?${query.toString()}`), {
      method: "GET",
      headers: authHeadersJson(),
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not load facilitator details.",
    );
  }

  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(root.data) ? root.data : [];
  const first = list.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  return first ?? null;
}

export async function getFacilitatorApprovalStatus(
  facilitatorId: string,
): Promise<Record<string, unknown> | null> {
  const id = facilitatorId.trim();
  if (!id) {
    return null;
  }
  let response: Response;
  try {
    response = await apiFetch(
      getApiUrl(`/api/admin/facilitators/${encodeURIComponent(id)}/approval-status?_ts=${Date.now()}`),
      {
        method: "GET",
        headers: authHeadersJson(),
        cache: "no-store",
      },
    );
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not load facilitator approval status.",
    );
  }
  const normalized = normalizeProfilePayload(data);
  if (!normalized) {
    return null;
  }
  return normalized;
}

/**
 * POST /api/admin/assessors/profile — first-time profile (multipart).
 */
export async function createAssessorAdminProfile(formData: FormData): Promise<unknown> {
  let response: Response;
  try {
    response = await apiFetch(getApiUrl("/api/admin/assessors/profile"), {
      method: "POST",
      headers: authHeadersMultipart(),
      body: formData,
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not create profile.",
    );
  }
  return data;
}

/**
 * PUT /api/admin/assessors/:assessorId/edit — update existing profile (multipart).
 */
function cloneFormData(original: FormData): FormData {
  const next = new FormData();
  original.forEach((value, key) => {
    next.append(key, value);
  });
  return next;
}

export async function updateAssessorAdminProfile(
  assessorId: string,
  formData: FormData,
): Promise<unknown> {
  const id = encodeURIComponent(assessorId);
  let response: Response;
  try {
    response = await apiFetch(getApiUrl(`/api/admin/assessors/${id}/edit`), {
      method: "PUT",
      headers: authHeadersMultipart(),
      body: cloneFormData(formData),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (response.ok) {
    return data;
  }

  const fallback = await tryUpdateAssessorProfileFallback(assessorId, formData);
  if (fallback !== null) {
    return fallback;
  }

  throw new AuthApiError(
    response.status,
    parseApiErrorMessage(data) ?? "Could not update profile.",
  );
}

async function tryUpdateAssessorProfileFallback(
  assessorId: string,
  formData: FormData,
): Promise<Record<string, unknown> | null> {
  const id = encodeURIComponent(assessorId);
  const paths = [
    `/api/admin/assessors/${id}`,
    `/api/admin/assessors/${id}/profile`,
    `/api/admin/assessors/${id}/public`,
    `/api/admin/assessor_profile/${id}`,
  ];

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "PUT",
        headers: authHeadersMultipart(),
        body: cloneFormData(formData),
      });
    } catch {
      continue;
    }
    const data = await parseJsonSafe(response);
    if (response.ok) {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data as Record<string, unknown>;
      }
      return { response: data };
    }
  }
  return null;
}

/**
 * PATCH /api/assessor/profile — assessor self profile update + docs upload (multipart)
 */
export async function patchAssessorSelfProfile(formData: FormData): Promise<unknown> {
  const paths = [
    "/api/facilitator/profile",
    "/facilitator/profile",
    "/api/facilitators/profile",
    "/facilitators/profile",
  ];
  let response: Response | null = null;
  let data: unknown = null;
  for (const path of paths) {
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "PATCH",
        headers: authHeadersMultipart(),
        body: cloneFormData(formData),
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }
    data = await parseJsonSafe(response);
    if (response.ok || response.status !== 404) {
      break;
    }
  }
  if (!response || !response.ok) {
    throw new AuthApiError(
      response?.status ?? 500,
      parseApiErrorMessage(data) ?? "Could not update profile.",
    );
  }
  return data;
}

/** Build multipart body for create/update (field names aligned with CreateAssessorProfileDto / multer). */
export function buildAssessorProfileFormData(
  values: AssessorProfileFormValues,
  files: Partial<Record<AssessorProfileFileKey, File | null>>,
  options?: Readonly<{
    includeBankDetails?: boolean;
    includeDocuments?: boolean;
  }>,
): FormData {
  const includeBankDetails = options?.includeBankDetails ?? true;
  const includeDocuments = options?.includeDocuments ?? true;
  const fd = new FormData();
  fd.append("name", values.name.trim());
  fd.append("consultant_id", values.consultantId.trim());
  fd.append("email", values.email.trim());
  fd.append("mobile", values.mobile.trim());
  fd.append("gst_registered", values.gstYes ? "1" : "0");
  // Organization / industry: API accepts one non-empty among organization, Organization,
  // industry_category, Industry_category and mirrors to DB — send only industry_category (snake_case).
  const orgIndustry = values.industryCategory.trim();
  if (orgIndustry) {
    fd.append("industry_category", orgIndustry);
  }
  fd.append("enrollment_date", values.enrollmentDate.trim());
  fd.append("total_years_professional_experience", values.enrollmentDate.trim());
  fd.append("lead_assessor", values.leadAssessor.trim());
  fd.append("additional_professional_qualification", values.leadAssessor.trim());
  fd.append("assessor_grade", values.assessorGrade.trim());
  fd.append("educational_qualification", values.assessorGrade.trim());
  fd.append("years_env_sustainability", values.pancardNumber.trim());
  fd.append("areas_of_specialization", values.gstNumber.trim());
  fd.append("company_website_details", values.companyWebsiteDetails.trim());
  fd.append("linkedin_profile", values.linkedinProfile.trim());
  fd.append("declaration_accepted", values.declarationAccepted ? "true" : "false");
  if (values.gstYes) {
    const gstTrimmed = values.gstNumber.trim();
    if (gstTrimmed) {
      fd.append("gst_number", gstTrimmed);
    }
  }

  const optionalPairs: [string, string][] = [
    ["alternate_mobile", values.alternateMobile],
    ["address_line_1", values.addressLine1],
    ["address_line_2", values.addressLine2],
    ["city", values.city],
    ["state", values.state],
    ["pincode", values.pincode],
    ["pan_number", values.pancardNumber],
    ["emergency_contact_name", values.emergencyContactName],
    ["emergency_mobile", values.emergencyMobile],
    ["emergency_address_line_1", values.emergencyAddressLine1],
    ["emergency_address_line_2", values.emergencyAddressLine2],
    ["emergency_city", values.emergencyCity],
    ["emergency_state", values.emergencyState],
    ["emergency_pincode", values.emergencyPincode],
  ];
  if (includeBankDetails) {
    optionalPairs.push(
      ["bank_name", values.bankName],
      ["account_number", values.accountNumber],
      ["branch_name", values.branchName],
      ["ifsc_code", values.ifscCode],
    );
  }

  for (const [key, value] of optionalPairs) {
    const trimmed = value.trim();
    if (trimmed) {
      fd.append(key, trimmed);
    }
  }

  (Object.keys(files) as AssessorProfileFileKey[]).forEach((key) => {
    if (!includeDocuments && key !== "profile_image") {
      return;
    }
    const file = files[key];
    if (file) {
      fd.append(key, file);
      if (key === "biodata") fd.append("brief_profile_individual", file);
      if (key === "non_disclosure_agreement") fd.append("brief_profile_organization", file);
      if (key === "health_declaration") fd.append("projects_handled", file);
    }
  });

  return fd;
}

const PROFILE_FILE_ALIASES: Partial<Record<AssessorProfileFileKey, string>> = {
  biodata: "brief_profile_individual",
  non_disclosure_agreement: "brief_profile_organization",
  health_declaration: "projects_handled",
};

/** Presigned S3 upload (steps 1–2) then multipart metadata with `*_s3_key` (step 3). */
export async function buildAssessorProfileFormDataWithS3(
  values: AssessorProfileFormValues,
  files: Partial<Record<AssessorProfileFileKey, File | null>>,
  options?: Parameters<typeof buildAssessorProfileFormData>[2],
): Promise<FormData> {
  const fd = buildAssessorProfileFormData(values, files, options);
  const entityId =
    getFacilitatorIdFromStoredUser() ??
    getAssessorIdFromStoredUser() ??
    (values.email.trim() || "unknown");
  const folder = S3_FOLDERS.generic(`profiles/facilitator/${entityId}`);
  const token = getBearerToken();
  if (!token) return fd;

  const next = new FormData();
  const uploads: Array<{ field: string; file: File; aliases: string[] }> = [];

  for (const [field, value] of fd.entries()) {
    if (value instanceof File) {
      const aliases: string[] = [];
      const alias = PROFILE_FILE_ALIASES[field as AssessorProfileFileKey];
      if (alias) aliases.push(alias);
      uploads.push({ field, file: value, aliases });
      continue;
    }
    next.append(field, value);
  }

  for (const item of uploads) {
    const key = await appendS3FileToFormData(next, {
      file: item.file,
      folder,
      field: item.field,
      token,
    });
    for (const alias of item.aliases) {
      next.append(`${alias}_s3_key`, key);
      next.append(`${alias}_key`, key);
    }
  }

  return next;
}

export type IfscLookupData = {
  ifsc_code?: string;
  bank_name?: string;
  branch_name?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
};

/**
 * GET /api/company/ifsc/:ifsc — fetches bank details for IFSC auto-fill.
 */
export async function lookupBankDetailsByIfsc(ifsc: string): Promise<IfscLookupData> {
  const normalized = ifsc.trim().toUpperCase();
  if (!normalized) {
    throw new AuthApiError(400, "Please enter IFSC code.");
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) {
    throw new AuthApiError(400, "Invalid IFSC format.");
  }

  let response: Response;
  try {
    response = await apiFetch(getApiUrl(`/api/company/ifsc/${encodeURIComponent(normalized)}`), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    if (response.status === 400) {
      throw new AuthApiError(400, parseApiErrorMessage(data) ?? "Invalid IFSC format.");
    }
    if (response.status === 404) {
      throw new AuthApiError(404, parseApiErrorMessage(data) ?? "IFSC not found.");
    }
    if (response.status === 503) {
      throw new AuthApiError(
        503,
        parseApiErrorMessage(data) ?? "IFSC lookup service unavailable.",
      );
    }
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not fetch bank details from IFSC.",
    );
  }

  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const payload =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;

  return {
    ifsc_code: typeof payload.ifsc_code === "string" ? payload.ifsc_code : normalized,
    bank_name: typeof payload.bank_name === "string" ? payload.bank_name : "",
    branch_name: typeof payload.branch_name === "string" ? payload.branch_name : "",
    address: typeof payload.address === "string" ? payload.address : "",
    city: typeof payload.city === "string" ? payload.city : "",
    district: typeof payload.district === "string" ? payload.district : "",
    state: typeof payload.state === "string" ? payload.state : "",
  };
}
