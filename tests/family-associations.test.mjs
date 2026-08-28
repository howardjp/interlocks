import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSOCIATION_INTEREST_STATUSES,
  ASSOCIATION_STATUSES,
  ASSOCIATION_DISCLOSURE_SCOPES,
  FAMILY_LINK_STATUSES,
  FAMILY_RELATIONSHIP_TYPES,
  assertAssociationDisclosureScope,
  assertFamilyRelationship,
  associationInterestIsEffective,
  associationIsEffective,
  canonicalFamilyPair,
  familyCandidateReason,
  familyLinkIsEffective,
  linkedLedgerEntryIsShareable,
  reciprocalFamilyRelationship,
} from "../lib/domain/family-associations.mjs";

const reciprocal = Object.freeze({
  SPOUSE:"SPOUSE", DOMESTIC_PARTNER:"DOMESTIC_PARTNER", PARENT:"CHILD", CHILD:"PARENT",
  SIBLING:"SIBLING", GRANDPARENT:"GRANDCHILD", GRANDCHILD:"GRANDPARENT", IN_LAW:"IN_LAW",
  HOUSEHOLD_MEMBER:"HOUSEHOLD_MEMBER", DEPENDENT:"GUARDIAN", GUARDIAN:"DEPENDENT",
  CLOSE_PERSONAL_RELATIONSHIP:"CLOSE_PERSONAL_RELATIONSHIP", OTHER:"OTHER",
});

test("family relationship vocabulary is complete, frozen, and duplicate-free", () => {
  assert.equal(Object.isFrozen(FAMILY_RELATIONSHIP_TYPES), true);
  assert.equal(new Set(FAMILY_RELATIONSHIP_TYPES).size, FAMILY_RELATIONSHIP_TYPES.length);
  assert.deepEqual(FAMILY_RELATIONSHIP_TYPES, Object.keys(reciprocal));
});

for (const scope of ASSOCIATION_DISCLOSURE_SCOPES) {
  test(`association disclosure scope accepts ${scope}`, () => assert.equal(assertAssociationDisclosureScope(scope), scope));
  test(`association disclosure scope normalizes ${scope}`, () => assert.equal(assertAssociationDisclosureScope(scope.toLowerCase().replaceAll("_", " ")), scope));
}

for (const scope of ["PUBLIC", "FULL_LEDGER", "MATCH_ONLY", "", null, 9]) {
  test(`association disclosure scope rejects ${JSON.stringify(scope)}`, () => {
    if (scope === "" || scope == null) assert.equal(assertAssociationDisclosureScope(scope), "MATCH_AND_RELATIONSHIP");
    else assert.throws(() => assertAssociationDisclosureScope(scope), /Unsupported association disclosure scope/);
  });
}

for (const relationship of FAMILY_RELATIONSHIP_TYPES) {
  test(`family relationship accepts canonical ${relationship}`, () => assert.equal(assertFamilyRelationship(relationship), relationship));
  test(`family relationship normalizes human spelling ${relationship}`, () => assert.equal(assertFamilyRelationship(relationship.toLowerCase().replaceAll("_", " ")), relationship));
  test(`family relationship trims ${relationship}`, () => assert.equal(assertFamilyRelationship(`  ${relationship}  `), relationship));
  test(`family relationship reciprocal maps ${relationship}`, () => assert.equal(reciprocalFamilyRelationship(relationship), reciprocal[relationship]));
  test(`family relationship reciprocal is an involution for ${relationship}`, () => assert.equal(reciprocalFamilyRelationship(reciprocalFamilyRelationship(relationship)), relationship));
}

for (const invalid of ["", "COUSIN", "FRIEND_WITH_BENEFITS", "CHILDREN", "SPOUSES", null, undefined, 7, {}, []]) {
  test(`unsupported family relationship ${JSON.stringify(invalid)} is rejected`, () => assert.throws(() => assertFamilyRelationship(invalid), /Unsupported family or household relationship/));
}

for (const [left, right] of [["person-a","person-b"],["z","a"],["1","2"],["p-alex","p-nina"]]) {
  test(`canonical family pair is order independent for ${left} and ${right}`, () => {
    assert.equal(canonicalFamilyPair(left, right), canonicalFamilyPair(right, left));
    assert.equal(canonicalFamilyPair(left, right), [left, right].sort().join("::"));
  });
}

for (const [left, right] of [["","b"],["a",""],[null,"b"],["a",undefined],["same","same"],[" x ","x"]]) {
  test(`invalid canonical family pair ${JSON.stringify(left)} and ${JSON.stringify(right)} is rejected`, () => assert.throws(() => canonicalFamilyPair(left, right)));
}

