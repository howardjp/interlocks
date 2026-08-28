import { compilePolicyPack, POLICY_DSL_VERSION } from "./policy-engine.mjs";

const SOURCES = Object.freeze({
  aba: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/model_rules_of_professional_conduct_table_of_contents/",
  maryland: "https://www.courts.state.md.us/attygrievance/rules",
  virginia: "https://vsb.org/Site/Site/about/rules-regulations/rpc-part6-sec2.aspx",
  dc: "https://www.dcbar.org/for-lawyers/legal-ethics/rules-of-professional-conduct",
  delaware: "https://courts.delaware.gov/odc/rules.aspx",
  chancery: "https://courts.delaware.gov/forms/download.aspx?id=160908",
});

const indicator = (types) => ({ exists: { collection: "indicators", where: { predicate: { path: "type", operator: "in", value: types } } } });
const fact = (path, operator = "equals", value = true) => ({ predicate: { path, operator, value, root: true } });

const RULE_TEMPLATES = Object.freeze({
  directAdversity: {
    title: "Possible current-client adversity",
    summary: "Recorded relationships suggest that an identified adverse or opposing party may also be a current client.",
    condition: indicator(["CURRENT_CLIENT_ADVERSITY", "SAME_MATTER_ADVERSE_POSITIONS"]),
    finding: { code: "POSSIBLE_CURRENT_CLIENT_ADVERSITY", message: "A current-client relationship may intersect an adverse position. Human review is required.", reviewRequired: true },
  },
  materialLimitation: {
    title: "Possible material limitation",
    summary: "A personal, financial, fiduciary, family, or third-party responsibility may affect professional judgment.",
    condition: indicator(["PERSONAL_INTEREST", "FINANCIAL_INTEREST", "FIDUCIARY_RESPONSIBILITY", "FAMILY_CONNECTION", "OUTSIDE_RESPONSIBILITY"]),
    finding: { code: "POSSIBLE_MATERIAL_LIMITATION", message: "A recorded interest or responsibility may materially limit the representation. Human review is required.", reviewRequired: true },
  },
  formerClient: {
    title: "Possible former-client intersection",
    summary: "A former representation may intersect the proposed matter or an adverse party.",
    condition: indicator(["FORMER_CLIENT_INTERSECTION"]),
    finding: { code: "POSSIBLE_FORMER_CLIENT_CONFLICT", message: "A former-client relationship may be substantially related to the proposed work. Determine scope, adversity, and information risk.", reviewRequired: true },
  },
  government: {
    title: "Possible former-government intersection",
    summary: "Prior government service may intersect the same or a related matter.",
    condition: indicator(["FORMER_GOVERNMENT_INTERSECTION"]),
    finding: { code: "POSSIBLE_GOVERNMENT_SERVICE_CONFLICT", message: "Prior government participation may require consent, screening, notice, or other restrictions.", reviewRequired: true },
  },
  prospectiveClient: {
    title: "Possible prospective-client duties",
    summary: "Information from or duties to a prospective client may intersect the proposed work.",
    condition: indicator(["PROSPECTIVE_CLIENT_INTERSECTION"]),
    finding: { code: "POSSIBLE_PROSPECTIVE_CLIENT_CONFLICT", message: "A prospective-client relationship may limit the proposed representation or require screening and consent analysis.", reviewRequired: true },
  },
});

function jurisdictionRules({ prefix, citations, sourceUrl, notes = {} }) {
  return ["directAdversity", "materialLimitation", "formerClient", "government", "prospectiveClient"].map((kind) => ({
    ...structuredClone(RULE_TEMPLATES[kind]),
    id: `${prefix}.${citations[kind].id}`,
    correspondsTo: `aba.${({ directAdversity:"1.7-a-1", materialLimitation:"1.7-a-2", formerClient:"1.9", government:"1.11", prospectiveClient:"1.18" })[kind]}`,
    citation: citations[kind].label,
    sourceUrl,
    comparisonNote: notes[kind] || null,
  }));
}

function pack(input) { return compilePolicyPack({ dslVersion: POLICY_DSL_VERSION, status: "PROTOTYPE_REVIEW_REQUIRED", ...input }); }

