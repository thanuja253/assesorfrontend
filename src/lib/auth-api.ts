import { AUTH_TOKEN_KEY, AUTH_USER_STORAGE_KEY, getAssessorIdFromStoredUser } from "@/lib/auth-user";

type LoginPayload = {
  email: string;
  password: string;
};

type LoginSuccess = {
  token: string;
  message: string;
  user: unknown;
};

export class AuthApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3001";
  }
  return "";
}

const API_BASE_URL = resolveApiBaseUrl();

export function getApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function getStoredToken(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }
  return globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function getForbiddenMessage(serverMessage?: string): string {
  if (!serverMessage) {
    return "Access denied: account not approved, inactive, or wrong role.";
  }

  const message = serverMessage.toLowerCase();
  if (message.includes("not approved") || message.includes("approval")) {
    return "Your account is not approved yet.";
  }
  if (
    message.includes("not verified") ||
    message.includes("unverified") ||
    (message.includes("verification") &&
      (message.includes("pending") || message.includes("required") || message.includes("incomplete"))) ||
    (message.includes("pending") &&
      (message.includes("approv") || message.includes("verif") || message.includes("account")))
  ) {
    return "Your account is not verified or approved yet. Please contact an administrator.";
  }
  if (message.includes("inactive") || message.includes("not active") || message.includes("disabled")) {
    return "Your account is inactive. Please contact support.";
  }
  if (message.includes("role")) {
    return "You are trying to log in with the wrong role.";
  }

  return serverMessage;
}

async function loginRequest(path: string, payload: LoginPayload): Promise<LoginSuccess> {
  let response: Response;

  try {
    response = await apiFetch(getApiUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await response.json().catch(() => null);
  const serverMessage =
    data?.message ?? data?.error ?? data?.data?.message ?? data?.data?.error;

  if (response.status === 401) {
    throw new AuthApiError(
      401,
      typeof serverMessage === "string" && serverMessage.trim()
        ? serverMessage
        : "Invalid credentials",
    );
  }

  if (response.status === 403) {
    throw new AuthApiError(403, getForbiddenMessage(typeof serverMessage === "string" ? serverMessage : undefined));
  }

  if (!response.ok) {
    throw new AuthApiError(response.status, data?.message ?? "Login failed. Please try again.");
  }

  const token = data?.token ?? data?.accessToken ?? data?.data?.token;
  if (!token) {
    throw new AuthApiError(500, "Login succeeded but no auth token was returned.");
  }

  const userPayload =
    (data?.user && typeof data.user === "object" ? (data.user as Record<string, unknown>) : null) ??
    (data?.data?.user && typeof data.data.user === "object"
      ? (data.data.user as Record<string, unknown>)
      : null) ??
    {};
  const assignmentPayload =
    (Array.isArray(data?.assignments) ? data.assignments : null) ??
    (Array.isArray(data?.data?.assignments) ? data.data.assignments : null) ??
    [];
  const normalizedUser = {
    ...userPayload,
    assignments: Array.isArray((userPayload as Record<string, unknown>).assignments)
      ? (userPayload as Record<string, unknown>).assignments
      : assignmentPayload,
  };

  return {
    token,
    message: data?.message ?? "Login successful",
    user: normalizedUser,
  };
}

export function loginFacilitator(payload: LoginPayload): Promise<LoginSuccess> {
  return loginRequest("/api/facilitator/auth/login", payload);
}

export function loginAssessor(payload: LoginPayload): Promise<LoginSuccess> {
  return loginFacilitator(payload);
}

export function loginCompany(payload: LoginPayload): Promise<LoginSuccess> {
  return loginRequest("/api/company/auth/login", payload);
}

export async function fetchAssessorGrades(): Promise<string[]> {
  let response: Response;
  try {
    const token = getStoredToken();
    response = await apiFetch(getApiUrl("/api/company/assessor-grades"), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AuthApiError(response.status, (data as { message?: string } | null)?.message ?? "Could not load facilitator grades.");
  }

  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const payload = root.data ?? root.grades ?? root.result ?? root.payload ?? root;
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    const innerCandidates = [rec.data, rec.grades, rec.items, rec.rows];
    for (const inner of innerCandidates) {
      if (Array.isArray(inner)) {
        list = inner;
        break;
      }
    }
  }
  const grades = list.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const candidate =
        rec.grade ?? rec.name ?? rec.label ?? rec.value ?? rec.assessor_grade;
      return typeof candidate === "string" ? candidate : undefined;
    }
    return undefined;
  }).filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    .map((g) => g.trim());

  return Array.from(new Set(grades));
}

