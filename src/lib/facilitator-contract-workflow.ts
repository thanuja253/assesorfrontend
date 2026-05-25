/**
 * Facilitator contract phase — Latest/Next binding per backend quickview contract.
 * Prefer facilitator_contract_review + quickview_display; do not use companies_activty[0] alone.
 */

export type ContractQuickviewMode = "normal" | "facilitator_contract";

export type FlowStepShape = {
  activity: string;
  status: string;
  responsibility: string;
};

export type BoundContractQuickview = {
  mode: ContractQuickviewMode;
  latest: { text: string; responsibility: string };
  next: { text: string; responsibility: string };
  phase: string;
  instruction: string;
  showUpload: boolean;
  showReupload: boolean;
  showAcceptReject: boolean;
  showPoForm: boolean;
};

export function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "yes") return true;
    if (text === "false" || text === "no") return false;
  }
  return undefined;
}

/** Facilitator may POST first contract when no PDF exists yet (per phase guide). */
export function phaseAllowsFacilitatorInitialUpload(phase: string): boolean {
  const p = phase.trim().toLowerCase();
  if (!p) return true;
  if (p.includes("rejected_awaiting_facilitator")) return false;
  if (p.includes("pending_cii")) return false;
  if (p.includes("accepted_awaiting_po")) return false;
  return true;
}

function pickString(source: Record<string, unknown> | undefined, keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** Unwrap API envelope so keys work at data.* and root. */
export function unwrapQuickviewPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const inner = pickRecord(raw.data);
  if (!inner) return raw;
  return { ...raw, ...inner };
}

function stepName(value: unknown): string {
  const rec = pickRecord(value);
  if (!rec) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
  return pickString(rec, ["name", "activity", "step", "label", "title"]);
}

function stepResponsibility(value: unknown): string {
  const rec = pickRecord(value);
  if (!rec) return "";
  return pickString(rec, ["responsibility", "owner", "role"]);
}

function phaseToStatus(phase: string, slot: "latest" | "next"): string {
  const p = phase.trim().toLowerCase();
  if (p === "facilitator_contract_pending_cii_review") {
    return slot === "latest" ? "Completed" : "Pending";
  }
  if (p === "facilitator_contract_rejected_awaiting_facilitator") {
    return slot === "latest" ? "Rejected" : "Pending";
  }
  if (p === "facilitator_contract_reuploaded_pending_cii") {
    return slot === "latest" ? "Completed" : "Pending";
  }
  if (p === "facilitator_contract_accepted_awaiting_po") {
    return slot === "latest" ? "Accepted" : "Pending";
  }
  return slot === "latest" ? "Completed" : "Pending";
}

/**
 * Maps quickview JSON to Latest/Next + contract-phase UI flags (Rule #1).
 */
export function bindContractQuickview(raw: Record<string, unknown>): BoundContractQuickview {
  const data = unwrapQuickviewPayload(raw);
  const review = pickRecord(data.facilitator_contract_review);

  const latestStep = data.latest_step ?? data.latestStep;
  const nextStep = data.next_step ?? data.nextStep;
  const display = pickRecord(data.quickview_display);
  const workflow = pickRecord(data.facilitator_contract_workflow);
  const latestCompleted = pickRecord(workflow?.latest_step_completed);
  const nextWorkflow = pickRecord(workflow?.next_step);

  if (!review) {
    return {
      mode: "normal",
      latest: { text: stepName(latestStep), responsibility: stepResponsibility(latestStep) },
      next: { text: stepName(nextStep), responsibility: stepResponsibility(nextStep) },
      phase: "",
      instruction: "",
      showUpload: false,
      showReupload: false,
      showAcceptReject: false,
      showPoForm: false,
    };
  }

  const phase = pickString(review, ["phase"]);
  const latestText = contractStepLabel(review, workflow, display, latestStep, "latest");
  const nextText = contractStepLabel(review, workflow, display, nextStep, "next");
  const latestResponsibility =
    pickString(latestCompleted, ["responsibility"]) ||
    stepResponsibility(latestStep) ||
    "Company";
  const nextResponsibility =
    pickString(nextWorkflow, ["responsibility"]) ||
    stepResponsibility(nextStep) ||
    (nextText.toLowerCase().includes("facilitator to upload") ? "Facilitator" : "CII");

  return {
    mode: "facilitator_contract",
    latest: { text: latestText, responsibility: latestResponsibility },
    next: { text: nextText, responsibility: nextResponsibility },
    phase,
    instruction: pickString(workflow, ["instruction"]),
    showUpload:
      parseOptionalBool(
        review.can_facilitator_upload_contract ?? review.canFacilitatorUploadContract,
      ) ?? phaseAllowsFacilitatorInitialUpload(phase),
    showReupload: Boolean(
      parseOptionalBool(
        review.can_facilitator_reupload_contract ?? review.canFacilitatorReuploadContract,
      ) ?? phase.includes("rejected_awaiting_facilitator"),
    ),
    showAcceptReject: Boolean(
      review.show_admin_accept_reject_buttons ?? review.showAdminAcceptRejectButtons,
    ),
    showPoForm: Boolean(review.needs_po_amount ?? review.needsPoAmount),
  };
}

