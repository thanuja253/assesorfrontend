/**
 * Hybrid workflow (workflow_flow === 2): CII phase then facilitator phase.
 * Pure CII (flow 1, process_type c) and pure facilitator (flow 1, process_type f) use existing UI.
 */

export type WorkflowRole = "admin" | "company";

export type FlowStepPair = {
  latest: { activity: string; status: string; responsibility: string };
  next: { activity: string; status: string; responsibility: string };
};

export type WorkflowStatusData = {
  workflow_flow: number;
  process_type: string;
  process_phase: string;
  next_activities_id: number;
  current_activity: string;
  current_activity_id: number | null;
  current_responsibility: string;
  next_activity: string;
  next_activity_id: number | null;
  next_responsibility: string;
  previous_activity_id: number | null;
  is_complete: boolean;
  step_order: string[];
  step_map: Record<string, Record<string, unknown>>;
  assignment_section_enabled?: boolean;
  show_add_facilitator?: boolean;
  raw: Record<string, unknown>;
};

export type HybridContext =
  | {
      mode: "pure";
      workflow: WorkflowStatusData;
      quickview: Record<string, unknown>;
      assignments: Record<string, unknown>;
    }
  | {
      mode: "hybrid";
      workflow: WorkflowStatusData;
      quickview: Record<string, unknown>;
      stepId: number;
      phase: string;
      processType: string;
      latest: string;
      next: string;
      nextResp: string;
      stepOrder: string[];
      stepMap: Record<string, Record<string, unknown>>;
      profile: Record<string, unknown>;
      activities: unknown;
      quickviewPhase: string;
      assignments: Record<string, unknown>;
    };

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function unwrapApiData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return payload;
}

export function normalizeWorkflowStatus(payload: Record<string, unknown>): WorkflowStatusData {
  const data = unwrapApiData(payload);
  const stepOrderRaw = data.step_order ?? data.stepOrder;
  const stepOrder = Array.isArray(stepOrderRaw)
    ? stepOrderRaw.map((item) => String(item))
    : [];
  const stepMapRaw = data.step_map ?? data.stepMap;
  const stepMap =
    stepMapRaw && typeof stepMapRaw === "object" && !Array.isArray(stepMapRaw)
      ? (stepMapRaw as Record<string, Record<string, unknown>>)
      : {};

  return {
    workflow_flow: asNumber(data.workflow_flow ?? data.workflowFlow) ?? 1,
    process_type: asText(data.process_type ?? data.processType).toLowerCase() || "c",
    process_phase: asText(data.process_phase ?? data.processPhase).toLowerCase(),
    next_activities_id: asNumber(data.next_activities_id ?? data.nextActivitiesId) ?? 0,
    current_activity: asText(data.current_activity ?? data.currentActivity) || "—",
    current_activity_id: asNumber(data.current_activity_id ?? data.currentActivityId),
    current_responsibility: asText(data.current_responsibility ?? data.currentResponsibility) || "—",
    next_activity: asText(data.next_activity ?? data.nextActivity) || "—",
    next_activity_id: asNumber(data.next_activity_id ?? data.nextActivityId),
    next_responsibility: asText(data.next_responsibility ?? data.nextResponsibility) || "—",
    previous_activity_id: asNumber(data.previous_activity_id ?? data.previousActivityId),
    is_complete: Boolean(data.is_complete ?? data.isComplete),
    step_order: stepOrder,
    step_map: stepMap,
    assignment_section_enabled: Boolean(
      data.assignment_section_enabled ?? data.assignmentSectionEnabled,
    ),
    show_add_facilitator: Boolean(data.show_add_facilitator ?? data.showAddFacilitator),
    raw: data,
  };
}

export function isHybridWorkflow(workflow: WorkflowStatusData): boolean {
  return workflow.workflow_flow === 2;
}

export function isCiiPhase(workflow: WorkflowStatusData): boolean {
  return (
    workflow.process_type === "c" ||
    workflow.process_phase === "cii" ||
    workflow.process_phase === "c"
  );
}

export function isFacilitatorPhase(workflow: WorkflowStatusData): boolean {
  return (
    workflow.process_type === "f" ||
    workflow.process_phase === "facilitator" ||
    workflow.process_phase === "f"
  );
}

/** Latest / next boxes from workflow-status (not quickview next_step). */
export function workflowStepPairFromStatus(workflow: WorkflowStatusData): FlowStepPair {
  const nextStatus = workflow.is_complete ? "Completed" : "Pending";
  return {
    latest: {
      activity: workflow.current_activity,
      status: workflow.is_complete ? "Completed" : "Completed",
      responsibility: workflow.current_responsibility,
    },
    next: {
      activity: workflow.next_activity,
      status: nextStatus,
      responsibility: workflow.next_responsibility,
    },
  };
}

