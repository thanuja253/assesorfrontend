import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function getStoredToken(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }
  return globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function ensureProjectId(projectId: string): string {
  const id = projectId?.trim();
  if (!id || id === "undefined" || id === "null") {
    throw new AuthApiError(400, "Invalid project id.");
  }
  return id;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function normalizePayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return {};
  }
  const root = data as Record<string, unknown>;
  const inner = root.data ?? root.payload ?? root.result;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return root;
}

async function getJsonFromPaths(paths: string[]): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "GET",
        headers,
        cache: "no-store",
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    const data = await parseJsonSafe(response);
    lastData = data;

    if (response.ok) {
      return normalizePayload(data);
    }
    if (response.status === 304) {
      return normalizePayload(data);
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(lastData) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not load project data.");
}

function resolvePrimaryDataApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PRIMARY_DATA_API_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") return "http://localhost:3019";
  return "";
}

async function getPrimaryDataJson(path: string): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  const base = resolvePrimaryDataApiBaseUrl();
  const url = `${base}${path}${path.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  let response: Response;
  try {
    response = await apiFetch(url, {
      method: "GET",
      headers: {
        ...headers,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }
  const data = await parseJsonSafe(response);
  if (response.ok || response.status === 304) {
    return normalizePayload(data);
  }
  throw new AuthApiError(response.status || 500, parseApiErrorMessage(data) ?? "Could not load primary data.");
}

async function getJsonFromPublicPaths(paths: string[]): Promise<Record<string, unknown>> {
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    const data = await parseJsonSafe(response);
    lastData = data;

    if (response.ok) {
      return normalizePayload(data);
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not load project data.");
}

async function postJsonToPaths(
  paths: string[],
  body: Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    const data = await parseJsonSafe(response);
    lastData = data;

    if (response.ok) {
      return normalizePayload(data);
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(lastData) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not save facilitator score.");
}

async function ensureFacilitatorFlowProject(projectId: string): Promise<void> {
  const quickview = await getCompanyProjectQuickView(projectId);
  const profile =
    (quickview.profile as Record<string, unknown> | undefined) ??
    (quickview.project as Record<string, unknown> | undefined) ??
    quickview;
  const processType = profile.process_type;
  const processTypeText =
    typeof processType === "string" || typeof processType === "number"
      ? String(processType).trim().toLowerCase()
      : "";
  if (processTypeText !== "f") {
    throw new AuthApiError(400, "Contract document flow is available only for facilitator projects.");
  }
}

async function downloadFromPaths(
  paths: string[],
): Promise<{ blob: Blob; filename: string }> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method: "GET",
        headers,
        cache: "no-store",
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    if (response.ok) {
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
      const filename = decodeURIComponent((match?.[1] ?? "downloaded-file").replaceAll('"', "").trim());
      return { blob, filename };
    }

    const data = await parseJsonSafe(response);
    lastData = data;
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(lastData) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not download file.");
}

async function postFormDataToPaths(
  paths: string[],
  formData: FormData,
  method: "POST" | "PATCH" = "POST",
): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method,
        headers,
        cache: "no-store",
        body: formData,
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    const data = await parseJsonSafe(response);
    lastData = data;

    if (response.ok) {
      return normalizePayload(data);
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 401) {
    throw new AuthApiError(
      401,
      parseApiErrorMessage(lastData) ?? "Invalid or expired session. Please log in again.",
    );
  }
  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not save expense.");
}

async function postFormDataToPublicPaths(
  paths: string[],
  formData: FormData,
  method: "POST" | "PATCH" = "POST",
): Promise<Record<string, unknown>> {
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await apiFetch(getApiUrl(path), {
        method,
        headers: { Accept: "application/json" },
        cache: "no-store",
        body: formData,
      });
    } catch {
      throw new AuthApiError(0, "Network error. Please try again.");
    }

    lastStatus = response.status;
    const data = await parseJsonSafe(response);
    lastData = data;

    if (response.ok) {
      return normalizePayload(data);
    }
    if (response.status !== 404) {
      break;
    }
  }

  if (lastStatus === 403) {
    throw new AuthApiError(403, parseApiErrorMessage(lastData) ?? "Access denied.");
  }
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not save expense.");
}

export type AssessorProjectTabKey =
  | "quick-view"
  | "visit-details"
  | "launch-training"
  | "statuslogs"
  | "assessment-checklist-documents"
  | "scoring"
  | "expenses";

function tabPaths(projectId: string, tab: AssessorProjectTabKey): string[] {
  const id = encodeURIComponent(ensureProjectId(projectId));
  // Preferred assessor-scoped API (Nest recommended).
  const next = {
    "quick-view": [`/api/assessor/projects/${id}/quickview`],
    "visit-details": [`/api/assessor/projects/${id}/visit-details`],
    "launch-training": [`/api/assessor/projects/${id}/launch-training`],
    statuslogs: [`/api/assessor/projects/${id}/statuslogs`],
    "assessment-checklist-documents": [`/api/assessor/projects/${id}/assessment-checklist-documents`],
    scoring: [`/api/assessor/projects/${id}/scoring`],
    expenses: [`/api/assessor/projects/${id}/expenses`],
  } as const;

  if (tab in next) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...(next as any)[tab]];
  }

  // Legacy fallbacks (Laravel-style routes).
  const legacy = {
    "quick-view": [`/api/assessor/auth/quickview/${id}`, `/api/assessor/quickview/${id}`],
    "visit-details": [
      `/api/assessor/auth/companyvisitdetails/${id}`,
      `/api/assessor/companyvisitdetails/${id}`,
    ],
    "launch-training": [
      `/api/assessor/auth/lanuch_handholding/${id}`,
      `/api/assessor/auth/launch_handholding/${id}`,
      `/api/assessor/lanuch_handholding/${id}`,
      `/api/assessor/launch_handholding/${id}`,
    ],
    expenses: [`/api/assessor/auth/expenses/${id}`, `/api/assessor/expenses/${id}`],
    "assessment-checklist-documents": [
      `/api/assessor/auth/checklistdocs_view/${id}`,
      `/api/assessor/checklistdocs_view/${id}`,
    ],
    scoring: [
      `/api/assessor/auth/assesment_scoring/${id}`,
      `/api/assessor/auth/assessment_scoring/${id}`,
      `/api/assessor/assesment_scoring/${id}`,
      `/api/assessor/assessment_scoring/${id}`,
    ],
  } as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...((legacy as any)[tab] ?? [])];
}

export async function getAssessorProjectTabData(
  projectId: string,
  tab: AssessorProjectTabKey,
): Promise<Record<string, unknown>> {
  return await getJsonFromPaths(tabPaths(projectId, tab));
}

export async function getCompanyProjectQuickView(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/quickview`,
  ]);
}

