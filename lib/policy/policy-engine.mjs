import { createHash } from "node:crypto";

export const POLICY_DSL_VERSION = "interlocks-policy.v1";
export const POLICY_ENGINE_VERSION = "1.1.0";
export const POLICY_OUTCOMES = Object.freeze(["MATCHED", "NOT_MATCHED", "INDETERMINATE"]);
export const AUTHORITY_STATUSES = Object.freeze(["CONTROLLING", "POTENTIALLY_APPLICABLE", "COMPARATIVE_ONLY"]);

const OPERATORS = new Set(["equals", "not_equals", "in", "not_in", "includes", "intersects", "greater_than", "at_least", "exists"]);
const FACT_TYPES = new Set(["BOOLEAN", "ENUM", "STRING", "NUMBER"]);
const MISSING_BEHAVIORS = new Set(["INDETERMINATE", "NOT_MATCHED"]);

function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function policyContentHash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function atPath(value, path) {
  if (!path) return value;
  return String(path).split(".").reduce((current, part) => current == null ? undefined : current[part], value);
}

function outcome(value, trace, missingFacts = []) { return { outcome: value, trace, missingFacts }; }

function combineAll(results) {
  if (results.some((item) => item.outcome === "NOT_MATCHED")) return "NOT_MATCHED";
  if (results.some((item) => item.outcome === "INDETERMINATE")) return "INDETERMINATE";
  return "MATCHED";
}

function combineAny(results) {
  if (results.some((item) => item.outcome === "MATCHED")) return "MATCHED";
  if (results.some((item) => item.outcome === "INDETERMINATE")) return "INDETERMINATE";
  return "NOT_MATCHED";
}

function compare(actual, operator, expected) {
  if (operator === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (actual === undefined || actual === null) return undefined;
  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual);
  if (operator === "not_in") return Array.isArray(expected) && !expected.includes(actual);
  if (operator === "includes") return Array.isArray(actual) ? actual.includes(expected) : String(actual).includes(String(expected));
  if (operator === "intersects") return Array.isArray(actual) && Array.isArray(expected) && actual.some((item) => expected.includes(item));
  if (operator === "greater_than") return Number(actual) > Number(expected);
  if (operator === "at_least") return Number(actual) >= Number(expected);
  throw new Error(`Unsupported policy operator: ${operator}`);
}

function evaluateExpression(expression, scope, root, depth = 0) {
  if (depth > 24) throw new Error("Policy expression exceeds the maximum nesting depth");
  if (!isObject(expression)) throw new Error("Policy expression must be an object");

  if (Array.isArray(expression.all)) {
    if (!expression.all.length) throw new Error("Policy all expression cannot be empty");
    const children = expression.all.map((item) => evaluateExpression(item, scope, root, depth + 1));
    return outcome(combineAll(children), { type: "all", outcome: combineAll(children), children: children.map((item) => item.trace) }, children.flatMap((item) => item.missingFacts));
  }
  if (Array.isArray(expression.any)) {
    if (!expression.any.length) throw new Error("Policy any expression cannot be empty");
    const children = expression.any.map((item) => evaluateExpression(item, scope, root, depth + 1));
    return outcome(combineAny(children), { type: "any", outcome: combineAny(children), children: children.map((item) => item.trace) }, children.flatMap((item) => item.missingFacts));
  }
  if (expression.not) {
    const child = evaluateExpression(expression.not, scope, root, depth + 1);
    const value = child.outcome === "MATCHED" ? "NOT_MATCHED" : child.outcome === "NOT_MATCHED" ? "MATCHED" : "INDETERMINATE";
    return outcome(value, { type: "not", outcome: value, child: child.trace }, child.missingFacts);
  }
  if (expression.exists) {
    const collectionPath = expression.exists.collection;
    const collection = atPath(root, collectionPath);
    if (collection === undefined || collection === null) return outcome("INDETERMINATE", { type: "exists", collection: collectionPath, outcome: "INDETERMINATE", reason: "collection unavailable" }, [collectionPath]);
    if (!Array.isArray(collection)) throw new Error(`Policy collection is not an array: ${collectionPath}`);
    if (!collection.length) return outcome("NOT_MATCHED", { type: "exists", collection: collectionPath, outcome: "NOT_MATCHED", examined: 0 });
    const rows = collection.map((row, index) => ({ index, result: evaluateExpression(expression.exists.where, row, root, depth + 1) }));
    const value = combineAny(rows.map((item) => item.result));
    return outcome(value, {
      type: "exists", collection: collectionPath, outcome: value, examined: rows.length,
      matchedIndexes: rows.filter((item) => item.result.outcome === "MATCHED").map((item) => item.index),
      rows: rows.map((item) => ({ index: item.index, trace: item.result.trace })),
    }, rows.flatMap((item) => item.result.missingFacts));
  }
  if (expression.predicate) {
    const target = expression.predicate.root ? root : scope;
    const path = expression.predicate.path;
    const operator = expression.predicate.operator || "equals";
    const actual = atPath(target, path);
    if ((actual === undefined || actual === null) && expression.predicate.onMissing === "NOT_MATCHED") {
      return outcome("NOT_MATCHED", { type: "predicate", path, root: Boolean(expression.predicate.root), operator, expected: expression.predicate.value, actual: null, outcome: "NOT_MATCHED", reason: "optional trigger unavailable" });
    }
    const compared = compare(actual, operator, expression.predicate.value);
    const value = compared === undefined ? "INDETERMINATE" : compared ? "MATCHED" : "NOT_MATCHED";
    return outcome(value, { type: "predicate", path, root: Boolean(expression.predicate.root), operator, expected: expression.predicate.value, actual: actual ?? null, outcome: value }, value === "INDETERMINATE" ? [path] : []);
  }
  throw new Error("Unsupported policy expression");
}

