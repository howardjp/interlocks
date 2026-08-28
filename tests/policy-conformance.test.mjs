import assert from "node:assert/strict";
import test from "node:test";

import { AUTHORITY_STATUSES, evaluatePolicyPack } from "../lib/policy/policy-engine.mjs";
import { LEGAL_POLICY_PACKS } from "../lib/policy/legal-policy-packs.mjs";

const licensingPacks = LEGAL_POLICY_PACKS.filter((pack) => pack.authorityType !== "TRIBUNAL");
const indicatorByCorrespondence = Object.freeze({
  "aba.1.7-a-1": "CURRENT_CLIENT_ADVERSITY",
  "aba.1.7-a-2": "FINANCIAL_INTEREST",
  "aba.1.9": "FORMER_CLIENT_INTERSECTION",
  "aba.1.11": "FORMER_GOVERNMENT_INTERSECTION",
  "aba.1.18": "PROSPECTIVE_CLIENT_INTERSECTION",
});
const scenarios = Object.freeze(["MATCH", "ABSENT", "MATCH_WITH_NOISE", "DUPLICATE_WITH_NOISE"]);

function factsFor(indicatorType, scenario, mutation) {
  const noise = Array.from({ length: mutation % 11 }, (_, index) => ({
    type: `IRRELEVANT_${mutation}_${index}`,
    evidenceId: `noise-${index}`,
    detail: { order: mutation - index, retained: Boolean(index % 2) },
  }));
  if (scenario === "ABSENT") return { indicators: noise, mutation };
  const target = { type: indicatorType, evidenceId: `target-${mutation}`, detail: { mutation } };
  if (scenario === "MATCH") return { indicators: [target], mutation };
  if (scenario === "MATCH_WITH_NOISE") {
    const position = mutation % (noise.length + 1);
    return { indicators: [...noise.slice(0, position), target, ...noise.slice(position)], mutation };
  }
  return { indicators: mutation % 2 ? [target, ...noise, structuredClone(target)] : [...noise, target, structuredClone(target)], mutation };
}

for (const pack of licensingPacks) {
  for (const rule of pack.rules) {
    const indicatorType = indicatorByCorrespondence[rule.correspondsTo];
    if (!indicatorType) throw new Error(`Missing conformance indicator for ${rule.correspondsTo}`);
    for (const scenario of scenarios) {
      for (let mutation = 0; mutation < 100; mutation += 1) {
        test(`policy conformance ${pack.id} ${rule.id} ${scenario} mutation ${mutation}`, () => {
          const authorityStatus = AUTHORITY_STATUSES[mutation % AUTHORITY_STATUSES.length];
          const result = evaluatePolicyPack(pack, factsFor(indicatorType, scenario, mutation), {
            authorityStatus,
            evaluatedAt: "2026-08-28T12:00:00.000Z",
          });
          const target = result.results.find((item) => item.ruleId === rule.id);
          const expected = scenario === "ABSENT" ? "NOT_MATCHED" : "MATCHED";

          assert.equal(target.outcome, expected);
          assert.equal(result.authorityStatus, authorityStatus);
          assert.equal(result.packId, pack.id);
          assert.equal(result.packHash, pack.contentHash);
          assert.equal(Object.values(result.counts).reduce((sum, count) => sum + count, 0), pack.rules.length);
          assert.equal(target.finding === null, expected === "NOT_MATCHED");
        });
      }
    }
  }
}

