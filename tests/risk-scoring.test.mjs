import assert from "node:assert/strict";
import test from "node:test";

import { riskLevelForScore, scoreDisclosure } from "../lib/domain/risk-scoring.mjs";

test("risk thresholds have stable, non-overlapping boundaries", () => {
  assert.equal(riskLevelForScore(0), "Low");
  assert.equal(riskLevelForScore(34), "Low");
  assert.equal(riskLevelForScore(35), "Moderate");
  assert.equal(riskLevelForScore(54), "Moderate");
  assert.equal(riskLevelForScore(55), "High");
  assert.equal(riskLevelForScore(74), "High");
  assert.equal(riskLevelForScore(75), "Critical");
  assert.equal(riskLevelForScore(100), "Critical");
});

test("fiduciary authority in a restricted matter is critical and explainable", () => {
  const result = scoreDisclosure({
    relationshipType: "Fiduciary role",
    matterSensitivity: "restricted",
    influence: "decide",
    financialValue: 0,
  });
  assert.deepEqual(result, {
    score: 100,
    level: "Critical",
    factors: [
      "Fiduciary role: +55",
      "Restricted matter: +22",
      "decide influence: +24",
    ],
  });
});

test("scores are capped and financial materiality is disclosed", () => {
  const result = scoreDisclosure({
    relationshipType: "Financial interest",
    matterSensitivity: "restricted",
    influence: "decide",
    financialValue: 50_000,
  });
  assert.equal(result.score, 100);
  assert.equal(result.level, "Critical");
  assert.ok(result.factors.includes("Financial materiality: +18"));
});

test("a prior role with no influence remains low", () => {
  const result = scoreDisclosure({
    relationshipType: "Prior employment",
    matterSensitivity: "standard",
    influence: "observe",
  });
  assert.equal(result.score, 28);
  assert.equal(result.level, "Low");
});