function contractDocRoot(contractDocument: Record<string, unknown>): Record<string, unknown> {
  return pickRecord(contractDocument.data) ?? contractDocument;
}

function contractHasUploadedDocument(contract: Record<string, unknown>): boolean {
  const fileUrl = pickString(contract, [
    "document_url",
    "workorderdocument_url",
    "wo_doc_url",
    "file_url",
    "url",
  ]);
  const fileName = pickString(contract, [
    "document_filename",
    "document_name",
    "workorderdocument",
    "wo_doc",
    "file_name",
    "filename",
  ]);
  const hasDocumentFlag = parseOptionalBool(contract.has_document ?? contract.hasDocument);
  if (hasDocumentFlag === true) return true;
  if (hasDocumentFlag === false) return false;
  return Boolean(fileUrl || fileName);
}

function isProposalPhaseText(text: string): boolean {
  return text.trim().toLowerCase().includes("proposal");
}

/** Contract tab / contract phase must not show proposal-milestone labels from generic quickview steps. */
function sanitizeContractStepText(text: string, slot: "latest" | "next"): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (!lower) {
    return slot === "next"
      ? "Facilitator to upload signed contract document"
      : "Company Filled Registration Info";
  }
  if (!isProposalPhaseText(trimmed)) {
    if (
      slot === "next" &&
      (lower.includes("company will upload") ||
        lower.includes("company to upload") ||
        (lower.includes("contract") && lower.includes("company")))
    ) {
      return "Facilitator to upload signed contract document";
    }
    return trimmed;
  }
  if (slot === "next") {
    if (lower.includes("upload") || lower.includes("facilitator")) {
      return "Facilitator to upload signed contract document";
    }
    if (lower.includes("cii") && (lower.includes("accept") || lower.includes("reject") || lower.includes("review"))) {
      return "CII to accept or reject contract document";
    }
    return "Facilitator to upload signed contract document";
  }
  if (lower.includes("upload") && lower.includes("cii")) {
    return "CII uploaded contract document for review";
  }
  return trimmed.replace(/proposal/gi, "contract");
}

function contractStepLabel(
  review: Record<string, unknown>,
  workflow: Record<string, unknown> | undefined,
  display: Record<string, unknown> | undefined,
  step: unknown,
  slot: "latest" | "next",
): string {
  const reviewKeys =
    slot === "latest" ? ["latest_step_label", "latestStepLabel"] : ["next_step_label", "nextStepLabel"];
  const workflowCompleted = pickRecord(workflow?.latest_step_completed);
  const workflowNext = pickRecord(workflow?.next_step);

  const candidates = [
    pickString(review, reviewKeys),
    slot === "latest"
      ? pickString(workflowCompleted, ["activity", "name"])
      : pickString(workflowNext, ["activity", "name"]),
    pickString(display, [slot === "latest" ? "latest" : "next"]),
    stepName(step),
  ].filter((value) => value.trim().length > 0);

  for (const candidate of candidates) {
    if (!isProposalPhaseText(candidate)) {
      return sanitizeContractStepText(candidate, slot);
    }
  }

  return sanitizeContractStepText(candidates[0] ?? "", slot);
}

function normalizeFacilitatorUploadNextText(text: string): string {
  return sanitizeContractStepText(text, "next");
}

