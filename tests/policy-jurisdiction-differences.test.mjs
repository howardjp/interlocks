import assert from "node:assert/strict";
import test from "node:test";

import { LEGAL_CONFLICT_FACT_DEFINITIONS, validateLegalConflictContext } from "../lib/policy/legal-conflicts-schema.mjs";
import {
  ABA_MODEL_PACK,
  DC_PACK,
  DELAWARE_CHANCERY_PACK,
  DELAWARE_PACK,
  LEGAL_POLICY_PACKS,
  MARYLAND_PACK,
  VIRGINIA_PACK,
} from "../lib/policy/legal-policy-packs.mjs";
import { evaluatePolicyPack } from "../lib/policy/policy-engine.mjs";

const result = (pack, ruleId, facts) => evaluatePolicyPack(pack, facts, { evaluatedAt:"2026-08-28T12:00:00.000Z" }).results.find((item) => item.ruleId === ruleId);

function pathsIn(expression) {
  if (expression.predicate) return [expression.predicate.path];
  if (expression.not) return pathsIn(expression.not);
  if (expression.exists) return pathsIn(expression.exists.where);
  return [...(expression.all || expression.any || [])].flatMap(pathsIn);
}

test("the installed corpus is confined to conflict clearance", () => {
  assert.deepEqual(LEGAL_POLICY_PACKS.map((pack) => pack.coverageScope), Array(LEGAL_POLICY_PACKS.length).fill("CONFLICT_CLEARANCE_ONLY"));
  assert.ok(LEGAL_POLICY_PACKS.every((pack) => pack.validationStatus === "NOT_SUBSTANTIVELY_VALIDATED"));
  assert.ok(LEGAL_POLICY_PACKS.flatMap((pack) => pack.rules).every((rule) => rule.scope === "CONFLICT_CLEARANCE"));
});

test("the first-wave corpus contains each selected authority exactly once", () => {
  assert.deepEqual(LEGAL_POLICY_PACKS.map((pack) => pack.id), ["aba-model", "maryland", "virginia", "district-of-columbia", "delaware", "delaware-chancery"]);
  assert.equal(new Set(LEGAL_POLICY_PACKS.map((pack) => pack.contentHash)).size, LEGAL_POLICY_PACKS.length);
});

for (const pack of LEGAL_POLICY_PACKS) {
  test(`${pack.id} carries source, version, scope, and review metadata`, () => {
    assert.match(pack.sourceUrl, /^https:\/\//);
    assert.match(pack.version, /^2026\.08-conflicts-prototype$/);
    assert.equal(pack.status, "PROTOTYPE_REVIEW_REQUIRED");
    assert.equal(pack.coverageScope, "CONFLICT_CLEARANCE_ONLY");
    assert.equal(pack.validationStatus, "NOT_SUBSTANTIVELY_VALIDATED");
    assert.match(pack.contentHash, /^[a-f0-9]{64}$/);
  });

  for (const rule of pack.rules) {
    test(`${pack.id} ${rule.id} uses declared typed facts only`, () => {
      const declared = new Set(pack.factDefinitions.map((definition) => definition.id));
      for (const path of pathsIn(rule.condition)) assert.ok(declared.has(path), `${rule.id} uses undeclared fact ${path}`);
      for (const question of rule.unknownQuestions || []) assert.ok(declared.has(question.fact), `${rule.id} asks undeclared fact ${question.fact}`);
      assert.equal(rule.scope, "CONFLICT_CLEARANCE");
      assert.ok(rule.topic);
      assert.ok(rule.phase);
      assert.ok(["REVIEW", "BLOCKING"].includes(rule.severity));
    });
  }
}

for (const definition of LEGAL_CONFLICT_FACT_DEFINITIONS) {
  const valid = definition.type === "BOOLEAN" ? true : definition.type === "ENUM" ? definition.options[0].value : definition.type === "NUMBER" ? 1 : "recorded value";
  const invalid = definition.type === "BOOLEAN" ? "yes" : definition.type === "ENUM" ? "NOT_A_DECLARED_OPTION" : definition.type === "NUMBER" ? Number.NaN : 17;

  test(`typed fact ${definition.id} accepts its declared ${definition.type.toLowerCase()} value`, () => {
    assert.deepEqual(validateLegalConflictContext({ [definition.id]:valid }), { [definition.id]:valid });
  });

  test(`typed fact ${definition.id} rejects an invalid ${definition.type.toLowerCase()} value`, () => {
    assert.throws(() => validateLegalConflictContext({ [definition.id]:invalid }));
  });
}

test("ABA remains a model baseline and is not mislabeled as controlling law", () => {
  assert.equal(ABA_MODEL_PACK.authorityType, "MODEL");
  assert.match(ABA_MODEL_PACK.description, /not controlling law/i);
});

test("Maryland uses the Maryland codification in every citation", () => {
  assert.ok(MARYLAND_PACK.rules.every((rule) => rule.citation.startsWith("Maryland Rule 19-30") || rule.citation.startsWith("Maryland Rule Rules")));
});

test("Virginia consent requires consultation and a written memorialization", () => {
  const ruleId = "va.1.7.client-consent";
  assert.equal(result(VIRGINIA_PACK, ruleId, { currentClientAdversity:true, clientConsentAfterConsultation:true, consentMemorializedInWriting:false }).outcome, "MATCHED");
  assert.equal(result(VIRGINIA_PACK, ruleId, { currentClientAdversity:true, clientConsentAfterConsultation:true, consentMemorializedInWriting:true }).outcome, "NOT_MATCHED");
});

test("Virginia does not present a private lateral screen as a standalone cure", () => {
  assert.ok(VIRGINIA_PACK.rules.some((rule) => rule.id === "va.1.10.lateral-consent"));
  assert.ok(!VIRGINIA_PACK.rules.some((rule) => rule.id === "va.1.10.lateral-screen"));
});

test("Virginia preserves its related-opposing-lawyers rule and paragraph numbering", () => {
  const rule = VIRGINIA_PACK.rules.find((item) => item.id === "va.1.8.related-opposing-lawyers");
  assert.equal(rule.citation, "Virginia Rule 1.8(i)");
  assert.equal(result(VIRGINIA_PACK, rule.id, { relatedOpposingLawyers:true, relationshipConflictClientConsent:false }).outcome, "MATCHED");
});

test("D.C. same-matter adverse positions remain an absolute Rule 1.7(a) signal", () => {
  const ruleId = "dc.1.7.same-proceeding-claims";
  assert.equal(result(DC_PACK, ruleId, { currentClientAdversity:true, sameProceedingAdverseClients:true, clientConsentAfterFullDisclosure:true }).outcome, "MATCHED");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === ruleId).citation, "D.C. Rule 1.7(a)");
});

