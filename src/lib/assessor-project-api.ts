import { API_CACHE_TTL, getCached, invalidateAfterProjectMutation } from "@/lib/api-cache";
import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";
import {
  buildHybridContext,
  type HybridContext,
  type WorkflowRole,
} from "@/lib/hybrid-workflow";

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

function projectIdFromApiPaths(paths: string[]): string {
  for (const path of paths) {
    const nested = path.match(/\/projects\/([^/?]+)/);
    if (nested?.[1]) {
      return decodeURIComponent(nested[1]);
    }
    const legacy = path.match(
      /\/(?:auth\/)?(?:expenses|assesment_scoring|assessment_scoring|quickview|companyvisitdetails|checklistdocs_view)\/([^/?]+)/,
    );
    if (legacy?.[1]) {
      return decodeURIComponent(legacy[1]);
    }
  }
  return "";
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

async function getJsonFromPathsUncached(paths: string[]): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetch(getApiUrl(path), {
        method: "GET",
        headers,
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
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not load project data.");
}

async function getJsonFromPaths(paths: string[]): Promise<Record<string, unknown>> {
  const cacheKey = paths.join("|");
  return getCached("page", cacheKey, API_CACHE_TTL.page, () => getJsonFromPathsUncached(paths));
}

async function postJsonToPaths(
  paths: string[],
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  let lastStatus = 500;
  let lastData: unknown = null;

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetch(getApiUrl(path), {
        method: "POST",
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
      const projectId = typeof body.project_id === "string" ? body.project_id : "";
      if (projectId) {
        invalidateAfterProjectMutation(projectId);
      }
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
  throw new AuthApiError(lastStatus || 500, parseApiErrorMessage(lastData) ?? "Could not save assessor score.");
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
      response = await fetch(getApiUrl(path), {
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
      response = await fetch(getApiUrl(path), {
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
      const projectId = projectIdFromApiPaths(paths);
      if (projectId) {
        invalidateAfterProjectMutation(projectId);
      }
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

/** Admin quickview — profile, docs, activity timeline (not hybrid step ids). */
export async function getAdminProjectQuickView(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([`/api/admin/projects/${id}/quickview`]);
}

/** Hybrid stepper source of truth — admin. */
export async function getAdminProjectWorkflowStatus(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/admin/projects/${id}/workflow-status`,
    `/api/admin/projects/${id}/workflow`,
  ]);
}

/** Hybrid stepper source of truth — company (assessor/facilitator panels use this path). */
export async function getCompanyProjectWorkflow(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/workflow`,
    `/api/company/projects/${id}/workflow-status`,
  ]);
}

export async function getWorkflowForRole(
  projectId: string,
  role: WorkflowRole,
): Promise<Record<string, unknown>> {
  return role === "admin"
    ? getAdminProjectWorkflowStatus(projectId)
    : getCompanyProjectWorkflow(projectId);
}

export async function getQuickviewForRole(
  projectId: string,
  role: WorkflowRole,
): Promise<Record<string, unknown>> {
  return role === "admin" ? getAdminProjectQuickView(projectId) : getCompanyProjectQuickView(projectId);
}

/** Admin assignments tab — coordinators, show_add_facilitator, facilitator row. */
export async function getAdminProjectAssignments(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([`/api/admin/projects/${id}/assignments`]);
}

/**
 * Load hybrid vs pure context per playbook §7.
 * workflow_flow === 2 → stepper from workflow; quickview for profile/docs/timeline only.
 */
export async function loadProjectHybridContext(
  projectId: string,
  role: WorkflowRole = "company",
): Promise<HybridContext> {
  const [workflowResult, quickviewPayload, assignmentsPayload] = await Promise.all([
    getWorkflowForRole(projectId, role).catch(() => ({ workflow_flow: 1 })),
    getQuickviewForRole(projectId, role),
    role === "admin"
      ? getAdminProjectAssignments(projectId).catch(() => ({}))
      : getCompanyProjectAssignments(projectId).catch(() => ({})),
  ]);
  return buildHybridContext(workflowResult, quickviewPayload, assignmentsPayload);
}

/** Admin once per project — enable hybrid (workflow_flow: 2, process_type: c). */
export async function patchAdminProjectQuickviewData(
  projectId: string,
  body: { workflow_flow: number; process_type: string },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const path = `/api/admin/projects/${id}/quickview-data`;
  const headers = authHeaders();
  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(0, "Network error. Please try again.");
  }
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      parseApiErrorMessage(data) ?? "Could not update project workflow.",
    );
  }
  invalidateAfterProjectMutation(projectId);
  return normalizePayload(data);
}

/** Manual workflow advance when domain API does not return workflow yet. */
export async function advanceAdminProjectWorkflow(
  projectId: string,
  body: { completed_step_id: string; outcome: "success" | "reject" },
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await postJsonToPaths([`/api/admin/projects/${id}/workflow/advance`], body);
}

export async function getCompanyProjectPrimaryData(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/primary-data`,
  ]);
}

export async function getCompanyProjectPrimaryDataReview(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/primary-data/review`,
  ]);
}

export async function getCompanyProjectProposalWorkorderDocuments(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/company/projects/${id}/proposal-workorder-documents`,
  ]);
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

/** Registration payload (includes process_type, selected_facilitator). Admin path first; company fallback for assessor tokens. */
export async function getAdminProjectRegistrationData(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/admin/projects/${id}/registration-data`,
    `/api/company/projects/${id}/registration-data`,
  ]);
}

export async function getCompanyProjectFacilitatorRegistrationInfo(
  projectId: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([`/api/company/projects/${id}/facilitator-registration-info`]);
}

/** Facilitator process (process_type f) — proforma list from finance v2. */
export async function getFacilitatorFinanceV2Proforma(projectId: string): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  return await getJsonFromPaths([
    `/api/facilitators/projects/${id}/finance-v2/proforma`,
    `/api/facilitator/projects/${id}/finance-v2/proforma`,
  ]);
}

export async function getCompanyCoordinators(): Promise<Record<string, unknown>> {
  return await getJsonFromPaths([
    `/api/company/projects/coordinators`,
    `/api/admin/coordinators`,
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

export async function getAdminAssessmentScoring(
  projectId: string,
  criteriaId?: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(ensureProjectId(projectId));
  const qs = criteriaId?.trim() ? `?crt=${encodeURIComponent(criteriaId.trim())}` : "";
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


