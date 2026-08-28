import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORITY_STATUSES, compilePolicyPack, evaluatePolicyPack, POLICY_DSL_VERSION,
  POLICY_ENGINE_VERSION, policyContentHash, stableStringify,
} from "../lib/policy/policy-engine.mjs";
import { ABA_MODEL_PACK, DC_PACK, DELAWARE_CHANCERY_PACK, LEGAL_POLICY_PACKS, getLegalPolicyPack } from "../lib/policy/legal-policy-packs.mjs";

function minimalPack(overrides = {}) {
  return {
    dslVersion: POLICY_DSL_VERSION, id: "test", title: "Test", version: "1", effectiveFrom: "2026-01-01",
    authorityType: "MODEL", publisher: "Test", sourceUrl: "https://example.test/rules",
    rules: [{ id:"test.rule", title:"Test rule", summary:"Test summary", citation:"Test 1", sourceUrl:"https://example.test/rule-1", condition:{ predicate:{ path:"flag", operator:"equals", value:true } }, finding:{ code:"TEST", message:"Review" } }],
    ...overrides,
  };
}

test("policy serialization is canonical across object key order", () => {
  assert.equal(stableStringify({ b:2,a:{d:4,c:3} }), stableStringify({ a:{c:3,d:4},b:2 }));
  assert.equal(policyContentHash({ b:2,a:1 }), policyContentHash({ a:1,b:2 }));
});

test("compiled packs receive a deterministic content hash", () => {
  assert.equal(compilePolicyPack(minimalPack()).contentHash, compilePolicyPack(minimalPack()).contentHash);
});

for (const field of ["id","title","version","effectiveFrom","authorityType","publisher","sourceUrl"]) {
  test(`pack compilation rejects missing ${field}`, () => {
    const candidate = minimalPack(); delete candidate[field];
    assert.throws(() => compilePolicyPack(candidate), new RegExp(`${field} is required`));
  });
}

test("pack compilation rejects unsupported DSL versions", () => assert.throws(() => compilePolicyPack(minimalPack({ dslVersion:"future" })), /Unsupported policy DSL version/));
test("pack compilation rejects empty rule sets", () => assert.throws(() => compilePolicyPack(minimalPack({ rules:[] })), /must contain rules/));
test("pack compilation rejects duplicate rule ids", () => { const rule=minimalPack().rules[0]; assert.throws(() => compilePolicyPack(minimalPack({ rules:[rule,structuredClone(rule)] })), /Duplicate/); });
test("pack compilation rejects predicates without paths", () => { const candidate=minimalPack(); delete candidate.rules[0].condition.predicate.path; assert.throws(() => compilePolicyPack(candidate), /path is required/); });
test("pack compilation rejects unknown operators", () => { const candidate=minimalPack(); candidate.rules[0].condition.predicate.operator="exec"; assert.throws(() => compilePolicyPack(candidate), /Unsupported policy operator/); });
test("pack compilation rejects ambiguous expressions", () => { const candidate=minimalPack(); candidate.rules[0].condition.any=[]; assert.throws(() => compilePolicyPack(candidate), /exactly one/); });
test("pack compilation rejects empty all expressions", () => { const candidate=minimalPack(); candidate.rules[0].condition={all:[]}; assert.throws(() => compilePolicyPack(candidate), /cannot be empty/); });
test("pack compilation validates typed fact definitions", () => {
  assert.throws(() => compilePolicyPack(minimalPack({ factDefinitions:[{ id:"answer",type:"MAGIC",label:"Answer",group:"Test" }] })), /Unsupported policy fact type/);
  assert.throws(() => compilePolicyPack(minimalPack({ factDefinitions:[{ id:"answer",type:"ENUM",label:"Answer",group:"Test",options:[] }] })), /requires options/);
});

test("a true predicate matches", () => {
  const result=evaluatePolicyPack(minimalPack(),{flag:true},{evaluatedAt:"2026-01-01T00:00:00Z"});
  assert.equal(result.results[0].outcome,"MATCHED"); assert.equal(result.results[0].finding.code,"TEST"); assert.equal(result.engineVersion,POLICY_ENGINE_VERSION);
});
test("a false predicate does not match and emits no finding", () => { const result=evaluatePolicyPack(minimalPack(),{flag:false}); assert.equal(result.results[0].outcome,"NOT_MATCHED"); assert.equal(result.results[0].finding,null); });
test("a missing predicate is indeterminate", () => { const result=evaluatePolicyPack(minimalPack(),{}); assert.equal(result.results[0].outcome,"INDETERMINATE"); assert.deepEqual(result.results[0].missingFacts,["flag"]); });
test("an explicitly optional missing trigger is not matched", () => { const candidate=minimalPack(); candidate.rules[0].condition.predicate.onMissing="NOT_MATCHED"; assert.equal(evaluatePolicyPack(candidate,{}).results[0].outcome,"NOT_MATCHED"); });

const operatorCases = [
  ["equals","x","x","MATCHED"],["not_equals","x","y","MATCHED"],["in","x",["x","y"],"MATCHED"],
  ["not_in","z",["x","y"],"MATCHED"],["includes",["x","y"],"y","MATCHED"],["intersects",["a","b"],["b","c"],"MATCHED"],
  ["greater_than",3,2,"MATCHED"],["at_least",2,2,"MATCHED"],["exists","present",undefined,"MATCHED"],
];
for (const [operator,actual,expected,outcome] of operatorCases) test(`operator ${operator} evaluates deterministically`, () => {
  const candidate=minimalPack(); candidate.rules[0].condition={predicate:{path:"value",operator,...(operator==="exists"?{}:{value:expected})}};
  assert.equal(evaluatePolicyPack(candidate,{value:actual}).results[0].outcome,outcome);
});