test("D.C. conditional adversity follows its Rule 1.7(b) and (c) structure", () => {
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.7.current-client-adversity").citation, "D.C. Rule 1.7(b)(1)");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.7.material-limitation").citation, "D.C. Rule 1.7(b)(2)–(4)");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.7.competent-diligent-belief").citation, "D.C. Rule 1.7(c)(2)");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.7.client-consent").citation, "D.C. Rule 1.7(c)(1)");
  assert.ok(!DC_PACK.rules.some((rule) => rule.id === "dc.1.7.prohibited-by-law"));
});

test("D.C. prospective malpractice limitations remain prohibited even with separate counsel", () => {
  const ruleId = "dc.1.8.h1-malpractice-limitation";
  assert.equal(result(DC_PACK, ruleId, { prospectiveMalpracticeLimitation:true, clientIndependentlyRepresented:true }).outcome, "MATCHED");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === ruleId).citation, "D.C. Rule 1.8(g)(1)");
});

test("D.C. models its file-lien exception instead of importing the ABA proprietary-interest rule", () => {
  const ruleId = "dc.1.8.i-file-lien";
  assert.ok(!DC_PACK.rules.some((rule) => rule.id === "dc.1.8.i-proprietary-interest"));
  assert.equal(result(DC_PACK, ruleId, { clientFileLien:true, retainedFileIsLawyerWorkProduct:true, retainedWorkProductUnpaid:true, clientCanPayRetainedWorkProduct:false, retentionNoIrreparableHarmRisk:true }).outcome, "MATCHED");
  assert.equal(result(DC_PACK, ruleId, { clientFileLien:true, retainedFileIsLawyerWorkProduct:true, retainedWorkProductUnpaid:true, clientCanPayRetainedWorkProduct:true, retentionNoIrreparableHarmRisk:true }).outcome, "NOT_MATCHED");
});

test("D.C. preserves related-lawyer and imputation paragraph differences", () => {
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.8.related-opposing-lawyers").citation, "D.C. Rule 1.8(h)");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.8.imputation").citation, "D.C. Rule 1.8(j)");
  assert.ok(!DC_PACK.rules.some((rule) => rule.id === "dc.1.8.j-sexual-relationship"));
});

test("D.C. private lateral screening captures notice content and confidential notice filing", () => {
  const screen = result(DC_PACK, "dc.1.10.lateral-screen", { lateralFormerFirmConflict:true, timelyScreenImplemented:true, screenedLawyerNoMatterFee:true, requiredWrittenNoticeProvided:true, dcLateralNoticeDescribesScreenAndCompliance:false });
  const confidential = result(DC_PACK, "dc.1.10.confidential-lateral-notice", { formerClientRequestedConfidentialNotice:true, sealedNoticePreparedForDisciplinaryCounsel:false });
  assert.equal(screen.outcome, "MATCHED");
  assert.equal(confidential.outcome, "MATCHED");
  assert.equal(DC_PACK.rules.find((rule) => rule.id === "dc.1.10.confidential-lateral-notice").citation, "D.C. Rule 1.10(f)");
});

test("D.C. prospective-client screening does not import ABA fee, notice, or limited-exposure prerequisites", () => {
  const dc = DC_PACK.rules.find((rule) => rule.id === "dc.1.18.prospective-client-screen");
  const aba = ABA_MODEL_PACK.rules.find((rule) => rule.id === "aba.1.18.prospective-client-screen");
  assert.deepEqual(new Set(dc.unknownQuestions.map((item) => item.fact)), new Set(["timelyScreenImplemented"]));
  assert.ok(new Set(aba.unknownQuestions.map((item) => item.fact)).isSupersetOf(new Set(["reasonableMeasuresLimitedExposure", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"])));
});

test("Delaware remains an independent licensing pack while Chancery remains a tribunal overlay", () => {
  assert.equal(DELAWARE_PACK.authorityType, "LICENSING_JURISDICTION");
  assert.equal(DELAWARE_CHANCERY_PACK.authorityType, "TRIBUNAL");
  assert.equal(DELAWARE_CHANCERY_PACK.rules.length, 3);
  assert.ok(DELAWARE_CHANCERY_PACK.rules.every((rule) => rule.citation === "Delaware Court of Chancery Rule 170"));
});

test("Chancery outside counsel requires both active admission and the Delaware undertaking", () => {
  const facts = { outsideCounselPresent:true, proHacViceStatus:"ACTIVE", outsideCounselDelawareUndertaking:false };
  assert.equal(result(DELAWARE_CHANCERY_PACK, "de-chancery.170.pro-hac-vice", facts).outcome, "NOT_MATCHED");
  assert.equal(result(DELAWARE_CHANCERY_PACK, "de-chancery.170.delaware-undertaking", facts).outcome, "MATCHED");
});