export async function getCompanyProjectPrimaryData(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getPrimaryDataJson(`/api/company/projects/${id}/primary-data`);
}

export async function getCompanyProjectFacilitatorRegistrationInfo(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  let response: Response;
  try {
    response = await apiFetch(getApiUrl(`/api/company/projects/${id}/facilitator-registration-info`), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status || 500,
      parseApiErrorMessage(data) ?? "Could not load facilitator registration info.",
    );
  }
  return normalizePayload(data);
}

export async function getCompanyProjectPrimaryDataReview(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getPrimaryDataJson(`/api/company/projects/${id}/primary-data/review`);
}

export async function getCompanyProjectProposalWorkorderDocuments(projectId: string): Promise<Record<string, unknown>> {
  return await getCompanyProjectWorkOrderDocument(projectId);
}

export async function getCompanyProjectProposalDocument(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/proposal-document`,
  ]);
}

export async function getCompanyProjectAssignments(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/assignments`,
    `/api/company/projects/${id}/assignment-details`,
  ]);
}

export async function getCompanyCoordinators(): Promise<Record<string, unknown>> {
  return await getJsonFromPaths([
    `/api/company/projects/coordinators`,
    `/api/admin/coordinators`,
  ]);
}

/** Approved + complete-profile assessors catalog (admin). Used in facilitator quick view for assignment step. */
export async function getAdminApprovedAssessorsCatalog(): Promise<Record<string, unknown>> {
  const ts = Date.now();
  return await getJsonFromPaths([
    `/api/admin/assessors?approval_status=Approved&profile_status=Complete&page=1&limit=500&_ts=${ts}`,
  ]);
}

