import assert from "node:assert/strict";
import test from "node:test";

import {
  HUMAN_DISPOSITIONS,
  WORKFLOW_COPY,
  WORKFLOW_STATES,
  assertHumanDisposition,
  assertWorkflowState,
  deriveWorkflowState,
  workflowExplanation,
} from "../lib/domain/workflow-state.mjs";
import { matchEntity, normalizeName, relatedMatch } from "../lib/domain/entity-matching.mjs";

for (const state of WORKFLOW_STATES) {
  test(`workflow state ${state} is accepted`, () => assert.equal(assertWorkflowState(state), state));
}

for (const value of ["", "BLUE", "green", null, undefined, 1]) {
  test(`workflow state ${String(value)} is rejected`, () => {
    assert.throws(() => assertWorkflowState(value), /Unsupported workflow state/);
  });
}

for (const disposition of HUMAN_DISPOSITIONS) {
  test(`human disposition ${disposition} is accepted`, () => {
    assert.equal(assertHumanDisposition(disposition), disposition);
  });
}

for (const value of ["", "APPROVED", "no_conflict", null, undefined, 7]) {
  test(`human disposition ${String(value)} is rejected`, () => {
    assert.throws(() => assertHumanDisposition(value), /Unsupported human disposition/);
  });
}

const workflowCases = [
  ["default is yellow because professional review is unrecorded", {}, "YELLOW"],
  ["an explicit hold is red", { explicitHold: true, humanDisposition: "CLEARED" }, "RED"],
  ["one unmet mandatory requirement is red", { mandatoryRequirements: [{ satisfied: false }], humanDisposition: "CLEARED" }, "RED"],
  ["an unmet requirement takes precedence over unresolved findings", { mandatoryRequirements: [{ satisfied: false }], unresolvedFindings: 2 }, "RED"],
  ["all satisfied mandatory requirements permit green", { mandatoryRequirements: [{ satisfied: true }, { satisfied: true }], humanDisposition: "CLEARED" }, "GREEN"],
  ["one unresolved finding is yellow", { unresolvedFindings: 1, humanDisposition: "CLEARED" }, "YELLOW"],
  ["many unresolved findings remain yellow", { unresolvedFindings: 99, humanDisposition: "CLEARED" }, "YELLOW"],
  ["outside information is yellow", { outsideInformationNeeded: true, humanDisposition: "CLEARED" }, "YELLOW"],
  ["changed evidence is yellow", { evidenceChanged: true, humanDisposition: "CLEARED" }, "YELLOW"],
  ["unreviewed is yellow", { humanDisposition: "UNREVIEWED" }, "YELLOW"],
  ["consent required is yellow", { humanDisposition: "CONSENT_REQUIRED" }, "YELLOW"],
  ["screen required is yellow", { humanDisposition: "SCREEN_REQUIRED" }, "YELLOW"],
  ["nonconsentable conflict is red", { humanDisposition: "CONFLICT_NONCONSENTABLE" }, "RED"],
  ["decline is red", { humanDisposition: "DECLINE" }, "RED"],
  ["withdraw is red", { humanDisposition: "WITHDRAW" }, "RED"],
  ["no conflict may be green", { humanDisposition: "NO_CONFLICT" }, "GREEN"],
  ["consentable conflict may be green after resolution", { humanDisposition: "CONFLICT_CONSENTABLE" }, "GREEN"],
  ["cleared may be green", { humanDisposition: "CLEARED" }, "GREEN"],
  ["other disposition may be green after human resolution", { humanDisposition: "OTHER" }, "GREEN"],
  ["a zero finding count is not independently yellow", { unresolvedFindings: 0, humanDisposition: "CLEARED" }, "GREEN"],
];

for (const [name, input, expected] of workflowCases) {
  test(`workflow derivation: ${name}`, () => assert.equal(deriveWorkflowState(input), expected));
}

test("workflow derivation rejects an unsupported disposition before deriving state", () => {
  assert.throws(() => deriveWorkflowState({ explicitHold: true, humanDisposition: "APPROVED" }), /Unsupported human disposition/);
});

for (const state of WORKFLOW_STATES) {
  test(`workflow explanation uses approved ${state} copy`, () => {
    assert.deepEqual(workflowExplanation(state, ["First", "", null, "Second"]), {
      state,
      summary: WORKFLOW_COPY[state],
      reasons: ["First", "Second"],
    });
  });
}