export const ABA_MODEL_PACK = pack({
  id: "aba-model", title: "ABA Model Rules", shortTitle: "ABA", version: "2026.1-prototype", effectiveFrom: "2026-01-01",
  authorityType: "MODEL", jurisdiction: "United States model", publisher: "American Bar Association", sourceUrl: SOURCES.aba,
  description: "Permanent provisional-screening and comparative baseline. The Model Rules are not controlling law unless independently adopted.",
  rules: jurisdictionRules({ prefix: "aba", sourceUrl: SOURCES.aba, citations: {
    directAdversity:{id:"1.7-a-1",label:"ABA Model Rule 1.7(a)(1)"}, materialLimitation:{id:"1.7-a-2",label:"ABA Model Rule 1.7(a)(2)"},
    formerClient:{id:"1.9",label:"ABA Model Rule 1.9"}, government:{id:"1.11",label:"ABA Model Rule 1.11"}, prospectiveClient:{id:"1.18",label:"ABA Model Rule 1.18"},
  } }),
});

export const MARYLAND_PACK = pack({
  id: "maryland", title: "Maryland Attorneys’ Rules of Professional Conduct", shortTitle: "Maryland", version: "2026.1-prototype", effectiveFrom: "2026-01-01",
  authorityType: "LICENSING_JURISDICTION", jurisdiction: "Maryland", publisher: "Supreme Court of Maryland", sourceUrl: SOURCES.maryland,
  description: "Maryland conflict-of-interest screening pack with rule numbering and citations maintained independently from the ABA baseline.",
  rules: jurisdictionRules({ prefix: "md", sourceUrl: SOURCES.maryland, citations: {
    directAdversity:{id:"19-301.7-a-1",label:"Maryland Rule 19-301.7(a)(1)"}, materialLimitation:{id:"19-301.7-a-2",label:"Maryland Rule 19-301.7(a)(2)"},
    formerClient:{id:"19-301.9",label:"Maryland Rule 19-301.9"}, government:{id:"19-301.11",label:"Maryland Rule 19-301.11"}, prospectiveClient:{id:"19-301.18",label:"Maryland Rule 19-301.18"},
  } }),
});

export const VIRGINIA_PACK = pack({
  id: "virginia", title: "Virginia Rules of Professional Conduct", shortTitle: "Virginia", version: "2026.1-prototype", effectiveFrom: "2026-01-01",
  authorityType: "LICENSING_JURISDICTION", jurisdiction: "Virginia", publisher: "Supreme Court of Virginia / Virginia State Bar", sourceUrl: SOURCES.virginia,
  description: "Virginia conflict-of-interest screening pack maintained as an independent jurisdictional snapshot.",
  rules: jurisdictionRules({ prefix: "va", sourceUrl: SOURCES.virginia, citations: {
    directAdversity:{id:"1.7-a-1",label:"Virginia Rule 1.7(a)(1)"}, materialLimitation:{id:"1.7-a-2",label:"Virginia Rule 1.7(a)(2)"},
    formerClient:{id:"1.9",label:"Virginia Rule 1.9"}, government:{id:"1.11",label:"Virginia Rule 1.11"}, prospectiveClient:{id:"1.18",label:"Virginia Rule 1.18"},
  }, notes: { directAdversity: "Compare Virginia’s consent-after-consultation formulation and knowledge provisions with the ABA baseline before relying on a result." } }),
});

export const DC_PACK = pack({
  id: "district-of-columbia", title: "District of Columbia Rules of Professional Conduct", shortTitle: "D.C.", version: "2025.09-prototype", effectiveFrom: "2025-09-15",
  authorityType: "LICENSING_JURISDICTION", jurisdiction: "District of Columbia", publisher: "District of Columbia Court of Appeals", sourceUrl: SOURCES.dc,
  description: "D.C. pack reflecting its distinct Rule 1.7 structure, including same-matter adverse positions and separate consent analysis.",
  rules: jurisdictionRules({ prefix: "dc", sourceUrl: SOURCES.dc, citations: {
    directAdversity:{id:"1.7-a-b",label:"D.C. Rule 1.7(a)–(b)"}, materialLimitation:{id:"1.7-b-4",label:"D.C. Rule 1.7(b)(4)"},
    formerClient:{id:"1.9",label:"D.C. Rule 1.9"}, government:{id:"1.11",label:"D.C. Rule 1.11"}, prospectiveClient:{id:"1.18",label:"D.C. Rule 1.18"},
  }, notes: { directAdversity: "D.C. Rule 1.7 distinguishes absolutely prohibited same-matter adverse positions from conflicts that may proceed only through its consent framework." } }),
});