export async function getCompanyRegisterInfo(): Promise<Record<string, unknown>> {
  return await getJsonFromPaths([
    `/api/company/register-info`,
  ]);
}

export async function uploadCompanyProjectWorkOrderDocument(
  projectId: string,
  workorderdocument: File,
): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  const formData = new FormData();
  formData.set("workorderdocument", workorderdocument);
  return await postFormDataToPaths([
    `/api/company/projects/${id}/facilitator-contract-document`,
    `/api/company/projects/${id}/work-order-document`,
  ], formData, "POST");
}

export async function getCompanyProjectWorkOrderDocument(projectId: string): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/facilitator-contract-document`,
    `/api/company/projects/${id}/work-order-document`,
  ]);
}

export async function getCompanyProjectProjectCode(projectId: string): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([`/api/company/projects/${id}/project-code`]);
}

export async function reviewCompanyProjectWorkOrderDocument(
  projectId: string,
  payload: { wo_status: 1 | 2; wo_remarks?: string },
): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  const body: Record<string, unknown> = { wo_status: payload.wo_status };
  if (payload.wo_status === 2) {
    body.wo_remarks = payload.wo_remarks?.trim() ?? "";
  }
  return await postJsonToPaths([
    `/api/company/projects/${id}/facilitator-contract-document/review`,
    `/api/company/projects/${id}/work-order-document/review`,
  ], body, "PATCH");
}

export async function reuploadCompanyProjectWorkOrderDocument(
  projectId: string,
  workorderdocument: File,
): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  const formData = new FormData();
  formData.set("workorderdocument", workorderdocument);
  return await postFormDataToPaths([
    `/api/company/projects/${id}/facilitator-contract-document/reupload`,
    `/api/company/projects/${id}/work-order-document/reupload`,
  ], formData, "POST");
}

export async function saveCompanyProjectWorkOrderAcceptance(
  projectId: string,
  payload: { wo_po_number: string; wo_acceptance_date: string },
): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await postJsonToPaths([
    `/api/company/projects/${id}/facilitator-contract-document/acceptance`,
    `/api/company/projects/${id}/work-order-document/acceptance`,
  ], {
    wo_po_number: payload.wo_po_number,
    wo_acceptance_date: payload.wo_acceptance_date,
  }, "PATCH");
}

export async function getCompanyProjectWorkOrderAcceptance(projectId: string): Promise<Record<string, unknown>> {
  await ensureFacilitatorFlowProject(projectId);
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/facilitator-contract-document/acceptance`,
    `/api/company/projects/${id}/work-order-document/acceptance`,
  ]);
}

export async function getAssessorChecklistDocuments(
  projectId: string,
  criteriaId?: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const qs = criteriaId?.trim() ? `?criteria_id=${encodeURIComponent(criteriaId.trim())}` : "";
  const next = `/api/assessor/projects/${id}/assessment-checklist-documents${qs}`;
  const legacy = `/api/assessor/auth/checklistdocs_view_by_criteria/${id}/${encodeURIComponent(criteriaId?.trim() || "1")}`;
  const baseLegacy = `/api/assessor/auth/checklistdocs_view/${id}`;
  const paths = criteriaId?.trim()
    ? [next, legacy, baseLegacy]
    : [next, baseLegacy];
  return await getJsonFromPaths(paths);
}

