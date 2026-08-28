import assert from "node:assert/strict";
import test from "node:test";

import { deriveWorkflowState, WORKFLOW_COPY } from "../lib/domain/workflow-state.mjs";
import { matchEntity, normalizeName } from "../lib/domain/entity-matching.mjs";

test("workflow state describes required action, not legal probability", () => {
  assert.equal(deriveWorkflowState({ unresolvedFindings: 1 }), "YELLOW");
  assert.equal(deriveWorkflowState({ outsideInformationNeeded: true }), "YELLOW");
  assert.equal(deriveWorkflowState({ explicitHold: true }), "RED");
  assert.equal(deriveWorkflowState({ mandatoryRequirements: [{ satisfied: false }] }), "RED");
  assert.equal(deriveWorkflowState({ humanDisposition: "NO_CONFLICT" }), "GREEN");
  assert.equal(WORKFLOW_COPY.GREEN, "No unresolved issue surfaced.");
});

test("a waiver or screen requirement does not automatically clear a case", () => {
  assert.equal(deriveWorkflowState({ humanDisposition: "CONSENT_REQUIRED" }), "YELLOW");
  assert.equal(deriveWorkflowState({ humanDisposition: "SCREEN_REQUIRED" }), "YELLOW");
  assert.equal(deriveWorkflowState({
    humanDisposition: "CLEARED",
    mandatoryRequirements: [{ name: "signed writing", satisfied: false }],
  }), "RED");
});

test("entity matching is deterministic and explains its candidates", () => {
  assert.equal(normalizeName("Acme Corp."), "acme");
  assert.deepEqual(matchEntity("ACME", { canonicalName: "Acme Corporation" }), {
    confidence: "POSSIBLE",
    reasons: ["Canonical name matches after punctuation and suffix normalization"],
  });
  assert.deepEqual(matchEntity("Robert J. Smith", {
    canonicalName: "Robert James Smith",
    aliases: [], identifiers: [], addresses: [],
  }), {
    confidence: "POSSIBLE",
    reasons: ["Compatible given name, surname, and middle initial"],
  });
  assert.deepEqual(matchEntity({ name: "Robert J. Smith", addresses: ["123 Main St"] }, {
    canonicalName: "Robert James Smith", aliases: [], identifiers: [], addresses: ["123 Main St."],
  }), {
    confidence: "STRONG",
    reasons: ["Compatible given name, surname, and middle initial", "Same address"],
  });
});
