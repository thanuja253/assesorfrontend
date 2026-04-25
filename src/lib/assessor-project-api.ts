import { AuthApiError, getApiUrl, parseApiErrorMessage } from "@/lib/auth-api";
import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (!token) {
    throw new AuthApiError(401, "You are not signed in. Please log in again.");
  }
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
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
      response = await fetch(getApiUrl(path), {
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

export type AssessorProjectTabKey =
  | "quick-view"
  | "visit-details"
  | "launch-training"
  | "statuslogs"
  | "assessment-checklist-documents"
  | "scoring"
  | "expenses";

function tabPaths(projectId: string, tab: AssessorProjectTabKey): string[] {
  const id = encodeURIComponent(projectId);
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

export async function getAssessorChecklistDocuments(
  projectId: string,
  criteriaId?: string,
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(projectId);
  const qs = criteriaId?.trim() ? `?criteria_id=${encodeURIComponent(criteriaId.trim())}` : "";
  const next = `/api/assessor/projects/${id}/assessment-checklist-documents${qs}`;
  const legacy = `/api/assessor/auth/checklistdocs_view_by_criteria/${id}/${encodeURIComponent(criteriaId?.trim() || "1")}`;
  const baseLegacy = `/api/assessor/auth/checklistdocs_view/${id}`;
  const paths = criteriaId?.trim()
    ? [next, legacy, baseLegacy]
    : [next, baseLegacy];
  return await getJsonFromPaths(paths);
}