export async function getCompanyProjectChecklistDocuments(
  projectId: string,
  criteriaId?: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const qs = criteriaId?.trim() ? `?criteria_id=${encodeURIComponent(criteriaId.trim())}` : "";
  return await getJsonFromPaths([
    `/api/company/projects/${id}/assessment-checklist-documents${qs}`,
  ]);
}

export async function downloadAssessmentChecklistSampleDocument(
  projectId: string,
  sectorId?: string,
): Promise<{ blob: Blob; filename: string }> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const qs = sectorId?.trim() ? `?sector_id=${encodeURIComponent(sectorId.trim())}` : "";
  return await downloadFromPaths([
    `/api/company/projects/${id}/assessment-checklist-sample-document${qs}`,
    `/api/companies/projects/${id}/assessment-checklist-sample-document${qs}`,
    `/api/assessor/projects/${id}/assessment-checklist-sample-document${qs}`,
    `/api/assessors/projects/${id}/assessment-checklist-sample-document${qs}`,
  ]);
}

export async function getCompanyAssessmentCriteriaBySector(sectorId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(sectorId);
  return await getJsonFromPaths([
    `/api/company/assessment-criteria/sector/${id}`,
  ]);
}

export async function getProjectLaunchTraining(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/admin/projects/${id}/launch-training`,
    `/api/company/projects/${id}/launch-training`,
  ]);
}

export async function uploadProjectLaunchTrainingSession(
  projectId: string,
  payload: {
    sessionIndex: number;
    sessionDate: string;
    sessionTime?: string;
    document: File;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const formData = new FormData();
  formData.set("session_index", String(payload.sessionIndex));
  formData.set("session_date", payload.sessionDate);
  if (payload.sessionTime?.trim()) {
    formData.set("session_time", payload.sessionTime.trim());
  }
  formData.set("document", payload.document);
  formData.set("file", payload.document);
  return await postFormDataToPaths(
    [
      `/api/company/projects/${id}/launch-training`,
      `/api/admin/projects/${id}/launch-training`,
    ],
    formData,
    "POST",
  );
}

export async function getFacilitatorProjectLaunchTraining(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/facilitator/projects/${id}/launch-and-training`,
    `/api/facilitator/projects/${id}/launch-training`,
    `/api/facilitator/projects/${id}/launch-training-program`,
    `/api/facilitators/projects/${id}/launch-and-training`,
    `/api/facilitators/projects/${id}/launch-training`,
    `/api/facilitators/projects/${id}/launch-training-program`,
  ]);
}

