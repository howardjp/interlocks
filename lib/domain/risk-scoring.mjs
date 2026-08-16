const relationshipWeights = {
  "Financial interest": 48,
  "Fiduciary role": 55,
  "Outside employment": 45,
  "Family employment": 32,
  "Personal relationship": 28,
  "Gift or hospitality": 25,
  "Prior employment": 22,
  Other: 18,
};

const sensitivityWeights = {
  standard: 6,
  elevated: 14,
  restricted: 22,
};

const influenceWeights = {
  observe: 0,
  advise: 8,
  recommend: 16,
  decide: 24,
};

function financialWeight(value) {
  if (value >= 10_000) return 18;
  if (value >= 1_000) return 12;
  if (value >= 100) return 6;
  return 0;
}

export function riskLevelForScore(score) {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

export function scoreDisclosure({
  relationshipType,
  matterSensitivity = "standard",
  influence = "advise",
  financialValue = 0,
}) {
  const relationship = relationshipWeights[relationshipType] ?? relationshipWeights.Other;
  const sensitivity = sensitivityWeights[matterSensitivity] ?? sensitivityWeights.standard;
  const decisionInfluence = influenceWeights[influence] ?? influenceWeights.advise;
  const valueWeight = financialWeight(Number(financialValue) || 0);
  const score = Math.min(100, relationship + sensitivity + decisionInfluence + valueWeight);

  const factors = [
    `${relationshipType || "Other relationship"}: +${relationship}`,
    `${matterSensitivity[0].toUpperCase()}${matterSensitivity.slice(1)} matter: +${sensitivity}`,
  ];
  if (decisionInfluence > 0) factors.push(`${influence} influence: +${decisionInfluence}`);
  if (valueWeight > 0) factors.push(`Financial materiality: +${valueWeight}`);

  return { score, level: riskLevelForScore(score), factors };
}

export const riskModel = Object.freeze({
  relationshipWeights,
  sensitivityWeights,
  influenceWeights,
  thresholds: { Critical: 75, High: 55, Moderate: 35, Low: 0 },
});