export const DELAWARE_PACK = pack({
  id: "delaware", title: "Delaware Lawyers’ Rules of Professional Conduct", shortTitle: "Delaware", version: "2026.1-prototype", effectiveFrom: "2026-01-01",
  authorityType: "LICENSING_JURISDICTION", jurisdiction: "Delaware", publisher: "Supreme Court of Delaware", sourceUrl: SOURCES.delaware,
  description: "Delaware conflict-of-interest screening pack maintained independently from the ABA baseline.",
  rules: jurisdictionRules({ prefix: "de", sourceUrl: SOURCES.delaware, citations: {
    directAdversity:{id:"1.7-a-1",label:"Delaware Lawyers’ Rule 1.7(a)(1)"}, materialLimitation:{id:"1.7-a-2",label:"Delaware Lawyers’ Rule 1.7(a)(2)"},
    formerClient:{id:"1.9",label:"Delaware Lawyers’ Rule 1.9"}, government:{id:"1.11",label:"Delaware Lawyers’ Rule 1.11"}, prospectiveClient:{id:"1.18",label:"Delaware Lawyers’ Rule 1.18"},
  } }),
});

export const DELAWARE_CHANCERY_PACK = pack({
  id: "delaware-chancery", title: "Delaware Court of Chancery", shortTitle: "Chancery", version: "2026.06-prototype", effectiveFrom: "2026-06-01",
  authorityType: "TRIBUNAL", jurisdiction: "Delaware Court of Chancery", publisher: "Delaware Court of Chancery", sourceUrl: SOURCES.chancery,
  description: "Tribunal overlay for attorney admission and Delaware-counsel responsibilities. Apply alongside, not instead of, the Delaware professional-conduct pack.",
  rules: [
    {
      id: "de-chancery.170.delaware-counsel", correspondsTo: null, title: "Delaware counsel responsibility",
      summary: "A Chancery appearance involving outside counsel requires confirmation of Delaware counsel and the responsibilities imposed by Rule 170.",
      citation: "Delaware Court of Chancery Rule 170", sourceUrl: SOURCES.chancery,
      condition: { all: [fact("tribunal", "equals", "DELAWARE_CHANCERY"), fact("delawareCounselConfirmed", "equals", false)] },
      finding: { code: "CHANCERY_DELAWARE_COUNSEL_UNCONFIRMED", message: "Confirm Delaware counsel and the allocation of Rule 170 responsibilities.", reviewRequired: true },
      unknownQuestions: [{ fact: "delawareCounselConfirmed", prompt: "Has responsible Delaware counsel been confirmed for this Chancery matter?" }],
    },
    {
      id: "de-chancery.170.pro-hac-vice", correspondsTo: null, title: "Pro hac vice status",
      summary: "Outside counsel’s admission status and agreement to follow Delaware requirements must be established for the matter.",
      citation: "Delaware Court of Chancery Rule 170", sourceUrl: SOURCES.chancery,
      condition: { all: [fact("tribunal", "equals", "DELAWARE_CHANCERY"), fact("outsideCounselPresent", "equals", true), fact("proHacViceStatus", "not_equals", "ACTIVE")] },
      finding: { code: "CHANCERY_PRO_HAC_VICE_REVIEW", message: "Confirm pro hac vice admission and continuing compliance before outside counsel appears.", reviewRequired: true },
      unknownQuestions: [{ fact: "outsideCounselPresent", prompt: "Will any lawyer who is not admitted in Delaware appear in this matter?" }, { fact: "proHacViceStatus", prompt: "What is each outside lawyer’s pro hac vice status?" }],
    },
  ],
});

export const LEGAL_POLICY_PACKS = Object.freeze([ABA_MODEL_PACK, MARYLAND_PACK, VIRGINIA_PACK, DC_PACK, DELAWARE_PACK, DELAWARE_CHANCERY_PACK]);
export const LEGAL_POLICY_PACK_BY_ID = Object.freeze(Object.fromEntries(LEGAL_POLICY_PACKS.map((item) => [item.id, item])));

export function getLegalPolicyPack(id) {
  const result = LEGAL_POLICY_PACK_BY_ID[id];
  if (!result) throw new Error(`Unknown legal policy pack: ${id}`);
  return result;
}

