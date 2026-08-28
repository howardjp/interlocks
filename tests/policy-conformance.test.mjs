import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORITY_STATUSES, evaluatePolicyPack, policyContentHash } from "../lib/policy/policy-engine.mjs";
import { LEGAL_POLICY_CONFORMANCE_FIXTURES, LEGAL_POLICY_PACKS } from "../lib/policy/legal-policy-packs.mjs";

const MUTATIONS = 20;
const evaluatedAt = "2026-08-28T12:00:00.000Z";

function mutateFacts(fixture, mutation) {
  const entries = Object.entries(structuredClone(fixture));
  if (mutation % 2) entries.reverse();
  const facts = Object.fromEntries(entries);
  facts.indicators = Array.from({ length:mutation % 5 }, (_, index) => ({ type:`IRRELEVANT_${mutation}_${index}`, evidenceId:`noise-${index}`, detail:{ retained:Boolean(index % 2), order:mutation - index } }));
  facts.conformanceNoise = { mutation, parity:mutation % 2, nested:{ stable:true, values:[mutation, mutation + 1] } };
  return facts;
}

test("every installed rule has an explicit conformance fixture", () => {
  for (const pack of LEGAL_POLICY_PACKS) {
    const fixtures = LEGAL_POLICY_CONFORMANCE_FIXTURES[pack.id];
    assert.ok(fixtures, `missing fixture set for ${pack.id}`);
    assert.deepEqual(new Set(Object.keys(fixtures)), new Set(pack.rules.map((rule) => rule.id)));
    for (const rule of pack.rules) {
      assert.ok(fixtures[rule.id].matched);
      assert.ok(fixtures[rule.id].notMatched);
    }
  }
});

for (const pack of LEGAL_POLICY_PACKS) {
  for (const rule of pack.rules) {
    const fixture = LEGAL_POLICY_CONFORMANCE_FIXTURES[pack.id][rule.id];
    for (const [scenario, expected] of [["matched", "MATCHED"], ["notMatched", "NOT_MATCHED"], ["indeterminate", "INDETERMINATE"]]) {
      if (!fixture[scenario]) continue;
      for (let mutation = 0; mutation < MUTATIONS; mutation += 1) {
        test(`policy conformance ${pack.id} ${rule.id} ${scenario} mutation ${mutation}`, () => {
          const facts = mutateFacts(fixture[scenario], mutation);
          const authorityStatus = AUTHORITY_STATUSES[mutation % AUTHORITY_STATUSES.length];
          const evaluation = evaluatePolicyPack(pack, facts, { authorityStatus, evaluatedAt });
          const result = evaluation.results.find((item) => item.ruleId === rule.id);

          assert.equal(result.outcome, expected);
          assert.equal(result.finding === null, expected === "NOT_MATCHED");
          assert.equal(evaluation.authorityStatus, authorityStatus);
          assert.equal(evaluation.packHash, pack.contentHash);
          assert.equal(evaluation.evaluatedAt, evaluatedAt);
          assert.equal(Object.values(evaluation.counts).reduce((sum, count) => sum + count, 0), pack.rules.length);
          assert.match(policyContentHash(facts), /^[a-f0-9]{64}$/);
          if (expected === "INDETERMINATE") {
            assert.ok(result.missingFacts.length > 0);
            assert.ok(result.unknownQuestions.length > 0);
          }
        });
      }
    }
  }
}