export type WorkflowStepperItem = { id: string; label: string; responsibility: string };

export function buildStepperFromWorkflow(workflow: WorkflowStatusData): WorkflowStepperItem[] {
  const order = workflow.step_order;
  if (order.length === 0) return [];

  return order.map((id) => {
    const entry = workflow.step_map[id] ?? workflow.step_map[String(id)] ?? {};
    const label =
      asText(entry.label) ||
      asText(entry.name) ||
      asText(entry.activity) ||
      asText(entry.title) ||
      `Step ${id}`;
    const responsibility =
      asText(entry.responsibility) || asText(entry.owner) || asText(entry.role) || "—";
    return { id: String(id), label, responsibility };
  });
}

export function resolveHybridStepIndex(workflow: WorkflowStatusData): number {
  const nextId = String(workflow.next_activities_id);
  if (!nextId || nextId === "0") return -1;

  const order = workflow.step_order;
  if (order.length > 0) {
    const idx = order.findIndex((stepId) => String(stepId) === nextId);
    if (idx >= 0) return idx;
  }

  const currentId = workflow.current_activity_id;
  if (currentId !== null && order.length > 0) {
    const idx = order.findIndex((stepId) => String(stepId) === String(currentId));
    if (idx >= 0) return idx;
  }

  return -1;
}

export function shouldShowAddFacilitator(
  workflow: WorkflowStatusData,
  assignments?: Record<string, unknown>,
): boolean {
  if (workflow.show_add_facilitator) return true;
  const assignRoot = unwrapApiData(assignments ?? {});
  if (Boolean(assignRoot.show_add_facilitator ?? assignRoot.showAddFacilitator)) {
    return true;
  }
  return workflow.next_activities_id === 64 && workflow.process_type === "c";
}

export function buildHybridContext(
  workflowPayload: Record<string, unknown>,
  quickviewPayload: Record<string, unknown>,
  assignmentsPayload?: Record<string, unknown>,
): HybridContext {
  const workflow = normalizeWorkflowStatus(workflowPayload);
  const quickview = unwrapApiData(quickviewPayload);
  const assignments = assignmentsPayload ? unwrapApiData(assignmentsPayload) : {};

  if (!isHybridWorkflow(workflow)) {
    return { mode: "pure", workflow, quickview, assignments };
  }

  const profile =
    (quickview.profile as Record<string, unknown> | undefined) ??
    (quickview.company as Record<string, unknown> | undefined) ??
    {};

  return {
    mode: "hybrid",
    workflow,
    quickview,
    stepId: workflow.next_activities_id,
    phase: workflow.process_phase || (workflow.process_type === "f" ? "facilitator" : "cii"),
    processType: workflow.process_type,
    latest: workflow.current_activity,
    next: workflow.next_activity,
    nextResp: workflow.next_responsibility,
    stepOrder: workflow.step_order,
    stepMap: workflow.step_map,
    profile,
    activities: quickview.companies_activty ?? quickview.companies_activity ?? [],
    quickviewPhase: asText(quickview.quickview_phase ?? quickview.quickviewPhase),
    assignments,
  };
}

/** Facilitator portal routes (process_type f) after step 64 assign. */
export function shouldUseFacilitatorPortal(ctx: HybridContext): boolean {
  if (ctx.mode !== "hybrid") return false;
  return isFacilitatorPhase(ctx.workflow);
}

/** Pure facilitator (flow 1, process_type f) or hybrid after step 64 assign. */
export function detectFacilitatorProcessType(quickView: Record<string, unknown>): boolean {
  const profile = (quickView.profile as Record<string, unknown> | undefined) ?? {};
  const project = (quickView.project as Record<string, unknown> | undefined) ?? {};
  const company = (quickView.company as Record<string, unknown> | undefined) ?? {};
  const raw =
    profile.process_type ??
    profile.processType ??
    project.process_type ??
    project.processType ??
    company.process_type ??
    company.processType ??
    quickView.process_type ??
    quickView.processType;
  const text = asText(raw).toLowerCase();
  return text === "f";
}

export function resolveFacilitatorProcessFromContext(
  ctx: HybridContext | null,
  quickView: Record<string, unknown>,
): boolean {
  if (ctx?.mode === "hybrid") return ctx.processType === "f";
  return detectFacilitatorProcessType(quickView);
}
