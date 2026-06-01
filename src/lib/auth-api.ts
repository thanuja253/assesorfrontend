import { API_CACHE_TTL, getCached } from "@/lib/api-cache";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

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
    response = await fetch(getApiUrl(path), {
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

  return {
    token,
    message: data?.message ?? "Login successful",
    user: data?.user ?? data?.data?.user ?? null,
  };
}

export function loginAssessor(payload: LoginPayload): Promise<LoginSuccess> {
  return loginRequest("/api/assessor/auth/login", payload);
}

export function loginCompany(payload: LoginPayload): Promise<LoginSuccess> {
  return loginRequest("/api/company/auth/login", payload);
}

export async function fetchAssessorGrades(): Promise<string[]> {
  return getCached("filters", "assessor-grades", API_CACHE_TTL.filters, fetchAssessorGradesUncached);
}

async function fetchAssessorGradesUncached(): Promise<string[]> {
  let response: Response;
  try {
    const token = getStoredToken();
    response = await fetch(getApiUrl("/api/company/assessor-grades"), {
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
    throw new AuthApiError(response.status, (data as { message?: string } | null)?.message ?? "Could not load assessor grades.");
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
  return getCached("filters", "company-states", API_CACHE_TTL.filters, fetchStatesUncached);
}

async function fetchStatesUncached(): Promise<SelectOption[]> {
  let response: Response;
  try {
    response = await fetch(getApiUrl("/api/company/states"), {
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
  return getCached("filters", "admin-industries", API_CACHE_TTL.filters, fetchIndustriesUncached);
}

async function fetchIndustriesUncached(): Promise<SelectOption[]> {
  let response: Response;
  try {
    response = await fetch(getApiUrl("/api/admin/masters/industries"), {
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
};

export type AssessorProjectListItem = {
  id?: string;
  company_id?: string;
  project_id?: string;
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

  const map: Record<string, string | number | undefined> = {
    page,
    limit,
    draw,
    start,
    length,
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
  const response = await fetch(getApiUrl(requestPath), {
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
export type AssessorCompaniesFilterPayload = {
  industries: unknown[];
  entities: unknown[];
  states: unknown[];
  sectors: unknown[];
  account_statuses: unknown[];
};

/**
 * GET companies-filters — industries, entities, states, sectors, account statuses.
 */
export async function fetchAssessorCompaniesFilters(): Promise<AssessorCompaniesFilterPayload> {
  return getCached("filters", "companies-filters", API_CACHE_TTL.filters, fetchAssessorCompaniesFiltersUncached);
}

async function fetchAssessorCompaniesFiltersUncached(): Promise<AssessorCompaniesFilterPayload> {
  const token = getStoredToken();
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const candidates = ["/api/company/auth/companies-filters", "/api/companys/auth/companies-filters"];
  let filtersData: Record<string, unknown> | null = null;
  for (const path of candidates) {
    let response: Response;
    try {
      response = await fetch(getApiUrl(path), { method: "GET", headers });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }
    if (!response.ok) {
      if (response.status === 404) {
        continue;
      }
      throw new AuthApiError(response.status, "Could not load filter options.");
    }
    filtersData = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    break;
  }
  if (!filtersData) {
    throw new AuthApiError(500, "Could not load filter options.");
  }
  const filtersPayload =
    filtersData && typeof filtersData.data === "object" && filtersData.data
      ? (filtersData.data as Record<string, unknown>)
      : filtersData;
  return {
    industries: Array.isArray(filtersPayload.industries) ? filtersPayload.industries : [],
    entities: Array.isArray(filtersPayload.entities) ? filtersPayload.entities : [],
    states: Array.isArray(filtersPayload.states) ? filtersPayload.states : [],
    sectors: Array.isArray(filtersPayload.sectors) ? filtersPayload.sectors : [],
    account_statuses: Array.isArray(filtersPayload.account_statuses)
      ? filtersPayload.account_statuses
      : [],
  };
}

export async function listAssessorProjects(
  params: AssessorProjectListParams = {},
): Promise<AssessorProjectListResult> {
  const page = toPositiveNumber(params.page, 1);
  const limit = toPositiveNumber(params.limit, 10);
  const queryString = toQueryString({ ...params, page, limit });
  const cacheKey = `projects:${queryString}`;
  return getCached("listing", cacheKey, API_CACHE_TTL.listing, () =>
    listAssessorProjectsUncached({ ...params, page, limit }, queryString),
  );
}

async function listAssessorProjectsUncached(
  params: AssessorProjectListParams,
  queryString: string,
): Promise<AssessorProjectListResult> {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }

  const page = toPositiveNumber(params.page, 1);
  const limit = toPositiveNumber(params.limit, 10);
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
 * POST /api/assessor/auth/change-password — requires assessor JWT in localStorage.
 */
export async function changeAssessorPassword(
  payload: AssessorChangePasswordPayload,
): Promise<{ message?: string }> {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl("/api/assessor/auth/change-password"), {
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

/**
 * POST /api/assessor/auth/forgot-password — public; sends reset instructions to the assessor email.
 */
export async function forgotAssessorPassword(payload: {
  email: string;
}): Promise<{ message: string }> {
  const email = payload.email.trim().toLowerCase();
  if (!email) {
    throw new AuthApiError(400, "Please enter your email address.");
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl("/api/assessor/auth/forgot-password"), {
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