function validateExpression(expression, depth = 0) {
  if (depth > 24) throw new Error("Policy expression exceeds the maximum nesting depth");
  if (!isObject(expression)) throw new Error("Policy expression must be an object");
  const forms = [Array.isArray(expression.all), Array.isArray(expression.any), Boolean(expression.not), Boolean(expression.exists), Boolean(expression.predicate)].filter(Boolean);
  if (forms.length !== 1) throw new Error("Policy expression must contain exactly one expression form");
  if (expression.all) { if (!expression.all.length) throw new Error("Policy all expression cannot be empty"); expression.all.forEach((item) => validateExpression(item, depth + 1)); }
  if (expression.any) { if (!expression.any.length) throw new Error("Policy any expression cannot be empty"); expression.any.forEach((item) => validateExpression(item, depth + 1)); }
  if (expression.not) validateExpression(expression.not, depth + 1);
  if (expression.exists) {
    if (!expression.exists.collection || !expression.exists.where) throw new Error("Policy exists expression requires collection and where");
    validateExpression(expression.exists.where, depth + 1);
  }
  if (expression.predicate) {
    if (!expression.predicate.path) throw new Error("Policy predicate path is required");
    const operator = expression.predicate.operator || "equals";
    if (!OPERATORS.has(operator)) throw new Error(`Unsupported policy operator: ${operator}`);
    const onMissing = expression.predicate.onMissing || "INDETERMINATE";
    if (!MISSING_BEHAVIORS.has(onMissing)) throw new Error(`Unsupported missing-fact behavior: ${onMissing}`);
  }
}

function validateFactDefinitions(definitions = []) {
  if (!Array.isArray(definitions)) throw new Error("Policy pack factDefinitions must be an array");
  const ids = new Set();
  for (const definition of definitions) {
    for (const field of ["id", "type", "label", "group"]) if (!definition[field]) throw new Error(`Policy fact definition ${field} is required`);
    if (ids.has(definition.id)) throw new Error(`Duplicate policy fact definition: ${definition.id}`);
    ids.add(definition.id);
    if (!FACT_TYPES.has(definition.type)) throw new Error(`Unsupported policy fact type: ${definition.type}`);
    if (definition.type === "ENUM" && (!Array.isArray(definition.options) || !definition.options.length)) throw new Error(`Policy enum fact requires options: ${definition.id}`);
    if (definition.options && new Set(definition.options.map((item) => item.value)).size !== definition.options.length) throw new Error(`Policy fact options must be unique: ${definition.id}`);
  }
}

export function compilePolicyPack(input) {
  if (!isObject(input)) throw new Error("Policy pack must be an object");
  for (const field of ["id", "title", "version", "effectiveFrom", "authorityType", "publisher", "sourceUrl"]) if (!input[field]) throw new Error(`Policy pack ${field} is required`);
  if (input.dslVersion !== POLICY_DSL_VERSION) throw new Error(`Unsupported policy DSL version: ${input.dslVersion || "missing"}`);
  validateFactDefinitions(input.factDefinitions || []);
  if (!Array.isArray(input.rules) || !input.rules.length) throw new Error("Policy pack must contain rules");
  const ruleIds = new Set();
  for (const rule of input.rules) {
    for (const field of ["id", "title", "summary", "citation", "sourceUrl", "condition", "finding"]) if (!rule[field]) throw new Error(`Policy rule ${field} is required`);
    if (ruleIds.has(rule.id)) throw new Error(`Duplicate policy rule id: ${rule.id}`);
    ruleIds.add(rule.id);
    validateExpression(rule.condition);
    if (!rule.finding.code || !rule.finding.message) throw new Error(`Policy rule finding is incomplete: ${rule.id}`);
    if (rule.scope && rule.scope !== "CONFLICT_CLEARANCE") throw new Error(`Unsupported policy rule scope: ${rule.scope}`);
  }
  const manifest = structuredClone(input);
  return Object.freeze({ ...manifest, contentHash: policyContentHash(manifest) });
}

export function evaluatePolicyPack(packInput, facts, options = {}) {
  const pack = packInput.contentHash ? packInput : compilePolicyPack(packInput);
  const authorityStatus = options.authorityStatus || "POTENTIALLY_APPLICABLE";
  if (!AUTHORITY_STATUSES.includes(authorityStatus)) throw new Error("Unsupported authority status");
  const results = pack.rules.map((rule) => {
    const evaluated = evaluateExpression(rule.condition, facts, facts);
    const unknownQuestions = evaluated.outcome === "INDETERMINATE"
      ? (rule.unknownQuestions || []).filter((question) => !question.fact || evaluated.missingFacts.includes(question.fact))
      : [];
    return {
      ruleId: rule.id, correspondsTo: rule.correspondsTo || null, title: rule.title, summary: rule.summary,
      topic: rule.topic || null, phase: rule.phase || null, severity: rule.severity || "REVIEW",
      citation: rule.citation, sourceUrl: rule.sourceUrl, comparisonNote: rule.comparisonNote || null,
      outcome: evaluated.outcome, finding: evaluated.outcome === "NOT_MATCHED" ? null : structuredClone(rule.finding),
      missingFacts: [...new Set(evaluated.missingFacts)], unknownQuestions, trace: evaluated.trace,
    };
  });
  return {
    engineVersion: POLICY_ENGINE_VERSION, dslVersion: POLICY_DSL_VERSION,
    packId: pack.id, packTitle: pack.title, packVersion: pack.version, packHash: pack.contentHash,
    authorityStatus, evaluatedAt: options.evaluatedAt || new Date().toISOString(),
    counts: Object.fromEntries(POLICY_OUTCOMES.map((name) => [name, results.filter((item) => item.outcome === name).length])),
    results,
  };
}