export type SelectOption = { value: string; label: string };

function uniqByValue(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  const result: SelectOption[] = [];
  for (const opt of options) {
    const key = opt.value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ value: key, label: opt.label.trim() || key });
  }
  return result;
}

export async function fetchStates(): Promise<SelectOption[]> {
  const paths = [
    "/api/company/all-states",
    "/api/company/states-all",
    "/api/company/states_all",
  ];
  let response: Response | null = null;
  let data: unknown = null;

  for (const path of paths) {
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }
    data = await response.json().catch(() => null);
    if (response.ok || response.status !== 404) break;
  }

  if (!response?.ok) {
    throw new AuthApiError(
      response?.status ?? 500,
      (data as { message?: string } | null)?.message ?? "Could not load states.",
    );
  }
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const payload = root.data ?? root.states ?? root.result ?? root.payload ?? root;
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    const candidates = [rec.states, rec.data, rec.items, rec.rows];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
    }
  }
  const options = list.map((item) => {
    if (typeof item === "string") return { value: item, label: item };
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const labelRaw = rec.name ?? rec.state ?? rec.label ?? rec.value;
      const valueRaw = rec.code ?? rec.id ?? labelRaw;
      const labelStr = typeof labelRaw === "string" ? labelRaw : "";
      const valueStr = typeof valueRaw === "string" ? valueRaw : "";
      return { value: valueStr || labelStr, label: labelStr || valueStr };
    }
    return { value: "", label: "" };
  });
  return uniqByValue(options).filter((o) => o.value);
}

export async function fetchIndustries(): Promise<SelectOption[]> {
  let response: Response;
  try {
    response = await apiFetch(getApiUrl("/api/admin/masters/industries"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      (data as { message?: string } | null)?.message ?? "Could not load industries.",
    );
  }
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const payload = root.data ?? root.industries ?? root.result ?? root.payload ?? root;
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    const candidates = [rec.industries, rec.data, rec.items, rec.rows];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
    }
  }
  const options = list.map((item) => {
    if (typeof item === "string") return { value: item, label: item };
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const labelRaw = rec.name ?? rec.industry ?? rec.label ?? rec.value;
      const valueRaw = rec.id ?? rec._id ?? rec.code ?? labelRaw;
      const labelStr = typeof labelRaw === "string" ? labelRaw : "";
      const valueStr = typeof valueRaw === "string" ? valueRaw : "";
      return { value: valueStr || labelStr, label: labelStr || valueStr };
    }
    return { value: "", label: "" };
  });
  return uniqByValue(options).filter((o) => o.value);
}

export type AssessorProjectListFilters = {
  reg_id?: string;
  company_id?: string;
  project_id?: string;
  name?: string;
  mobile?: string;
  email?: string;
  status?: string;
  account_status?: string;
  state?: string;
  industry?: string;
  sector?: string;
  entity?: string;
  fromturnover?: string;
  toturnover?: string;
  turnover_min?: string;
  turnover_max?: string;
  search?: string;
};

export type AssessorProjectListParams = AssessorProjectListFilters & {
  draw?: number;
  start?: number;
  length?: number;
  page?: number;
  limit?: number;
  /** Assessor MongoDB id for GET /api/assessor/auth/myprojects (backend also accepts assessorId / id). */
  assessor_id?: string;
  assessorId?: string;
};

export type AssessorProjectListItem = {
  id?: string;
  company_id?: string;
  project_id?: string;
  project_code?: string;
  name?: string;
  email?: string;
  mobile?: string;
  account_status?: string | number;
  account_status_label?: string;
  state?: string;
  industry?: string;
  sector?: string;
  entity?: string;
  quickview_project_id?: string;
};

export type AssessorProjectListResult = {
  items: AssessorProjectListItem[];
  page: number;
  limit: number;
  total: number;
};

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

function toProjectListItems(payload: unknown): AssessorProjectListItem[] {
  if (Array.isArray(payload)) {
    return payload as AssessorProjectListItem[];
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data as AssessorProjectListItem[];
  }
  if (Array.isArray(record.items)) {
    return record.items as AssessorProjectListItem[];
  }
  return [];
}

function normalizeProjectItem(item: AssessorProjectListItem): AssessorProjectListItem {
  const idValue = item.id ?? (item as { _id?: string })._id;
  return {
    ...item,
    id: idValue,
    company_id: item.company_id ?? (item as { reg_id?: string }).reg_id,
    account_status: item.account_status ?? (item as { status?: string | number }).status,
    account_status_label:
      item.account_status_label ?? (item as { status_label?: string }).status_label,
    quickview_project_id: item.quickview_project_id ?? idValue,
  };
}

