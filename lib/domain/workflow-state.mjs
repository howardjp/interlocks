export const WORKFLOW_STATES = Object.freeze(["GREEN", "YELLOW", "RED"]);

export const HUMAN_DISPOSITIONS = Object.freeze([
  "UNREVIEWED",
  "NO_CONFLICT",
  "CONFLICT_CONSENTABLE",
  "CONFLICT_NONCONSENTABLE",
  "CONSENT_REQUIRED",
  "SCREEN_REQUIRED",
  "CLEARED",
  "DECLINE",
  "WITHDRAW",
  "OTHER",
]);

export const WORKFLOW_COPY = Object.freeze({
  GREEN: "No unresolved issue surfaced.",
  YELLOW: "Human review or additional information is required.",
  RED: "Do not proceed until the identified requirement is resolved.",
});

export function assertWorkflowState(value) {
  if (!WORKFLOW_STATES.includes(value)) throw new Error("Unsupported workflow state");
  return value;
}

export function assertHumanDisposition(value) {
  if (!HUMAN_DISPOSITIONS.includes(value)) throw new Error("Unsupported human disposition");
  return value;
}

/**
 * Derives an action state, never a legal conclusion. RED is limited to an
 * explicit hold or an unmet mandatory action. Interesting machine findings
 * remain YELLOW until an authorized human resolves them.
 */
export function deriveWorkflowState({
  explicitHold = false,
  mandatoryRequirements = [],
  unresolvedFindings = 0,
  outsideInformationNeeded = false,
  evidenceChanged = false,
  humanDisposition = "UNREVIEWED",
} = {}) {
  assertHumanDisposition(humanDisposition);
  if (explicitHold || mandatoryRequirements.some((item) => !item.satisfied)) return "RED";
  if (
    unresolvedFindings > 0 ||
    outsideInformationNeeded ||
    evidenceChanged ||
    humanDisposition === "UNREVIEWED" ||
    ["CONSENT_REQUIRED", "SCREEN_REQUIRED"].includes(humanDisposition)
  ) return "YELLOW";
  if (["CONFLICT_NONCONSENTABLE", "DECLINE", "WITHDRAW"].includes(humanDisposition)) return "RED";
  return "GREEN";
}

export function workflowExplanation(state, reasons = []) {
  assertWorkflowState(state);
  return { state, summary: WORKFLOW_COPY[state], reasons: reasons.filter(Boolean) };
}