/**
 * Facilitator CI flow — drive Latest/Next from contract quickview keys (not companies_activty[0]).
 * Runs before first upload even when facilitator_contract_review is not on quickview yet.
 */
export function contractPhaseToFlowSteps(
  quickView: Record<string, unknown>,
  contractDocument: Record<string, unknown>,
): { latest: FlowStepShape; next: FlowStepShape } | null {
  const data = unwrapQuickviewPayload(quickView);
  const bound = bindContractQuickview(quickView);
  const contract = contractDocRoot(contractDocument);
  const hasDoc = contractHasUploadedDocument(contract);
  const woStatusLabel = pickString(contract, ["wo_status_label", "woStatusLabel"]).toLowerCase();
  const awaitingReview =
    woStatusLabel.includes("pending_review") ||
    woStatusLabel.includes("pending review") ||
    Boolean(contract.awaiting_cii_review);

  if (bound.mode === "facilitator_contract") {
    const phase = bound.phase.toLowerCase();
    let latestStatus = phaseToStatus(phase, "latest");
    let nextStatus = phaseToStatus(phase, "next");

    if (woStatusLabel.includes("pending_review") || phase.includes("pending_cii")) {
      latestStatus = "Completed";
      nextStatus = "Pending";
    }
    if (woStatusLabel.includes("rejected") || phase.includes("rejected")) {
      latestStatus = "Rejected";
      nextStatus = "Pending";
    }
    if (!hasDoc && !awaitingReview) {
      return {
        latest: {
          activity: sanitizeContractStepText(bound.latest.text, "latest") || "Company Filled Registration Info",
          status: "Completed",
          responsibility: bound.latest.responsibility || "Company",
        },
        next: {
          activity: "Facilitator to upload signed contract document",
          status: "Pending",
          responsibility: "Facilitator",
        },
      };
    }

    const latestActivity = sanitizeContractStepText(bound.latest.text, "latest");
    const nextActivity = sanitizeContractStepText(bound.next.text, "next");

    return {
      latest: {
        activity: latestActivity || "—",
        status: latestStatus,
        responsibility: bound.latest.responsibility || "Facilitator",
      },
      next: {
        activity: nextActivity || "—",
        status: nextStatus,
        responsibility: bound.next.responsibility || "CII",
      },
    };
  }

  if (hasDoc) {
    return null;
  }

  const canUpload =
    parseOptionalBool(
      contract.can_facilitator_upload_contract ?? contract.canFacilitatorUploadContract,
    ) ?? true;
  if (canUpload === false || awaitingReview) {
    return null;
  }

  const proposalReview = pickRecord(data.proposal_review);
  if (proposalReview && !pickRecord(data.facilitator_contract_review)) {
    return null;
  }

  const display = pickRecord(data.quickview_display);
  const workflow = pickRecord(data.facilitator_contract_workflow);
  const pseudoReview = pickRecord(data.facilitator_contract_review) ?? {};
  const latestActivity = contractStepLabel(
    pseudoReview,
    workflow,
    display,
    data.latest_step ?? data.latestStep,
    "latest",
  );
  const nextActivity = contractStepLabel(
    pseudoReview,
    workflow,
    display,
    data.next_step ?? data.nextStep,
    "next",
  );

  return {
    latest: {
      activity: latestActivity,
      status: "Completed",
      responsibility: stepResponsibility(data.latest_step ?? data.latestStep) || "Company",
    },
    next: {
      activity: nextActivity,
      status: "Pending",
      responsibility: "Facilitator",
    },
  };
}

export function facilitatorShouldUploadContract(
  quickView: Record<string, unknown>,
  contractDocument: Record<string, unknown>,
): boolean {
  const flow = contractPhaseToFlowSteps(quickView, contractDocument);
  if (!flow) return false;
  return (
    flow.next.responsibility.toLowerCase().includes("facilitator") &&
    !contractHasUploadedDocument(contractDocRoot(contractDocument))
  );
}

export function isFacilitatorContractPhaseActive(quickView: Record<string, unknown>): boolean {
  const data = unwrapQuickviewPayload(quickView);
  return Boolean(pickRecord(data.facilitator_contract_review));
}