type LoginAssignment = {
  project_id?: string;
  company_id?: string;
};

function getStoredAssignments(): LoginAssignment[] {
  if (globalThis.window === undefined) {
    return [];
  }
  try {
    const raw = globalThis.window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    const assignments = parsed?.assignments;
    if (!Array.isArray(assignments)) return [];
    return assignments.filter((item) => item && typeof item === "object") as LoginAssignment[];
  } catch {
    return [];
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function mapQuickviewToProjectItem(
  projectId: string,
  companyId: string,
  payload: Record<string, unknown>,
): AssessorProjectListItem {
  const root = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : payload;
  const profile =
    root.profile && typeof root.profile === "object" ? (root.profile as Record<string, unknown>) : {};
  const company = root.company && typeof root.company === "object" ? (root.company as Record<string, unknown>) : {};
  const project = root.project && typeof root.project === "object" ? (root.project as Record<string, unknown>) : {};

  const merged = { ...root, ...company, ...project, ...profile };
  return normalizeProjectItem({
    id: firstString(merged, ["project_id", "project_mongo_id", "id", "_id"]) || projectId,
    project_id: firstString(merged, ["project_id", "project_mongo_id", "id", "_id"]) || projectId,
    project_code: firstString(merged, ["project_code", "projectCode", "code"]),
    quickview_project_id: projectId,
    company_id: firstString(merged, ["company_id", "reg_id", "companyId", "registration_id"]) || companyId,
    name: firstString(merged, ["name", "company_name", "companyName", "project_name", "projectName"]),
    email: firstString(merged, ["email", "company_email", "companyEmail"]),
    mobile: firstString(merged, ["mobile", "phone", "contact_no", "contactNo", "mobile_number"]),
    account_status: firstString(merged, ["account_status", "status", "accountStatus"]),
    account_status_label: firstString(merged, ["account_status_label", "status_label"]),
    state: firstString(merged, ["state", "state_name"]),
    industry: firstString(merged, ["industry", "industry_category"]),
    sector: firstString(merged, ["sector"]),
    entity: firstString(merged, ["entity", "entity_type"]),
  });
}

function matchesLocalProjectFilters(row: AssessorProjectListItem, filters: AssessorProjectListFilters): boolean {
  const match = (source: string | undefined, target: string | undefined): boolean => {
    const t = target?.trim().toLowerCase();
    if (!t) return true;
    return (source ?? "").toLowerCase().includes(t);
  };
  return (
    match(row.company_id, filters.company_id ?? filters.reg_id) &&
    match(row.project_id, filters.project_id) &&
    match(row.name, filters.name) &&
    match(row.email, filters.email) &&
    match(row.mobile, filters.mobile) &&
    match(row.state, filters.state) &&
    match(row.industry, filters.industry) &&
    match(row.sector, filters.sector) &&
    match(row.entity, filters.entity) &&
    match(`${row.company_id ?? ""} ${row.project_id ?? ""} ${row.name ?? ""} ${row.email ?? ""} ${row.mobile ?? ""}`, filters.search)
  );
}

async function listAssignedProjectsFromLoginAssignments(
  token: string,
  params: AssessorProjectListParams,
): Promise<AssessorProjectListResult | null> {
  const assignments = getStoredAssignments();
  if (assignments.length === 0) {
    return null;
  }

  const normalizedAssignments = assignments
    .map((item) => ({
      project_id: (item.project_id ?? "").trim(),
      company_id: (item.company_id ?? "").trim(),
    }))
    .filter((item) => item.project_id);

  if (normalizedAssignments.length === 0) {
    // If login assignments exist but are missing project_id shape, fallback to myprojects API.
    return null;
  }

  const rows = (
    await Promise.all(
      normalizedAssignments.map(async (assignment) => {
        try {
          const response = await apiFetch(
            getApiUrl(`/api/company/projects/${encodeURIComponent(assignment.project_id)}/quickview`),
            {
              method: "GET",
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || typeof data !== "object") {
            return null;
          }
          return mapQuickviewToProjectItem(
            assignment.project_id,
            assignment.company_id,
            data as Record<string, unknown>,
          );
        } catch {
          return null;
        }
      }),
    )
  ).filter((item): item is AssessorProjectListItem => item !== null);
  if (rows.length === 0) {
    // Quickview-based assignment expansion failed; fallback to myprojects endpoint instead.
    return null;
  }

  const cleanedFilters = cleanFiltersForLocal(params);
  const filtered = rows.filter((row) => matchesLocalProjectFilters(row, cleanedFilters));
  const page = toPositiveNumber(params.page, 1);
  const limit = toPositiveNumber(params.limit, 10);
  const start = Math.max(0, (page - 1) * limit);
  const items = filtered.slice(start, start + limit);
  return { items, total: filtered.length, page, limit };
}

function cleanFiltersForLocal(params: AssessorProjectListParams): AssessorProjectListFilters {
  return {
    company_id: params.company_id?.trim() || params.reg_id?.trim() || "",
    reg_id: params.reg_id?.trim() || params.company_id?.trim() || "",
    project_id: params.project_id?.trim() || "",
    name: params.name?.trim() || "",
    mobile: params.mobile?.trim() || "",
    email: params.email?.trim() || "",
    state: params.state?.trim() || "",
    industry: params.industry?.trim() || "",
    sector: params.sector?.trim() || "",
    entity: params.entity?.trim() || "",
    search: params.search?.trim() || "",
  };
}

function toQueryString(params: AssessorProjectListParams): string {
  const query = new URLSearchParams();

  const page = toPositiveNumber(params.page, 1);
  const limit = toPositiveNumber(params.limit, 10);
  const draw = toPositiveNumber(params.draw, 1);
  const length = toPositiveNumber(params.length, limit);
  const start = Math.max(0, toPositiveNumber(params.start, (page - 1) * limit));

  const companyId = params.company_id?.trim() || params.reg_id?.trim() || "";
  const accountStatus = params.account_status?.trim() || params.status?.trim() || "";
  const turnoverMin = params.turnover_min?.trim() || params.fromturnover?.trim() || "";
  const turnoverMax = params.turnover_max?.trim() || params.toturnover?.trim() || "";
  const searchValue = params.search?.trim() || "";

  const assessorMongoId =
    params.assessor_id?.trim() || params.assessorId?.trim() || getAssessorIdFromStoredUser() || "";

  const map: Record<string, string | number | undefined> = {
    page,
    limit,
    draw,
    start,
    length,
    assessor_id: assessorMongoId || undefined,
    assessorId: assessorMongoId || undefined,
    id: assessorMongoId || undefined,
    company_id: companyId || undefined,
    reg_id: companyId || undefined,
    project_id: params.project_id,
    name: params.name,
    mobile: params.mobile,
    email: params.email,
    account_status: accountStatus || undefined,
    status: accountStatus || undefined,
    state: params.state,
    industry: params.industry,
    sector: params.sector,
    entity: params.entity,
    turnover_min: turnoverMin || undefined,
    turnover_max: turnoverMax || undefined,
    fromturnover: turnoverMin || undefined,
    toturnover: turnoverMax || undefined,
    search: searchValue || undefined,
  };

  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      query.set(key, text);
    }
  }
  if (searchValue) {
    query.set("search[value]", searchValue);
  }
  return query.toString();
}

async function fetchAssessorProjectsPath(
  path: string,
  token: string,
  queryString: string,
): Promise<{ response: Response; data: unknown }> {
  const requestPath = queryString ? `${path}?${queryString}` : path;
  const response = await apiFetch(getApiUrl(requestPath), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function throwAssessorProjectsError(status: number, data: unknown): never {
  if (status === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(data) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (status === 403) {
    throw new AuthApiError(403, getForbiddenMessage(parseApiErrorMessage(data)));
  }
  throw new AuthApiError(
    status || 500,
    parseApiErrorMessage(data) ?? "Could not load assigned projects.",
  );
}

/**
 * GET /api/assessor/auth/myprojects
 * Legacy aliases supported by backend: /api/assessor/auth/companylist, /api/assessor/auth/company_data
 */
export async function listAssessorProjects(
  params: AssessorProjectListParams = {},
): Promise<AssessorProjectListResult> {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }

  const page = toPositiveNumber(params.page, 1);
  const limit = toPositiveNumber(params.limit, 10);

  const assignedFromLogin = await listAssignedProjectsFromLoginAssignments(token, params);
  if (assignedFromLogin) {
    return assignedFromLogin;
  }

  const queryString = toQueryString({ ...params, page, limit });
  const paths = [
    "/api/assessor/auth/myprojects",
    "/api/assessor/auth/companylist",
    "/api/assessor/auth/company_data",
  ];
  let response: Response | null = null;
  let data: unknown = null;
  let lastStatus = 500;

  for (const path of paths) {
    try {
      const result = await fetchAssessorProjectsPath(path, token, queryString);
      response = result.response;
      data = result.data;
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    if (response.ok) {
      break;
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (response?.ok !== true) {
    throwAssessorProjectsError(lastStatus, data);
  }

  const responseRecord = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const payload = responseRecord.data;
  const pagination = (
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).pagination : null
  ) as Record<string, unknown> | null;
  const rootPagination = responseRecord.pagination as Record<string, unknown> | undefined;
  const parsedItems = toProjectListItems(payload).map(normalizeProjectItem);

  const total =
    toPositiveNumber(pagination?.total, 0) ||
    toPositiveNumber(pagination?.total_items, 0) ||
    toPositiveNumber(rootPagination?.total, 0) ||
    toPositiveNumber(responseRecord.recordsFiltered, 0) ||
    toPositiveNumber(responseRecord.recordsTotal, 0) ||
    parsedItems.length;

  const parsedPage =
    toPositiveNumber(pagination?.page, 0) ||
    toPositiveNumber(rootPagination?.page, 0) ||
    page;

  const parsedLimit =
    toPositiveNumber(pagination?.limit, 0) ||
    toPositiveNumber(rootPagination?.limit, 0) ||
    limit;

  return {
    items: parsedItems,
    total,
    page: parsedPage,
    limit: parsedLimit,
  };
}

export type AssessorChangePasswordPayload = {
  current_password: string;
  new_password: string;
  confirmed: string;
};

/** Nest-style field errors, e.g. `{ errors: { email: ["..."] } }` on forgot-password 400. */
function parseErrorsObjectEmail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  const errors = record.errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return undefined;
  }
  const errObj = errors as Record<string, unknown>;
  const email = errObj.email;
  if (Array.isArray(email) && email.length > 0) {
    return email.map(String).filter(Boolean).join(" ");
  }
  if (typeof email === "string" && email.trim()) {
    return email.trim();
  }
  return undefined;
}

export function parseApiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  const fieldMsg = parseErrorsObjectEmail(data);
  if (fieldMsg) {
    return fieldMsg;
  }
  const msg = record.message;
  if (typeof msg === "string" && msg.trim()) {
    return msg.trim();
  }
  if (Array.isArray(msg) && msg.length > 0) {
    return msg.map(String).filter(Boolean).join(" ");
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  const nested = record.data as Record<string, unknown> | undefined;
  if (nested && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message.trim();
  }
  return undefined;
}

/**
 * POST /api/facilitator/auth/change-password — requires facilitator JWT in localStorage.
 */
export async function changeFacilitatorPassword(
  payload: AssessorChangePasswordPayload,
): Promise<{ message?: string }> {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }

  let response: Response;
  try {
    response = await apiFetch(getApiUrl("/api/facilitator/auth/change-password"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(data) ?? "Invalid or expired session. Please log in again.",
    );
  }

  if (response.status === 403) {
    const serverMessage = parseApiErrorMessage(data);
    throw new AuthApiError(403, getForbiddenMessage(serverMessage));
  }

  if (response.status === 400 || response.status === 422) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Invalid password data.",
    );
  }

  if (response.status === 404) {
    throw new AuthApiError(404, parseApiErrorMessage(data) ?? "Account not found.");
  }

  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not change password.",
    );
  }

  const successMessage =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof data?.data?.message === "string" && data.data.message.trim()) ||
    undefined;

  return { message: successMessage };
}

export async function changeAssessorPassword(
  payload: AssessorChangePasswordPayload,
): Promise<{ message?: string }> {
  return changeFacilitatorPassword(payload);
}

/**
 * POST /api/facilitator/auth/forgot-password — public; sends reset instructions to the facilitator email.
 */
export async function forgotFacilitatorPassword(payload: {
  email: string;
}): Promise<{ message: string }> {
  const email = payload.email.trim().toLowerCase();
  if (!email) {
    throw new AuthApiError(400, "Please enter your email address.");
  }

  let response: Response;
  try {
    response = await apiFetch(getApiUrl("/api/facilitator/auth/forgot-password"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      parseApiErrorMessage(data) ??
      (response.status === 400
        ? "Unable to send reset link. Check your email or account status."
        : "Could not send reset link.");
    throw new AuthApiError(response.status, message);
  }

  const message =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof data?.data?.message === "string" && data.data.message.trim()) ||
    "Password sent to your email!";

  return { message };
}

export async function forgotAssessorPassword(payload: {
  email: string;
}): Promise<{ message: string }> {
  return forgotFacilitatorPassword(payload);
}
