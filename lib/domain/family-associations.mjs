const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");

export const FAMILY_RELATIONSHIP_TYPES = Object.freeze([
  "SPOUSE",
  "DOMESTIC_PARTNER",
  "PARENT",
  "CHILD",
  "SIBLING",
  "GRANDPARENT",
  "GRANDCHILD",
  "IN_LAW",
  "HOUSEHOLD_MEMBER",
  "DEPENDENT",
  "GUARDIAN",
  "CLOSE_PERSONAL_RELATIONSHIP",
  "OTHER",
]);

export const FAMILY_LINK_STATUSES = Object.freeze(["PENDING", "ACTIVE", "DECLINED", "REVOKED", "EXPIRED"]);
export const ASSOCIATION_STATUSES = Object.freeze(["ACTIVE", "ENDED"]);
export const ASSOCIATION_INTEREST_STATUSES = Object.freeze(["CURRENT", "REVOKED", "ENDED"]);
export const ASSOCIATION_DISCLOSURE_SCOPES = Object.freeze(["CONFLICT_CHECK_ONLY", "MATCH_AND_RELATIONSHIP"]);

const RECIPROCAL = Object.freeze({
  SPOUSE:"SPOUSE",
  DOMESTIC_PARTNER:"DOMESTIC_PARTNER",
  PARENT:"CHILD",
  CHILD:"PARENT",
  SIBLING:"SIBLING",
  GRANDPARENT:"GRANDCHILD",
  GRANDCHILD:"GRANDPARENT",
  IN_LAW:"IN_LAW",
  HOUSEHOLD_MEMBER:"HOUSEHOLD_MEMBER",
  DEPENDENT:"GUARDIAN",
  GUARDIAN:"DEPENDENT",
  CLOSE_PERSONAL_RELATIONSHIP:"CLOSE_PERSONAL_RELATIONSHIP",
  OTHER:"OTHER",
});

export function assertFamilyRelationship(value) {
  const relationship = normalize(value);
  if (!FAMILY_RELATIONSHIP_TYPES.includes(relationship)) throw new Error("Unsupported family or household relationship");
  return relationship;
}

export function assertAssociationDisclosureScope(value = "MATCH_AND_RELATIONSHIP") {
  const scope = normalize(value || "MATCH_AND_RELATIONSHIP");
  if (!ASSOCIATION_DISCLOSURE_SCOPES.includes(scope)) throw new Error("Unsupported association disclosure scope");
  return scope;
}

export function reciprocalFamilyRelationship(value) {
  return RECIPROCAL[assertFamilyRelationship(value)];
}

export function canonicalFamilyPair(firstPersonId, secondPersonId) {
  const first = String(firstPersonId || "").trim();
  const second = String(secondPersonId || "").trim();
  if (!first || !second) throw new Error("Both people are required for an account link");
  if (first === second) throw new Error("A person cannot link their account to itself");
  return [first, second].sort().join("::");
}

function timestamp(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function insideWindow(item, at) {
  const current = typeof at === "number" ? at : timestamp(at) ?? Date.now();
  const start = timestamp(item.effectiveFrom ?? item.effective_from);
  const end = timestamp(item.effectiveTo ?? item.effective_to);
  return !(Number.isNaN(start) || Number.isNaN(end)) && (start == null || start <= current) && (end == null || end > current);
}

export function associationIsEffective(association, at = Date.now()) {
  return normalize(association?.status) === "ACTIVE" && insideWindow(association || {}, at);
}

export function associationInterestIsEffective(interest, at = Date.now()) {
  return normalize(interest?.status) === "CURRENT" && Boolean(interest?.sharingAuthorized ?? interest?.sharing_authorized) && insideWindow(interest || {}, at);
}

export function familyLinkIsEffective(link, at = Date.now()) {
  if (normalize(link?.status) !== "ACTIVE") return false;
  if (!link?.acceptedAt && !link?.accepted_at) return false;
  if (link?.revokedAt || link?.revoked_at) return false;
  const accepted = timestamp(link?.acceptedAt ?? link?.accepted_at);
  const current = typeof at === "number" ? at : timestamp(at) ?? Date.now();
  return !Number.isNaN(accepted) && accepted <= current;
}

export function linkedLedgerEntryIsShareable(entry) {
  return normalize(entry?.disclosureClass ?? entry?.disclosure_class) === "PORTABLE" && Boolean(entry?.sharingAuthorized ?? entry?.sharing_authorized);
}

export function familyCandidateReason({ mode, relationshipType, involvement, discloseRelationship = true }) {
  const relationship = assertFamilyRelationship(relationshipType).replaceAll("_", " ").toLowerCase();
  if (normalize(mode) === "ACCOUNT_LINKED") return `An authorized ${relationship} account reports a connection; underlying ledger detail remains private.`;
  const role = String(involvement || "associated interest").trim().replaceAll("_", " ").toLowerCase();
  if (!discloseRelationship) return `An owner-declared associated person has a recorded ${role} connection.`;
  return `A declared ${relationship} has a recorded ${role} connection.`;
}