test("all short-circuits semantically to not matched before indeterminate", () => {
  const candidate=minimalPack(); candidate.rules[0].condition={all:[{predicate:{path:"missing",operator:"equals",value:true}},{predicate:{path:"flag",operator:"equals",value:true}}]};
  assert.equal(evaluatePolicyPack(candidate,{flag:false}).results[0].outcome,"NOT_MATCHED");
});
test("any returns matched when another branch is indeterminate", () => {
  const candidate=minimalPack(); candidate.rules[0].condition={any:[{predicate:{path:"missing",operator:"equals",value:true}},{predicate:{path:"flag",operator:"equals",value:true}}]};
  assert.equal(evaluatePolicyPack(candidate,{flag:true}).results[0].outcome,"MATCHED");
});
test("not preserves indeterminate", () => { const candidate=minimalPack(); candidate.rules[0].condition={not:{predicate:{path:"missing",operator:"equals",value:true}}}; assert.equal(evaluatePolicyPack(candidate,{}).results[0].outcome,"INDETERMINATE"); });

test("exists reports matching row indexes and bounded traces", () => {
  const candidate=minimalPack(); candidate.rules[0].condition={exists:{collection:"rows",where:{predicate:{path:"kind",operator:"equals",value:"TARGET"}}}};
  const result=evaluatePolicyPack(candidate,{rows:[{kind:"OTHER"},{kind:"TARGET"}]});
  assert.equal(result.results[0].outcome,"MATCHED"); assert.deepEqual(result.results[0].trace.matchedIndexes,[1]);
});
test("exists over an empty collection is not matched", () => { const candidate=minimalPack(); candidate.rules[0].condition={exists:{collection:"rows",where:{predicate:{path:"kind",operator:"exists"}}}}; assert.equal(evaluatePolicyPack(candidate,{rows:[]}).results[0].outcome,"NOT_MATCHED"); });
test("exists over a missing collection is indeterminate", () => { const candidate=minimalPack(); candidate.rules[0].condition={exists:{collection:"rows",where:{predicate:{path:"kind",operator:"exists"}}}}; assert.equal(evaluatePolicyPack(candidate,{}).results[0].outcome,"INDETERMINATE"); });
test("exists rejects non-array collections", () => { const candidate=minimalPack(); candidate.rules[0].condition={exists:{collection:"rows",where:{predicate:{path:"kind",operator:"exists"}}}}; assert.throws(()=>evaluatePolicyPack(candidate,{rows:{}}),/not an array/); });

for (const status of AUTHORITY_STATUSES) test(`evaluation accepts authority status ${status}`, () => assert.equal(evaluatePolicyPack(minimalPack(),{flag:true},{authorityStatus:status}).authorityStatus,status));
test("evaluation rejects unsupported authority status", () => assert.throws(()=>evaluatePolicyPack(minimalPack(),{flag:true},{authorityStatus:"DEFAULT"}),/Unsupported authority status/));
test("evaluation rejects an operator smuggled past compilation", () => {
  const candidate=minimalPack(); candidate.contentHash="precompiled"; candidate.rules[0].condition.predicate.operator="exec";
  assert.throws(()=>evaluatePolicyPack(candidate,{flag:true}),/Unsupported policy operator/);
});
test("evaluation rejects an expression smuggled past compilation", () => {
  const candidate=minimalPack(); candidate.contentHash="precompiled"; candidate.rules[0].condition={};
  assert.throws(()=>evaluatePolicyPack(candidate,{flag:true}),/Unsupported policy expression/);
});

test("all first-wave packs compile independently with unique hashes", () => {
  assert.equal(LEGAL_POLICY_PACKS.length,6); assert.equal(new Set(LEGAL_POLICY_PACKS.map((item)=>item.id)).size,6); assert.equal(new Set(LEGAL_POLICY_PACKS.map((item)=>item.contentHash)).size,6);
});
test("ABA remains a model baseline rather than controlling law", () => { assert.equal(ABA_MODEL_PACK.authorityType,"MODEL"); assert.match(ABA_MODEL_PACK.description,/not controlling/i); });
test("D.C. records its distinct same-matter structure", () => { assert.match(DC_PACK.rules[0].comparisonNote,/same-matter/i); assert.equal(DC_PACK.effectiveFrom,"2025-09-15"); });
test("Chancery is a tribunal overlay rather than a licensing pack", () => { assert.equal(DELAWARE_CHANCERY_PACK.authorityType,"TRIBUNAL"); assert.match(DELAWARE_CHANCERY_PACK.description,/alongside/i); });
test("Chancery asks rather than guesses when Delaware counsel is unknown", () => {
  const result=evaluatePolicyPack(DELAWARE_CHANCERY_PACK,{tribunal:"DELAWARE_CHANCERY",outsideCounselPresent:false});
  assert.equal(result.results[0].outcome,"INDETERMINATE"); assert.equal(result.results[0].unknownQuestions[0].fact,"delawareCounselConfirmed");
});
test("pack lookup is exact and rejects unknown packs", () => { assert.equal(getLegalPolicyPack("aba-model").id,"aba-model"); assert.throws(()=>getLegalPolicyPack("nope"),/Unknown legal policy pack/); });
test("model rules surface a material-limitation indicator without making a legal conclusion", () => {
  const result=evaluatePolicyPack(ABA_MODEL_PACK,{materialLimitationRisk:true}); const rule=result.results.find((item)=>item.ruleId==="aba.1.7.material-limitation");
  assert.equal(rule.outcome,"MATCHED"); assert.match(rule.finding.message,/may materially limit/i); assert.doesNotMatch(rule.finding.message,/conflict exists/i);
});
