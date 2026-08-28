const CORPORATE_SUFFIXES = new Set([
  "co", "company", "corp", "corporation", "inc", "incorporated", "llc", "llp",
  "lp", "ltd", "limited", "plc", "pc", "pa", "gmbh", "sa", "ag",
]);

export function normalizeName(value) {
  const tokens = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(" ");
}

function humanNameCompatible(search, candidate) {
  const left = normalizeName(search).split(" ");
  const right = normalizeName(candidate).split(" ");
  if (left.length < 2 || right.length < 2 || left.at(-1) !== right.at(-1)) return false;
  if (left[0] !== right[0]) return false;
  const leftMiddle = left.slice(1, -1).join("");
  const rightMiddle = right.slice(1, -1).join("");
  return !leftMiddle || !rightMiddle || leftMiddle[0] === rightMiddle[0];
}

export function matchEntity(search, candidate) {
  const searched = String(search.name || search || "").trim();
  const canonical = String(candidate.canonicalName || candidate.name || "").trim();
  const aliases = candidate.aliases || [];
  const identifiers = candidate.identifiers || [];
  const addresses = candidate.addresses || [];
  const reasons = [];

  if (canonical.toLowerCase() === searched.toLowerCase()) {
    return { confidence: "EXACT", reasons: ["Exact canonical name"] };
  }
  const exactAlias = aliases.find((alias) => String(alias).toLowerCase() === searched.toLowerCase());
  if (exactAlias) return { confidence: "EXACT", reasons: [`Exact alias: ${exactAlias}`] };

  if (normalizeName(canonical) === normalizeName(searched)) reasons.push("Canonical name matches after punctuation and suffix normalization");
  const normalizedAlias = aliases.find((alias) => normalizeName(alias) === normalizeName(searched));
  if (normalizedAlias) reasons.push(`Alias matches after normalization: ${normalizedAlias}`);
  if (humanNameCompatible(searched, canonical)) reasons.push("Compatible given name, surname, and middle initial");

  if (search.identifiers?.some((identifier) => identifiers.includes(identifier))) reasons.push("Exact identifier");
  if (search.addresses?.some((address) => addresses.map(normalizeName).includes(normalizeName(address)))) reasons.push("Same address");

  if (reasons.some((reason) => reason.startsWith("Exact identifier"))) return { confidence: "EXACT", reasons };
  if (reasons.length >= 2) return { confidence: "STRONG", reasons };
  if (reasons.length === 1) return { confidence: "POSSIBLE", reasons };
  return null;
}

export function relatedMatch(relationship) {
  return {
    confidence: "RELATED",
    reasons: [`${relationship.type || "Related entity"}: ${relationship.fromName} → ${relationship.toName}`],
  };
}