const normalizationCases = [
  ["empty input", "", ""],
  ["null input", null, ""],
  ["diacritics", "Société Générale", "societe generale"],
  ["ampersand", "Basu & Howard", "basu and howard"],
  ["punctuation", "James P. Howard, II", "james p howard ii"],
  ["whitespace", "  Northstar   Advisory  ", "northstar advisory"],
  ["corporate suffix", "Acme Corporation", "acme"],
  ["multiple corporate suffixes", "Acme Holdings Company LLC", "acme holdings"],
  ["single suffix token remains meaningful", "AG", "ag"],
  ["numbers", "Studio 54, Inc.", "studio 54"],
];

for (const [name, value, expected] of normalizationCases) {
  test(`name normalization: ${name}`, () => assert.equal(normalizeName(value), expected));
}

for (const suffix of ["co", "company", "corp", "corporation", "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "plc", "pc", "pa", "gmbh", "sa", "ag"]) {
  test(`name normalization removes the terminal ${suffix} suffix`, () => {
    assert.equal(normalizeName(`Interlocks ${suffix}`), "interlocks");
  });
}

const matchingCases = [
  ["exact canonical spelling", "Meridian Analytics", { canonicalName: "Meridian Analytics" }, "EXACT", ["Exact canonical name"]],
  ["case-insensitive canonical spelling", "MERIDIAN ANALYTICS", { canonicalName: "Meridian Analytics" }, "EXACT", ["Exact canonical name"]],
  ["exact alias", "Meridian AI", { canonicalName: "Meridian Analytics", aliases: ["Meridian AI"] }, "EXACT", ["Exact alias: Meridian AI"]],
  ["case-insensitive exact alias", "MERIDIAN AI", { canonicalName: "Meridian Analytics", aliases: ["Meridian AI"] }, "EXACT", ["Exact alias: Meridian AI"]],
  ["normalized canonical", "Acme", { canonicalName: "Acme Corporation" }, "POSSIBLE", ["Canonical name matches after punctuation and suffix normalization"]],
  ["normalized alias", "Acme", { canonicalName: "Other", aliases: ["Acme, Inc."] }, "POSSIBLE", ["Alias matches after normalization: Acme, Inc."]],
  ["compatible full human name", "Robert James Smith", { canonicalName: "Robert James Smith" }, "EXACT", ["Exact canonical name"]],
  ["compatible middle initial", "Robert J. Smith", { canonicalName: "Robert James Smith" }, "POSSIBLE", ["Compatible given name, surname, and middle initial"]],
  ["omitted middle name", "Robert Smith", { canonicalName: "Robert James Smith" }, "POSSIBLE", ["Compatible given name, surname, and middle initial"]],
  ["exact identifier", { name: "Different Name", identifiers: ["EIN-123"] }, { canonicalName: "Acme", identifiers: ["EIN-123"] }, "EXACT", ["Exact identifier"]],
  ["normalized address", { name: "Different Name", addresses: ["123 Main St."] }, { canonicalName: "Acme", addresses: ["123 Main St"] }, "POSSIBLE", ["Same address"]],
  ["multiple independent reasons", { name: "Robert J. Smith", addresses: ["123 Main St"] }, { canonicalName: "Robert James Smith", addresses: ["123 Main St."] }, "STRONG", ["Compatible given name, surname, and middle initial", "Same address"]],
  ["identifier plus address remains exact", { name: "Different", identifiers: ["ID-7"], addresses: ["1 High St"] }, { canonicalName: "Other", identifiers: ["ID-7"], addresses: ["1 High St"] }, "EXACT", ["Exact identifier", "Same address"]],
];

for (const [name, search, candidate, confidence, reasons] of matchingCases) {
  test(`entity matching: ${name}`, () => {
    assert.deepEqual(matchEntity(search, candidate), { confidence, reasons });
  });
}

for (const [name, search, candidate] of [
  ["unrelated organizations", "Northstar", { canonicalName: "Meridian" }],
  ["different surnames", "Robert Smith", { canonicalName: "Robert Jones" }],
  ["different given names", "Robert Smith", { canonicalName: "Roger Smith" }],
  ["different middle initials", "Robert J. Smith", { canonicalName: "Robert K. Smith" }],
  ["single-token names do not use human-name compatibility", "Rob", { canonicalName: "Rob Smith" }],
]) {
  test(`entity matching rejects ${name}`, () => assert.equal(matchEntity(search, candidate), null));
}

test("related matches identify the relationship and direction", () => {
  assert.deepEqual(relatedMatch({ type: "SUBSIDIARY_OF", fromName: "Acme", toName: "ParentCo" }), {
    confidence: "RELATED",
    reasons: ["SUBSIDIARY_OF: Acme → ParentCo"],
  });
});

test("related matches fall back to a human-readable relationship type", () => {
  assert.deepEqual(relatedMatch({ fromName: "A", toName: "B" }).reasons, ["Related entity: A → B"]);
});