const instants = Object.freeze({ past:"2026-01-01T00:00:00.000Z", now:"2026-06-01T00:00:00.000Z", future:"2027-01-01T00:00:00.000Z" });
const windows = Object.freeze([
  ["unbounded", null, null, true],
  ["started", "2026-01-01", null, true],
  ["future", "2027-01-01", null, false],
  ["ended", null, "2026-01-01", false],
  ["current", "2026-01-01", "2027-01-01", true],
  ["starts-now", "2026-06-01", null, true],
  ["ends-now", null, "2026-06-01", false],
  ["invalid-start", "not-a-date", null, false],
  ["invalid-end", null, "not-a-date", false],
]);

for (const status of [...ASSOCIATION_STATUSES, "PENDING", "REVOKED", "", null]) {
  for (const [windowName, effectiveFrom, effectiveTo, inWindow] of windows) {
    const expected = status === "ACTIVE" && inWindow;
    test(`association ${String(status)} in ${windowName} window is ${expected ? "effective" : "inactive"}`, () => {
      assert.equal(associationIsEffective({ status, effectiveFrom, effectiveTo }, instants.now), expected);
      assert.equal(associationIsEffective({ status, effective_from:effectiveFrom, effective_to:effectiveTo }, instants.now), expected);
    });
  }
}

for (const status of [...ASSOCIATION_INTEREST_STATUSES, "PENDING", "", null]) {
  for (const sharingAuthorized of [true, false, 1, 0]) {
    for (const [windowName, effectiveFrom, effectiveTo, inWindow] of windows) {
      const expected = status === "CURRENT" && Boolean(sharingAuthorized) && inWindow;
      test(`interest ${String(status)} sharing ${String(sharingAuthorized)} in ${windowName} window is ${expected ? "effective" : "inactive"}`, () => {
        assert.equal(associationInterestIsEffective({ status, sharingAuthorized, effectiveFrom, effectiveTo }, instants.now), expected);
        assert.equal(associationInterestIsEffective({ status, sharing_authorized:sharingAuthorized, effective_from:effectiveFrom, effective_to:effectiveTo }, instants.now), expected);
      });
    }
  }
}

for (const status of [...FAMILY_LINK_STATUSES, "", null]) {
  for (const acceptedAt of [null, instants.past, instants.now, instants.future, "invalid"] ) {
    for (const revokedAt of [null, instants.past]) {
      const accepted = acceptedAt != null && acceptedAt !== "invalid" && acceptedAt <= instants.now;
      const expected = status === "ACTIVE" && accepted && revokedAt == null;
      test(`account link ${String(status)} accepted ${String(acceptedAt)} revoked ${String(revokedAt)} is ${expected ? "effective" : "inactive"}`, () => {
        assert.equal(familyLinkIsEffective({ status, acceptedAt, revokedAt }, instants.now), expected);
        assert.equal(familyLinkIsEffective({ status, accepted_at:acceptedAt, revoked_at:revokedAt }, instants.now), expected);
      });
    }
  }
}

for (const disclosureClass of ["PORTABLE","RESTRICTED","FIRM_ONLY","CONSENT_REQUIRED","portable","",null]) {
  for (const sharingAuthorized of [true,false,1,0]) {
    const expected = String(disclosureClass || "").toUpperCase() === "PORTABLE" && Boolean(sharingAuthorized);
    test(`linked ledger ${String(disclosureClass)} sharing ${String(sharingAuthorized)} is ${expected ? "shareable" : "private"}`, () => {
      assert.equal(linkedLedgerEntryIsShareable({ disclosureClass, sharingAuthorized }), expected);
      assert.equal(linkedLedgerEntryIsShareable({ disclosure_class:disclosureClass, sharing_authorized:sharingAuthorized }), expected);
    });
  }
}

for (const relationshipType of FAMILY_RELATIONSHIP_TYPES) {
  test(`declared ${relationshipType} explanation identifies declared provenance`, () => {
    const reason = familyCandidateReason({ mode:"DECLARED", relationshipType, involvement:"VICE_PRESIDENT" });
    assert.match(reason, /^A declared /);
    assert.match(reason, /vice president connection\.$/);
    assert.doesNotMatch(reason, /ledger detail/);
  });
  test(`conflict-only ${relationshipType} explanation suppresses the relationship category`, () => {
    const reason = familyCandidateReason({ mode:"DECLARED", relationshipType, involvement:"VICE_PRESIDENT", discloseRelationship:false });
    assert.equal(reason, "An owner-declared associated person has a recorded vice president connection.");
    assert.doesNotMatch(reason, new RegExp(relationshipType.replaceAll("_", " "), "i"));
  });
  test(`linked ${relationshipType} explanation preserves ledger privacy`, () => {
    const reason = familyCandidateReason({ mode:"ACCOUNT_LINKED", relationshipType, involvement:"SECRET" });
    assert.match(reason, /^An authorized /);
    assert.match(reason, /underlying ledger detail remains private\.$/);
    assert.doesNotMatch(reason, /SECRET/i);
  });
}
