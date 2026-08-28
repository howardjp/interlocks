import { compilePolicyPack, POLICY_DSL_VERSION } from "./policy-engine.mjs";
import { LEGAL_CONFLICT_FACT_BY_ID, LEGAL_CONFLICT_FACT_DEFINITIONS } from "./legal-conflicts-schema.mjs";

const SOURCES = Object.freeze({
  aba: "https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/model_rules_of_professional_conduct_table_of_contents/",
  maryland: "https://www.mdcourts.gov/attygrievance/rules",
  virginia: "https://vsb.org/Site/Site/about/rules-regulations/rpc-part6-sec2.aspx",
  dc: "https://www.dcbar.org/for-lawyers/legal-ethics/rules-of-professional-conduct",
  delaware: "https://courts.delaware.gov/odc/rules.aspx",
  chancery: "https://courts.delaware.gov/forms/download.aspx?id=160908",
});

const PHASES = Object.freeze({ DETECTION:"DETECTION", CONSENTABILITY:"CONSENTABILITY", MITIGATION:"MITIGATION", INFORMATION:"INFORMATION_HANDLING", CHOICE:"CHOICE_OF_LAW" });
const optionalFact = (path, value = true) => ({ predicate:{ path, operator:"equals", value, root:true, onMissing:"NOT_MATCHED" } });
const requiredFact = (path, value = true) => ({ predicate:{ path, operator:"equals", value, root:true } });
const all = (...expressions) => ({ all:expressions.flat() });
const any = (...expressions) => ({ any:expressions.flat() });
const not = (expression) => ({ not:expression });

function setFacts(ids, value = true) { return Object.fromEntries(ids.map((id) => [id, value])); }
function triggerExpression(spec) {
  const ids = spec.triggers || [spec.trigger];
  const expressions = ids.map((id) => optionalFact(id, spec.triggerValues?.[id] ?? spec.triggerValue ?? true));
  return spec.triggerMode === "ANY" ? any(expressions) : expressions.length === 1 ? expressions[0] : all(expressions);
}
function triggerMatchedFacts(spec) {
  const ids = spec.triggers || [spec.trigger];
  const valueFor = (id) => spec.triggerValues?.[id] ?? spec.triggerValue ?? true;
  return spec.triggerMode === "ANY" ? { [ids[0]]:valueFor(ids[0]), ...setFacts(ids.slice(1), false) } : Object.fromEntries(ids.map((id) => [id, valueFor(id)]));
}
function triggerNotMatchedFacts(spec) { return setFacts(spec.triggers || [spec.trigger], false); }
function question(fact) { return { fact, prompt:LEGAL_CONFLICT_FACT_BY_ID[fact]?.label || `Establish ${fact}.` }; }

const CONFORMANCE = {};
function remember(packId, ruleId, fixture) {
  if (!CONFORMANCE[packId]) CONFORMANCE[packId] = {};
  CONFORMANCE[packId][ruleId] = fixture;
}

function baseRule(profile, spec, condition, unknownQuestions = []) {
  return {
    id:`${profile.prefix}.${spec.key}`,
    correspondsTo:`aba.${spec.key}`,
    scope:"CONFLICT_CLEARANCE",
    topic:spec.topic,
    phase:spec.phase,
    severity:spec.severity || "REVIEW",
    title:spec.title,
    summary:spec.summary || spec.message,
    citation:profile.citation(profile.citationOverrides?.[spec.key] || spec.cite),
    sourceUrl:profile.sourceUrl,
    comparisonNote:spec.notes?.[profile.id] || profile.comparisonNote || null,
    condition,
    finding:{ code:`${profile.prefix.toUpperCase().replaceAll("-", "_")}_${spec.key.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_")}`, message:spec.message, reviewRequired:true },
    unknownQuestions,
  };
}

function detect(profile, spec) {
  const rule = baseRule(profile, spec, triggerExpression(spec));
  remember(profile.id, rule.id, { matched:triggerMatchedFacts(spec), notMatched:triggerNotMatchedFacts(spec), indeterminate:null });
  return rule;
}

function block(profile, spec) {
  const condition = all(triggerExpression(spec), requiredFact(spec.block));
  const rule = baseRule(profile, spec, condition, [question(spec.block)]);
  remember(profile.id, rule.id, { matched:{ ...triggerMatchedFacts(spec), [spec.block]:true }, notMatched:triggerNotMatchedFacts(spec), indeterminate:triggerMatchedFacts(spec) });
  return rule;
}

function requireFacts(profile, spec) {
  const requirements = spec.requirements.map((item) => typeof item === "string" ? { fact:item, value:true } : item);
  const satisfied = all(requirements.map((item) => requiredFact(item.fact, item.value)));
  const rule = baseRule(profile, spec, all(triggerExpression(spec), not(satisfied)), requirements.map((item) => question(item.fact)));
  const matched = { ...triggerMatchedFacts(spec), ...Object.fromEntries(requirements.map((item, index) => [item.fact, index ? item.value : item.value === true ? false : true])) };
  const complete = { ...triggerMatchedFacts(spec), ...Object.fromEntries(requirements.map((item) => [item.fact, item.value])) };
  const indeterminate = { ...triggerMatchedFacts(spec), ...Object.fromEntries(requirements.slice(1).map((item) => [item.fact, item.value])) };
  remember(profile.id, rule.id, { matched, notMatched:complete, indeterminate });
  return rule;
}