export async function uploadFacilitatorProjectLaunchTrainingSession(
  projectId: string,
  payload: {
    sessionIndex: number;
    sessionDate: string;
    sessionTime?: string;
    document: File;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const formData = new FormData();
  const sessionIndexText = String(payload.sessionIndex);
  const sessionDate = payload.sessionDate.trim();
  const sessionTime = payload.sessionTime?.trim() ?? "";
  formData.set("session_index", sessionIndexText);
  formData.set("session", sessionIndexText);
  formData.set("session_date", sessionDate);
  formData.set("launch_training_report_date", sessionDate);
  if (sessionTime) {
    formData.set("session_time", sessionTime);
  }
  // Facilitator endpoints support these aliases.
  formData.set("launch_session_file", payload.document);
  formData.set("file", payload.document);
  formData.set("document", payload.document);
  formData.set("document_file", payload.document);
  formData.set("upload", payload.document);
  formData.set("launch_upload", payload.document);

  return await postFormDataToPaths(
    [
      `/api/facilitator/projects/${id}/launch-training-sessions`,
      `/api/facilitator/projects/${id}/launch-training`,
      `/api/facilitator/projects/${id}/launch-and-training-document`,
      `/api/facilitators/projects/${id}/launch-training-sessions`,
      `/api/facilitators/projects/${id}/launch-training`,
      `/api/facilitators/projects/${id}/launch-and-training-document`,
    ],
    formData,
    "POST",
  );
}

export async function getAdminAssessmentScoring(
  projectId: string,
  criteriaId?: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const c = criteriaId?.trim();
  const qs = c ? `?criteria_id=${encodeURIComponent(c)}&crt=${encodeURIComponent(c)}` : "";
  return await getJsonFromPaths([
    `/api/assessor/auth/assesment_scoring/${id}${qs}`,
    `/api/assessor/auth/assessment_scoring/${id}${qs}`,
    `/api/assessor/assesment_scoring/${id}${qs}`,
    `/api/assessor/assessment_scoring/${id}${qs}`,
    `/api/admin/assesment_scoring/${id}${qs}`,
    `/api/admin/assessment_scoring/${id}${qs}`,
  ]);
}

export async function saveAssessorScore(
  projectId: string,
  payload: {
    criteria_id: string;
    rows: Array<{ parameter_id: string; assessor_score: number; assessor_remarks: string }>;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const body = { ...payload, project_id: ensureProjectId(projectId) } as Record<string, unknown>;
  return await postJsonToPaths(
    [
      `/api/assessor/update_assessor_score/${id}`,
      `/assessor/update_assessor_score/${id}`,
      `/api/assessors/update_assessor_score/${id}`,
      `/assessors/update_assessor_score/${id}`,
      `/api/assessor/update_assessor_score`,
      `/assessor/update_assessor_score`,
      `/api/assessors/update_assessor_score`,
      `/assessors/update_assessor_score`,
    ],
    body,
  );
}

export async function finalSubmitAssessorScore(
  projectId: string,
  payload: {
    criteria_id: string;
    rows: Array<{ parameter_id: string; assessor_score: number; assessor_remarks: string }>;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const body = { ...payload, project_id: ensureProjectId(projectId) } as Record<string, unknown>;
  return await postJsonToPaths(
    [
      `/api/assessor/finalsubmit_assessor_score/${id}`,
      `/assessor/finalsubmit_assessor_score/${id}`,
      `/api/assessors/finalsubmit_assessor_score/${id}`,
      `/assessors/finalsubmit_assessor_score/${id}`,
      `/api/assessor/finalsubmit_assessor_score`,
      `/assessor/finalsubmit_assessor_score`,
      `/api/assessors/finalsubmit_assessor_score`,
      `/assessors/finalsubmit_assessor_score`,
    ],
    body,
  );
}

export async function downloadAssessorFinalScoring(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await downloadFromPaths([
    `/api/assessor/projects/${id}/export-scoring-document`,
    `/api/assessor/projects/${id}/export_scoring_document`,
    `/api/assessor/auth/export_scoring_document/${id}`,
    `/api/assessor/download_final_scoring/${id}`,
    `/api/assessors/download_final_scoring/${id}`,
    `/api/admin/download_final_scoring/${id}`,
  ]);
}

export async function downloadAssessorSampleChecklistDocument(
  projectId: string,
  sectorId?: string,
): Promise<{ blob: Blob; filename: string }> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const qs = sectorId?.trim() ? `?sector_id=${encodeURIComponent(sectorId.trim())}` : "";
  return await downloadFromPaths([
    `/api/assessor/projects/${id}/download-sample-checklist-document${qs}`,
    `/api/assessor/projects/${id}/download_sample_checklist_document${qs}`,
    `/api/assessor/auth/download_sample_checklist_document/${id}${qs}`,
    `/api/assessor/projects/${id}/assessment-checklist-sample-document${qs}`,
  ]);
}

export async function getAdminExpenseInvoices(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/assessor/projects/${id}/expenses`,
    `/assessor/projects/${id}/expenses`,
    `/api/assessors/projects/${id}/expenses`,
    `/assessors/projects/${id}/expenses`,
    `/api/assessor/auth/expenses/${id}`,
    `/assessor/auth/expenses/${id}`,
    `/api/assessors/auth/expenses/${id}`,
    `/assessors/auth/expenses/${id}`,
  ]);
}

export async function createAdminExpenseInvoice(
  projectId: string,
  payload: {
    invoicetitle: string;
    invoiceamount: string;
    sgst: string;
    cgst: string;
    igst: string;
    payment_date: string;
    regFeeInvoice?: File;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const formData = new FormData();
  formData.set("invoicetitle", payload.invoicetitle);
  formData.set("invoice_title", payload.invoicetitle);
  formData.set("invoiceamount", payload.invoiceamount);
  formData.set("invoice_amount", payload.invoiceamount);
  formData.set("payable_amount", payload.invoiceamount);
  formData.set("sgst", payload.sgst);
  formData.set("cgst", payload.cgst);
  formData.set("igst", payload.igst);
  formData.set("payment_date", payload.payment_date);
  formData.set("payment_for", "expA");
  if (payload.regFeeInvoice) {
    formData.set("regFeeInvoice", payload.regFeeInvoice);
  }
  return await postFormDataToPaths(
    [
      `/api/assessor/projects/${id}/expenses`,
      `/assessor/projects/${id}/expenses`,
      `/api/assessors/projects/${id}/expenses`,
      `/assessors/projects/${id}/expenses`,
      `/api/assessor/auth/expenses/${id}`,
      `/assessor/auth/expenses/${id}`,
      `/api/assessors/auth/expenses/${id}`,
      `/assessors/auth/expenses/${id}`,
    ],
    formData,
    "POST",
  );
}

export async function updateAdminExpenseInvoice(
  projectId: string,
  invoiceId: string,
  payload: {
    invoicetitle?: string;
    invoiceamount?: string;
    sgst?: string;
    cgst?: string;
    igst?: string;
    payment_date?: string;
    payment_for?: string;
    regFeeInvoice?: File;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const invId = encodeURIComponent(invoiceId.trim());
  const formData = new FormData();
  if (payload.invoicetitle !== undefined) formData.set("invoicetitle", payload.invoicetitle);
  if (payload.invoiceamount !== undefined) formData.set("invoiceamount", payload.invoiceamount);
  if (payload.sgst !== undefined) formData.set("sgst", payload.sgst);
  if (payload.cgst !== undefined) formData.set("cgst", payload.cgst);
  if (payload.igst !== undefined) formData.set("igst", payload.igst);
  if (payload.payment_date !== undefined) formData.set("payment_date", payload.payment_date);
  formData.set("payment_for", payload.payment_for ?? "expA");
  if (payload.regFeeInvoice) formData.set("regFeeInvoice", payload.regFeeInvoice);
  return await postFormDataToPaths(
    [
      `/api/assessor/auth/expenses/${id}/${invId}`,
      `/assessor/auth/expenses/${id}/${invId}`,
      `/api/assessors/auth/expenses/${id}/${invId}`,
      `/assessors/auth/expenses/${id}/${invId}`,
      `/api/assessor/projects/${id}/expenses/${invId}`,
      `/assessor/projects/${id}/expenses/${invId}`,
      `/api/assessors/projects/${id}/expenses/${invId}`,
      `/assessors/projects/${id}/expenses/${invId}`,
    ],
    formData,
    "PATCH",
  );
}

export async function getFacilitatorFinanceInvoices(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  let proformaPayload: Record<string, unknown> | null = null;
  let taxPayload: Record<string, unknown> | null = null;
  let lastError: unknown = null;

  try {
    proformaPayload = await getJsonFromPublicPaths([
      `/api/facilitator/projects/${id}/finance-v2/proforma`,
      `/api/facilitators/projects/${id}/finance-v2/proforma`,
    ]);
  } catch (e: unknown) {
    lastError = e;
  }

  try {
    taxPayload = await getJsonFromPublicPaths([
      `/api/facilitator/projects/${id}/finance-v2/tax-invoices`,
      `/api/facilitator/projects/${id}/finance-v2/tax-tab`,
      `/api/facilitators/projects/${id}/finance-v2/tax-invoices`,
      `/api/facilitators/projects/${id}/finance-v2/tax-tab`,
    ]);
  } catch (e: unknown) {
    lastError = e;
  }

  if (!proformaPayload && !taxPayload) {
    if (lastError instanceof AuthApiError) {
      throw lastError;
    }
    throw new AuthApiError(500, "Could not load facilitator finance invoices.");
  }

  const proformaListRaw = Array.isArray(proformaPayload?.invoices)
    ? proformaPayload.invoices
    : Array.isArray((proformaPayload?.data as Record<string, unknown> | undefined)?.invoices)
      ? (((proformaPayload?.data as Record<string, unknown>).invoices) as unknown[])
      : [];
  const taxListRaw = Array.isArray(taxPayload?.invoices)
    ? taxPayload.invoices
    : Array.isArray((taxPayload?.data as Record<string, unknown> | undefined)?.invoices)
      ? (((taxPayload?.data as Record<string, unknown>).invoices) as unknown[])
      : [];
  return {
    invoices: [...proformaListRaw, ...taxListRaw],
  };
}

export async function submitFacilitatorFinanceInvoiceSupporting(
  projectId: string,
  invoiceId: string,
  invoiceType: string,
  payload: {
    transactionMode: string;
    transactionId?: string;
    supportingDocument: File;
  },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const invId = encodeURIComponent(invoiceId.trim());
  const formData = new FormData();
  const mode = payload.transactionMode.trim();
  const transactionId = payload.transactionId?.trim() ?? "";

  formData.set("transaction_mode", mode);
  formData.set("payment_mode", mode);
  formData.set("trans_mode", mode);
  if (transactionId) {
    formData.set("transaction_id", transactionId);
    formData.set("trans_id", transactionId);
  }
  formData.set("supporting_document", payload.supportingDocument);
  formData.set("supporting_doc", payload.supportingDocument);
  formData.set("offline_tran_doc", payload.supportingDocument);
  formData.set("offlineTranDoc", payload.supportingDocument);
  formData.set("document", payload.supportingDocument);
  formData.set("file", payload.supportingDocument);
  const type = invoiceType.trim().toLowerCase();
  const proformaPaths = [
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/submit-payment`,
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/upload-supporting`,
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/supporting-document`,
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/payment`,
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/submit`,
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/reupload`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/submit-payment`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/upload-supporting`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/supporting-document`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/payment`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/submit`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/reupload`,
  ];
  const taxPaths = [
    `/api/facilitator/projects/${id}/finance-v2/tax-invoices/${invId}/submit-payment`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/submit-payment`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/upload-supporting`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/supporting-document`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/payment`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/submit`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/reupload`,
    `/api/facilitators/projects/${id}/finance-v2/tax-invoices/${invId}/submit-payment`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/submit-payment`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/upload-supporting`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/supporting-document`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/payment`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/submit`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/reupload`,
  ];
  const paths = type.includes("proforma") ? proformaPaths : taxPaths;
  return await postFormDataToPublicPaths(paths, formData, "POST");
}

export async function getFacilitatorFinanceInvoiceApprovalStatus(
  projectId: string,
  invoiceId: string,
  invoiceType: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const invId = encodeURIComponent(invoiceId.trim());
  const type = invoiceType.trim().toLowerCase();
  const proformaPaths = [
    `/api/facilitator/projects/${id}/finance-v2/proforma/${invId}/approval`,
    `/api/facilitators/projects/${id}/finance-v2/proforma/${invId}/approval`,
  ];
  const taxPaths = [
    `/api/facilitator/projects/${id}/finance-v2/tax-invoices/${invId}/approval`,
    `/api/facilitator/projects/${id}/finance-v2/tax-tab/${invId}/approval`,
    `/api/facilitators/projects/${id}/finance-v2/tax-invoices/${invId}/approval`,
    `/api/facilitators/projects/${id}/finance-v2/tax-tab/${invId}/approval`,
  ];
  const paths = type.includes("proforma") ? proformaPaths : taxPaths;
  return await getJsonFromPublicPaths(paths);
}