function requireOneOf(profile, spec) {
  const alternatives = spec.alternatives.map((alternative) => alternative.map((item) => typeof item === "string" ? { fact:item, value:true } : item));
  const satisfied = any(alternatives.map((alternative) => all(alternative.map((item) => requiredFact(item.fact, item.value)))));
  const facts = [...new Set(alternatives.flat().map((item) => item.fact))];
  const rule = baseRule(profile, spec, all(triggerExpression(spec), not(satisfied)), facts.map(question));
  const matched = { ...triggerMatchedFacts(spec) };
  for (const alternative of alternatives) for (const [index, item] of alternative.entries()) matched[item.fact] = index ? item.value : item.value === true ? false : true;
  const notMatched = { ...triggerMatchedFacts(spec), ...Object.fromEntries(alternatives[0].map((item) => [item.fact, item.value])) };
  const indeterminate = { ...triggerMatchedFacts(spec) };
  for (const alternative of alternatives) for (const item of alternative.slice(1)) indeterminate[item.fact] = item.value;
  remember(profile.id, rule.id, { matched, notMatched, indeterminate });
  return rule;
}

function rulesFor(profile) {
  const rules = [];
  const addDetect = (spec) => rules.push(detect(profile, spec));
  const addBlock = (spec) => rules.push(block(profile, spec));
  const addRequire = (spec) => rules.push(requireFacts(profile, spec));
  const addAlternative = (spec) => rules.push(requireOneOf(profile, spec));
  const currentTriggers = ["currentClientAdversity", "materialLimitationRisk"];
  const generalConsent = profile.generalConsent;

  addDetect({ key:"1.7.current-client-adversity", cite:"1.7(a)(1)", topic:"CURRENT_CLIENTS", phase:PHASES.DETECTION, trigger:"currentClientAdversity", title:"Current-client adversity", message:"A proposed position is directly adverse to a current client. Determine consentability before accepting or continuing the representation." });
  addDetect({ key:"1.7.material-limitation", cite:"1.7(a)(2)", topic:"CURRENT_CLIENTS", phase:PHASES.DETECTION, trigger:"materialLimitationRisk", title:"Material-limitation risk", message:"Another duty, relationship, or personal interest may materially limit professional judgment. Human conflicts review is required." });
  if (profile.prohibitedByLawRule !== false) addBlock({ key:"1.7.prohibited-by-law", cite:"1.7(b)(2)", topic:"CURRENT_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:currentTriggers, triggerMode:"ANY", block:"representationProhibitedByLaw", title:"Representation prohibited by law", severity:"BLOCKING", message:"The representation is not consentable if governing law prohibits it." });
  addBlock({ key:"1.7.same-proceeding-claims", cite:profile.sameProceedingCitation || "1.7(b)(3)", topic:"CURRENT_CLIENTS", phase:PHASES.CONSENTABILITY, trigger:"currentClientAdversity", block:"sameProceedingAdverseClients", title:"Opposing current clients in one proceeding", severity:"BLOCKING", message:"The same lawyer may not assert one current client’s claim against another current client in the same proceeding under the selected rule." });
  addRequire({ key:"1.7.competent-diligent-belief", cite:"1.7(b)(1)", topic:"CURRENT_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:currentTriggers, triggerMode:"ANY", requirements:["reasonablyBelievesCompetentDiligent"], title:"Competent and diligent representation", message:"Record the lawyer’s reasonable belief that competent and diligent representation remains possible for every affected client." });
  addRequire({ key:"1.7.client-consent", cite:profile.generalConsentCitation || "1.7(b)(4)", topic:"CURRENT_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:currentTriggers, triggerMode:"ANY", requirements:generalConsent, title:"Affected-client consent", message:`Complete the ${profile.generalConsentLabel} required for every affected client.` });

  addRequire({ key:"1.8.a-business-transaction", cite:"1.8(a)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"businessTransactionWithClient", requirements:["businessTermsFairReasonable", "businessTermsDisclosedInWriting", ...profile.businessIndependentAdvice, "reasonableOpportunityIndependentCounsel", "clientSignedTransactionConsent"], title:"Business transaction with client", message:"A client business transaction cannot proceed until fairness, written disclosure, independent-counsel protections, and the required signed consent are established." });
  addRequire({ key:"1.8.b-information-use", cite:"1.8(b)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.INFORMATION, trigger:"clientInformationUsedToDisadvantage", requirements:["informationUseConsent"], title:"Use of client information", message:"Client information may not be used to the client’s disadvantage without the required consent or another express rule exception." });
  addRequire({ key:"1.8.c-substantial-gift", cite:"1.8(c)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"substantialClientGift", requirements:["giftRecipientRelatedToClient"], title:"Substantial client gift", severity:"BLOCKING", message:"A solicited or lawyer-prepared substantial gift requires the rule’s relationship exception; otherwise it is prohibited." });
  addDetect({ key:"1.8.d-literary-media-rights", cite:"1.8(d)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"literaryMediaRightsBeforeConclusion", title:"Literary or media rights", severity:"BLOCKING", message:"The lawyer may not acquire literary or media rights based substantially on the representation before the rule permits it." });
  addRequire({ key:"1.8.e-financial-assistance", cite:"1.8(e)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"financialAssistanceToClient", requirements:["financialAssistanceException"], title:"Financial assistance to client", message:"Confirm that the proposed financial assistance falls within an express jurisdictional exception." });
  addRequire({ key:"1.8.f-third-party-payor", cite:"1.8(f)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"thirdPartyCompensation", requirements:["payorArrangementClientConsent", "noProfessionalJudgmentInterference", "clientInformationProtected"], title:"Third-party compensation", message:"Third-party compensation requires client consent, protected independence, and continued confidentiality." });
  addRequire({ key:"1.8.g-aggregate-settlement", cite:"1.8(g)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"aggregateSettlement", requirements:["aggregateDisclosureComplete", profile.aggregateConsentFact], title:"Aggregate settlement or plea", message:`Complete the jurisdiction’s aggregate-settlement disclosure and ${profile.aggregateConsentLabel}.` });
  if (profile.malpracticeLimitationAbsolute) addDetect({ key:"1.8.h1-malpractice-limitation", cite:"1.8(h)(1)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"prospectiveMalpracticeLimitation", title:"Prospective malpractice limitation", severity:"BLOCKING", message:"The selected jurisdiction prohibits a prospective agreement limiting the lawyer’s malpractice liability." });
  else addRequire({ key:"1.8.h1-malpractice-limitation", cite:"1.8(h)(1)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"prospectiveMalpracticeLimitation", requirements:["clientIndependentlyRepresented"], title:"Prospective malpractice limitation", severity:"BLOCKING", message:"A prospective malpractice limitation requires the client to be independently represented where the rule permits the agreement at all." });
  addRequire({ key:"1.8.h2-malpractice-settlement", cite:"1.8(h)(2)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"malpracticeClaimSettlement", requirements:["independentCounselAdviceForSettlement"], title:"Settlement of malpractice claim", message:"Before settling with an unrepresented client or former client, complete the jurisdiction’s written independent-counsel advice and opportunity requirements." });
  if (profile.fileLienRule) addRequire({ key:"1.8.i-file-lien", cite:profile.fileLienRule, topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"clientFileLien", requirements:["retainedFileIsLawyerWorkProduct", "retainedWorkProductUnpaid", "clientCanPayRetainedWorkProduct", "retentionNoIrreparableHarmRisk"], title:"Lien against client file", severity:"BLOCKING", message:"A lien against a D.C. client file may retain only unpaid lawyer work product when the client can pay and withholding it creates no significant irreparable-harm risk." });
  else addRequire({ key:"1.8.i-proprietary-interest", cite:profile.proprietaryCitation || "1.8(i)", topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"proprietaryInterestInLitigation", requirements:["proprietaryInterestException"], title:"Proprietary interest in litigation", severity:"BLOCKING", message:"A proprietary interest in the litigation is prohibited unless an authorized lien or contingent-fee exception applies." });
  if (profile.sexualRelationshipRule) addRequire({ key:"1.8.j-sexual-relationship", cite:profile.sexualRelationshipRule, topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"sexualRelationshipWithClient", requirements:["sexualRelationshipPreexisting"], title:"Sexual relationship with client", severity:"BLOCKING", message:"The selected rule prohibits a client sexual relationship unless the stated preexisting-relationship exception applies." });
  if (profile.relatedLawyersRule) addRequire({ key:"1.8.related-opposing-lawyers", cite:profile.relatedLawyersRule, topic:"SPECIFIC_CONFLICTS", phase:PHASES.CONSENTABILITY, trigger:"relatedOpposingLawyers", requirements:["relationshipConflictClientConsent"], title:"Related opposing lawyers", message:"The client must be consulted and consent to the representation after disclosure of the opposing lawyers’ relationship." });
  addDetect({ key:"1.8.imputation", cite:profile.specificImputationCitation, topic:"SPECIFIC_CONFLICTS", phase:PHASES.DETECTION, trigger:"imputedFirmConflict", title:"Firmwide specific-conflict imputation", message:"Determine whether the applicable specific-client prohibition is imputed to associated lawyers and whether any paragraph-specific exception applies." });

  addRequire({ key:"1.9.a-former-client", cite:"1.9(a)", topic:"FORMER_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:["formerClientAdversity", "sameOrSubstantiallyRelatedMatter"], requirements:profile.formerClientConsent, title:"Former-client adversity", message:`Obtain and preserve the ${profile.formerClientConsentLabel} before undertaking a materially adverse same or substantially related matter.` });
  addRequire({ key:"1.9.b-former-firm-client", cite:"1.9(b)", topic:"FORMER_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:["lateralFormerFirmConflict", "materialFormerClientInformation"], requirements:profile.formerClientConsent, title:"Incoming lawyer’s former-firm client", message:"A lateral lawyer’s former-firm matter requires the selected rule’s former-client consent unless an applicable screening route removes firmwide imputation." });
  addDetect({ key:"1.9.c-former-client-information", cite:"1.9(c)", topic:"FORMER_CLIENTS", phase:PHASES.INFORMATION, trigger:"formerClientInformationUseOrDisclosure", title:"Former-client information", severity:"BLOCKING", message:"Protected former-client information may not be used or revealed outside a rule-authorized exception." });
  addAlternative({ key:"1.10.a-imputation", cite:"1.10(a)", topic:"IMPUTATION", phase:PHASES.CONSENTABILITY, trigger:"imputedFirmConflict", alternatives:[["personalInterestImputationException"], profile.generalConsent], title:"Imputed current- or former-client conflict", message:"Establish a personal-interest exception or the affected client’s valid waiver; otherwise the individual conflict is imputed to the firm." });
  if (profile.privateLateralScreening) addRequire({ key:"1.10.lateral-screen", cite:profile.privateLateralCitation, topic:"IMPUTATION", phase:PHASES.MITIGATION, trigger:"lateralFormerFirmConflict", requirements:profile.privateLateralRequirements, title:"Private lateral screening", message:"Complete every screening, fee, notice, and certification element required to avoid lateral imputation." });
  else addRequire({ key:"1.10.lateral-consent", cite:"1.10(c)", topic:"IMPUTATION", phase:PHASES.CONSENTABILITY, trigger:"lateralFormerFirmConflict", requirements:profile.formerClientConsent, title:"Lateral conflict waiver", message:"This jurisdiction’s pack does not treat a private lateral screen as a standalone cure; obtain the affected client consent required by the rule." });
  if (profile.confidentialLateralNoticeRule) addRequire({ key:"1.10.confidential-lateral-notice", cite:profile.confidentialLateralNoticeRule, topic:"IMPUTATION", phase:PHASES.INFORMATION, trigger:"formerClientRequestedConfidentialNotice", requirements:["sealedNoticePreparedForDisciplinaryCounsel"], title:"Confidential lateral notice", message:"When the former client requests confidentiality, prepare the lateral-screen notice concurrently for filing under seal with D.C. Disciplinary Counsel." });
  addBlock({ key:"1.10.departed-lawyer", cite:"1.10(b)", topic:"IMPUTATION", phase:PHASES.DETECTION, trigger:"departedLawyerFormerClientMatter", block:"remainingLawyerMaterialInformation", title:"Departed lawyer’s former client", message:"The former firm remains restricted where a remaining lawyer possesses protected information material to the same or substantially related adverse matter." });

  addDetect({ key:"1.11.former-government-intersection", cite:"1.11", topic:"GOVERNMENT", phase:PHASES.DETECTION, trigger:"formerGovernmentServiceIntersection", title:"Prior government service intersection", message:"Prior government service intersects the proposed matter or a party. Establish personal and substantial participation, information risk, and any agency-specific rules." });
  addRequire({ key:"1.11.former-government", cite:"1.11(a)–(b)", topic:"GOVERNMENT", phase:PHASES.CONSENTABILITY, trigger:"formerGovernmentSameMatter", requirements:profile.governmentConsent, title:"Former government participation", message:"A former government lawyer’s personal and substantial participation requires the selected agency consent or withdrawal of the lawyer from the matter." });
  addRequire({ key:"1.11.former-government-screen", cite:"1.11(b)", topic:"GOVERNMENT", phase:PHASES.MITIGATION, trigger:"formerGovernmentSameMatter", requirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"], title:"Former government lawyer screen", message:"The firm must complete the government-lawyer screen, fee restriction, and agency notice before continuing." });
  addRequire({ key:"1.11.confidential-government-information", cite:"1.11(c)", topic:"GOVERNMENT", phase:PHASES.INFORMATION, trigger:"confidentialGovernmentInformationRisk", requirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee"], title:"Confidential government information", message:"A lawyer with confidential government information must not personally act adversely, and the firm must complete the required screen and fee restriction." });
  addRequire({ key:"1.11.current-government-prior-matter", cite:"1.11(d)(2)(i)", topic:"GOVERNMENT", phase:PHASES.CONSENTABILITY, trigger:"currentGovernmentPriorPrivateMatter", requirements:["privateClientAndAgencyConsent"], title:"Current government lawyer’s prior private matter", message:"Establish every consent required before a current government lawyer participates in a matter handled personally and substantially in private practice." });
  addDetect({ key:"1.11.employment-negotiation", cite:"1.11(d)(2)(ii)", topic:"GOVERNMENT", phase:PHASES.CONSENTABILITY, trigger:"governmentLawyerEmploymentNegotiation", title:"Government lawyer employment negotiation", severity:"BLOCKING", message:"A government lawyer may not negotiate employment with a party or lawyer in a matter in which the government lawyer participates, subject only to the law-clerk route." });
  addRequire({ key:"1.12.former-neutral", cite:"1.12(a)", topic:"NEUTRALS", phase:PHASES.CONSENTABILITY, trigger:"formerNeutralSameMatter", requirements:profile.neutralConsent, title:"Former judge, law clerk, or neutral", message:"Obtain every party’s required consent before a former adjudicator or neutral represents anyone in the same matter." });
  addRequire({ key:"1.12.former-neutral-screen", cite:"1.12(c)", topic:"NEUTRALS", phase:PHASES.MITIGATION, trigger:"formerNeutralSameMatter", requirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"], title:"Former-neutral firm screen", message:"The firm must timely screen the former neutral, prohibit matter-fee participation, and notify the parties and tribunal as required." });
  addRequire({ key:"1.12.employment-negotiation", cite:"1.12(b)", topic:"NEUTRALS", phase:PHASES.CONSENTABILITY, trigger:"neutralEmploymentNegotiation", requirements:["lawClerkNotifiedJudge"], title:"Neutral or law-clerk employment negotiation", message:"Employment negotiation is prohibited for a participating neutral; a participating law clerk must first notify the judge or adjudicative officer." });

  addRequire({ key:"1.13.g-dual-representation", cite:profile.organizationDualCitation, topic:"ORGANIZATIONS", phase:PHASES.CONSENTABILITY, trigger:"organizationConstituentDualRepresentation", requirements:[...generalConsent, "organizationConsentByDisinterestedAuthority"], title:"Organization and constituent dual representation", message:"Dual representation requires the general conflict consent and organizational approval from an appropriate disinterested decision-maker." });
  addDetect({ key:"1.16.conflict-withdrawal", cite:"1.16(a)(1)", topic:"WITHDRAWAL", phase:PHASES.MITIGATION, triggers:currentTriggers, triggerMode:"ANY", title:"Decline or withdraw if unresolved", message:"If the conflict is not validly resolved, the lawyer must decline the engagement or determine the withdrawal obligations for an existing representation." });
  addRequire({ key:"1.18.prospective-client", cite:"1.18(c)–(d)", topic:"PROSPECTIVE_CLIENTS", phase:PHASES.CONSENTABILITY, triggers:["prospectiveClientAdversity", "prospectiveClientDisqualifyingInformation"], requirements:profile.prospectiveResolution, title:"Prospective-client conflict", message:"Resolve the prospective-client conflict through the jurisdiction’s consent or screening route before accepting or continuing the adverse representation." });
  if (profile.prospectiveScreeningRequirements.length) addRequire({ key:"1.18.prospective-client-screen", cite:"1.18(d)", topic:"PROSPECTIVE_CLIENTS", phase:PHASES.MITIGATION, triggers:["prospectiveClientAdversity", "prospectiveClientDisqualifyingInformation"], requirements:profile.prospectiveScreeningRequirements, title:"Prospective-client screening route", message:"Complete every prerequisite, screen, fee, effectiveness, and notice element required by this jurisdiction’s prospective-client exception." });

  addAlternative({ key:"3.7.a-lawyer-witness", cite:"3.7(a)", topic:"LAWYER_WITNESS", phase:PHASES.CONSENTABILITY, trigger:"lawyerNecessaryWitness", alternatives:[["witnessTestimonyUncontested"], ["witnessTestimonyLegalServices"], ["witnessDisqualificationHardship"]], title:"Lawyer as necessary witness", message:"A lawyer who is likely to be a necessary trial witness may serve as advocate only if a jurisdictional exception is established." });
  addDetect({ key:"3.7.b-firm-witness-conflict", cite:"3.7(b)", topic:"LAWYER_WITNESS", phase:PHASES.DETECTION, trigger:"firmLawyerWitnessConflict", title:"Another firm lawyer as witness", message:"Another firm lawyer’s testimony does not automatically disqualify trial counsel, but any independent current- or former-client conflict still requires analysis." });
  addDetect({ key:"6.5.personal-actual-knowledge", cite:"6.5(a)(1)", topic:"LIMITED_SERVICES", phase:PHASES.DETECTION, triggers:["limitedServicesProgram", "lawyerActuallyKnowsPersonalConflict"], title:"Known conflict in limited services", message:"The limited-services exception does not excuse a conflict the participating lawyer actually knows exists." });
  addDetect({ key:"6.5.firm-actual-knowledge", cite:"6.5(a)(2)–(b)", topic:"LIMITED_SERVICES", phase:PHASES.DETECTION, triggers:["limitedServicesProgram", "lawyerActuallyKnowsFirmConflict"], title:"Known firm conflict in limited services", message:"Apply firmwide disqualification in the limited-services matter only to the extent the participating lawyer has the actual knowledge specified by the rule." });

  addBlock({ key:"1.6.conflict-check-disclosure", cite:profile.conflictDisclosureCitation, topic:"CONFIDENTIALITY", phase:PHASES.INFORMATION, trigger:"conflictCheckDisclosure", block:"disclosureCompromisesPrivilege", title:"Conflict-check disclosure and privilege", severity:"BLOCKING", message:"Do not disclose transition-related client information if the disclosure would compromise attorney-client privilege." });
  addBlock({ key:"1.6.conflict-check-prejudice", cite:profile.conflictDisclosureCitation, topic:"CONFIDENTIALITY", phase:PHASES.INFORMATION, trigger:"conflictCheckDisclosure", block:"disclosurePrejudicesClient", title:"Conflict-check disclosure and client prejudice", severity:"BLOCKING", message:"Do not disclose transition-related client information if the disclosure would otherwise prejudice the client." });
  addRequire({ key:"8.5.tribunal-choice-of-law", cite:"8.5(b)(1)", topic:"CHOICE_OF_LAW", phase:PHASES.CHOICE, triggers:["choiceOfLawUncertain", "matterBeforeTribunal"], requirements:["tribunalRulesIdentified"], title:"Tribunal choice of law", message:"Identify the rules of the jurisdiction where the tribunal sits and any rule by which the tribunal selects another authority." });
  addRequire({ key:"8.5.predominant-effect", cite:"8.5(b)(2)", topic:"CHOICE_OF_LAW", phase:PHASES.CHOICE, trigger:"choiceOfLawUncertain", requirements:["predominantEffectJurisdictionIdentified", "reasonableBeliefPredominantEffect"], title:"Non-tribunal predominant effect", message:"For non-tribunal conduct, identify the jurisdiction of predominant effect and document the lawyer’s reasonable choice-of-law belief." });
  return rules;
}

function marylandCitation(value) {
  const match = /^(\d+)\.(\d+)(.*)$/.exec(value);
  return match ? `Maryland Rule 19-30${match[1]}.${match[2]}${match[3]}` : `Maryland Rule ${value}`;
}

const PROFILES = Object.freeze([
  {
    id:"aba-model", prefix:"aba", title:"ABA Model Rules", shortTitle:"ABA", version:"2026.08-conflicts-prototype", effectiveFrom:"2026-08-01", authorityType:"MODEL", jurisdiction:"United States model", publisher:"American Bar Association", sourceUrl:SOURCES.aba,
    description:"Permanent provisional and comparative conflict-clearance baseline. It is not controlling law unless independently adopted.", citation:(value) => `ABA Model Rule ${value}`, comparisonNote:null,
    generalConsent:["informedConsentAllAffected", "consentConfirmedInWriting"], generalConsentLabel:"informed consent confirmed in writing", businessIndependentAdvice:["independentCounselAdvisedInWriting"], aggregateConsentFact:"aggregateConsentSigned", aggregateConsentLabel:"signed informed-consent writing", formerClientConsent:["formerClientConsent", "formerClientConsentInWriting"], formerClientConsentLabel:"former-client informed consent confirmed in writing", governmentConsent:["governmentAgencyConsent", "governmentConsentInWriting"], neutralConsent:["allProceedingPartiesConsent", "allPartiesConsentInWriting"], privateLateralScreening:true, privateLateralCitation:"1.10(a)(2)", privateLateralRequirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided", "screenComplianceCertified"], prospectiveResolution:["prospectiveClientAndAffectedClientConsent", "prospectiveConsentInWriting"], prospectiveScreeningRequirements:["reasonableMeasuresLimitedExposure", "timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"], sexualRelationshipRule:"1.8(j)", relatedLawyersRule:null, specificImputationCitation:"1.8(k)", proprietaryCitation:"1.8(i)", organizationDualCitation:"1.13(g)", conflictDisclosureCitation:"1.6(b)(7)",
  },
  {
    id:"maryland", prefix:"md", title:"Maryland Attorneys’ Rules of Professional Conduct", shortTitle:"Maryland", version:"2026.08-conflicts-prototype", effectiveFrom:"2026-08-01", authorityType:"LICENSING_JURISDICTION", jurisdiction:"Maryland", publisher:"Supreme Court of Maryland", sourceUrl:SOURCES.maryland,
    description:"Independent Maryland conflict-clearance snapshot spanning identification, consentability, imputation, screening, mobility, and choice of law.", citation:marylandCitation, comparisonNote:"Prototype Maryland mapping; validate current text and Maryland-specific comments before reliance.",
    generalConsent:["informedConsentAllAffected", "consentConfirmedInWriting"], generalConsentLabel:"informed consent confirmed in writing", businessIndependentAdvice:["independentCounselAdvisedInWriting"], aggregateConsentFact:"aggregateConsentSigned", aggregateConsentLabel:"signed informed-consent writing", formerClientConsent:["formerClientConsent", "formerClientConsentInWriting"], formerClientConsentLabel:"former-client informed consent confirmed in writing", governmentConsent:["governmentAgencyConsent", "governmentConsentInWriting"], neutralConsent:["allProceedingPartiesConsent", "allPartiesConsentInWriting"], privateLateralScreening:true, privateLateralCitation:"1.10(a)(2)", privateLateralRequirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided", "screenComplianceCertified"], prospectiveResolution:["prospectiveClientAndAffectedClientConsent", "prospectiveConsentInWriting"], prospectiveScreeningRequirements:["reasonableMeasuresLimitedExposure", "timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"], sexualRelationshipRule:"1.8(j)", relatedLawyersRule:null, specificImputationCitation:"1.8(k)", proprietaryCitation:"1.8(i)", organizationDualCitation:"1.13(g)", conflictDisclosureCitation:"1.6(b)(7)",
  },
  {
    id:"virginia", prefix:"va", title:"Virginia Rules of Professional Conduct", shortTitle:"Virginia", version:"2026.08-conflicts-prototype", effectiveFrom:"2026-07-27", authorityType:"LICENSING_JURISDICTION", jurisdiction:"Virginia", publisher:"Supreme Court of Virginia / Virginia State Bar", sourceUrl:SOURCES.virginia,
    description:"Independent Virginia conflict-clearance snapshot preserving its consent, prohibited-transaction, imputation, and screening differences.", citation:(value) => `Virginia Rule ${value}`, comparisonNote:"Virginia uses jurisdiction-specific consent-after-consultation, prohibited-transaction, and imputation formulations; compare the cited Virginia text rather than assuming ABA identity.",
    generalConsent:["clientConsentAfterConsultation", "consentMemorializedInWriting"], generalConsentLabel:"consent after consultation memorialized in writing", businessIndependentAdvice:[], aggregateConsentFact:"aggregateConsentAfterConsultation", aggregateConsentLabel:"consent after consultation and full aggregate disclosure", formerClientConsent:["formerClientConsent", "clientConsentAfterConsultation"], formerClientConsentLabel:"consent after consultation by the required clients", governmentConsent:["governmentAgencyConsent", "privateClientAndAgencyConsent"], neutralConsent:["allProceedingPartiesConsent"], privateLateralScreening:false, prospectiveResolution:["prospectiveClientAndAffectedClientConsent", "prospectiveConsentInWriting"], prospectiveScreeningRequirements:["reasonableMeasuresLimitedExposure", "timelyScreenImplemented", "prospectiveScreenBelievedEffective", "requiredWrittenNoticeProvided"], sexualRelationshipRule:null, relatedLawyersRule:"1.8(i)", specificImputationCitation:"1.8(k)", proprietaryCitation:"1.8(j)", organizationDualCitation:"1.13(e)", conflictDisclosureCitation:"Rules 1.6 and 1.9(c)",
  },
  {
    id:"district-of-columbia", prefix:"dc", title:"District of Columbia Rules of Professional Conduct", shortTitle:"D.C.", version:"2026.08-conflicts-prototype", effectiveFrom:"2025-09-15", authorityType:"LICENSING_JURISDICTION", jurisdiction:"District of Columbia", publisher:"District of Columbia Court of Appeals", sourceUrl:SOURCES.dc,
    description:"Independent D.C. conflict-clearance snapshot preserving D.C.’s Rule 1.7 structure and private-lateral and prospective-client screening routes.", citation:(value) => `D.C. Rule ${value}`, comparisonNote:"D.C. structures same-matter current-client adversity, consent, screening, and prospective-client duties differently from the ABA baseline.",
    citationOverrides:{
      "1.7.current-client-adversity":"1.7(b)(1)", "1.7.material-limitation":"1.7(b)(2)–(4)", "1.7.competent-diligent-belief":"1.7(c)(2)",
      "1.8.b-information-use":"1.6(a)(2)", "1.8.c-substantial-gift":"1.8(b)", "1.8.d-literary-media-rights":"1.8(c)", "1.8.e-financial-assistance":"1.8(d)",
      "1.8.f-third-party-payor":"1.8(e)", "1.8.g-aggregate-settlement":"1.8(f)", "1.8.h1-malpractice-limitation":"1.8(g)(1)", "1.8.h2-malpractice-settlement":"1.8(g)(2)",
    },
    prohibitedByLawRule:false, malpracticeLimitationAbsolute:true, fileLienRule:"1.8(i)",
    generalConsent:["clientConsentAfterFullDisclosure"], generalConsentLabel:"informed consent after full disclosure", generalConsentCitation:"1.7(c)(1)", sameProceedingCitation:"1.7(a)", businessIndependentAdvice:[], aggregateConsentFact:"aggregateConsentSigned", aggregateConsentLabel:"signed informed-consent writing", formerClientConsent:["formerClientConsent"], formerClientConsentLabel:"former-client informed consent", governmentConsent:["governmentAgencyConsent"], neutralConsent:["allProceedingPartiesConsent"], privateLateralScreening:true, privateLateralCitation:"1.10(b)(3)", privateLateralRequirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided", "dcLateralNoticeDescribesScreenAndCompliance"], confidentialLateralNoticeRule:"1.10(f)", prospectiveResolution:["prospectiveClientAndAffectedClientConsent"], prospectiveScreeningRequirements:["timelyScreenImplemented"], sexualRelationshipRule:null, relatedLawyersRule:"1.8(h)", specificImputationCitation:"1.8(j)", organizationDualCitation:"1.13(g)", conflictDisclosureCitation:"1.6(h)",
  },
  {
    id:"delaware", prefix:"de", title:"Delaware Lawyers’ Rules of Professional Conduct", shortTitle:"Delaware", version:"2026.08-conflicts-prototype", effectiveFrom:"2026-08-01", authorityType:"LICENSING_JURISDICTION", jurisdiction:"Delaware", publisher:"Supreme Court of Delaware", sourceUrl:SOURCES.delaware,
    description:"Independent Delaware conflict-clearance snapshot spanning client conflicts, imputation, mobility, public service, intake, and choice of law.", citation:(value) => `Delaware Lawyers’ Rule ${value}`, comparisonNote:"Prototype Delaware mapping; validate current Delaware text and state-specific amendments before reliance.",
    generalConsent:["informedConsentAllAffected", "consentConfirmedInWriting"], generalConsentLabel:"informed consent confirmed in writing", businessIndependentAdvice:["independentCounselAdvisedInWriting"], aggregateConsentFact:"aggregateConsentSigned", aggregateConsentLabel:"signed informed-consent writing", formerClientConsent:["formerClientConsent", "formerClientConsentInWriting"], formerClientConsentLabel:"former-client informed consent confirmed in writing", governmentConsent:["governmentAgencyConsent", "governmentConsentInWriting"], neutralConsent:["allProceedingPartiesConsent", "allPartiesConsentInWriting"], privateLateralScreening:true, privateLateralCitation:"1.10(a)(2)", privateLateralRequirements:["timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided", "screenComplianceCertified"], prospectiveResolution:["prospectiveClientAndAffectedClientConsent", "prospectiveConsentInWriting"], prospectiveScreeningRequirements:["reasonableMeasuresLimitedExposure", "timelyScreenImplemented", "screenedLawyerNoMatterFee", "requiredWrittenNoticeProvided"], sexualRelationshipRule:"1.8(j)", relatedLawyersRule:null, specificImputationCitation:"1.8(k)", proprietaryCitation:"1.8(i)", organizationDualCitation:"1.13(g)", conflictDisclosureCitation:"1.6(b)(7)",
  },
]);

function compileProfile(profile) {
  return compilePolicyPack({
    id:profile.id, title:profile.title, shortTitle:profile.shortTitle, version:profile.version, effectiveFrom:profile.effectiveFrom,
    authorityType:profile.authorityType, jurisdiction:profile.jurisdiction, publisher:profile.publisher, sourceUrl:profile.sourceUrl, description:profile.description,
    dslVersion:POLICY_DSL_VERSION, status:"PROTOTYPE_REVIEW_REQUIRED", coverageScope:"CONFLICT_CLEARANCE_ONLY", validationStatus:"NOT_SUBSTANTIVELY_VALIDATED",
    factDefinitions:LEGAL_CONFLICT_FACT_DEFINITIONS, rules:rulesFor(profile),
  });
}

export const [ABA_MODEL_PACK, MARYLAND_PACK, VIRGINIA_PACK, DC_PACK, DELAWARE_PACK] = PROFILES.map(compileProfile);

const CHANCERY_PROFILE = Object.freeze({ id:"delaware-chancery", prefix:"de-chancery", sourceUrl:SOURCES.chancery, citation:() => "Delaware Court of Chancery Rule 170", comparisonNote:"Tribunal overlay; apply alongside the Delaware Lawyers’ Rules of Professional Conduct." });
function chanceryRules() {
  return [
    requireFacts(CHANCERY_PROFILE, { key:"170.delaware-counsel", cite:"170", topic:"TRIBUNAL_ADMISSION", phase:PHASES.MITIGATION, trigger:"tribunal", triggerValue:"DELAWARE_CHANCERY", requirements:["delawareCounselConfirmed"], title:"Delaware counsel responsibility", message:"Confirm responsible Delaware counsel for the Court of Chancery matter." }),
    requireFacts(CHANCERY_PROFILE, { key:"170.pro-hac-vice", cite:"170", topic:"TRIBUNAL_ADMISSION", phase:PHASES.MITIGATION, trigger:"outsideCounselPresent", requirements:[{ fact:"proHacViceStatus", value:"ACTIVE" }], title:"Pro hac vice admission", message:"Outside counsel must have active pro hac vice admission before appearing in the Chancery matter." }),
    requireFacts(CHANCERY_PROFILE, { key:"170.delaware-undertaking", cite:"170", topic:"TRIBUNAL_ADMISSION", phase:PHASES.MITIGATION, trigger:"outsideCounselPresent", requirements:["outsideCounselDelawareUndertaking"], title:"Delaware rules and jurisdiction undertaking", message:"Record outside counsel’s required undertaking concerning Delaware rules, discipline, and related jurisdiction." }),
  ];
}

export const DELAWARE_CHANCERY_PACK = compilePolicyPack({
  id:"delaware-chancery", title:"Delaware Court of Chancery", shortTitle:"Chancery", version:"2026.08-conflicts-prototype", effectiveFrom:"2026-06-01", authorityType:"TRIBUNAL", jurisdiction:"Delaware Court of Chancery", publisher:"Delaware Court of Chancery", sourceUrl:SOURCES.chancery,
  description:"Rule 170 tribunal overlay for Delaware counsel and outside-lawyer admission. Apply alongside, not instead of, the Delaware professional-conduct pack.", dslVersion:POLICY_DSL_VERSION, status:"PROTOTYPE_REVIEW_REQUIRED", coverageScope:"CONFLICT_CLEARANCE_ONLY", validationStatus:"NOT_SUBSTANTIVELY_VALIDATED",
  factDefinitions:LEGAL_CONFLICT_FACT_DEFINITIONS.filter((definition) => definition.group === "Delaware Court of Chancery admission"), rules:chanceryRules(),
});

export const LEGAL_POLICY_PACKS = Object.freeze([ABA_MODEL_PACK, MARYLAND_PACK, VIRGINIA_PACK, DC_PACK, DELAWARE_PACK, DELAWARE_CHANCERY_PACK]);
export const LEGAL_POLICY_PACK_BY_ID = Object.freeze(Object.fromEntries(LEGAL_POLICY_PACKS.map((item) => [item.id, item])));
export const LEGAL_POLICY_CONFORMANCE_FIXTURES = Object.freeze(Object.fromEntries(Object.entries(CONFORMANCE).map(([packId, fixtures]) => [packId, Object.freeze(fixtures)])));

export function getLegalPolicyPack(id) {
  const result = LEGAL_POLICY_PACK_BY_ID[id];
  if (!result) throw new Error(`Unknown legal policy pack: ${id}`);
  return result;
}
