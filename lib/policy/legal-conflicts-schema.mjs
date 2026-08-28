const GROUPS = Object.freeze({
  current: "Current clients and consentability",
  specific: "Specific client transactions and interests",
  mobility: "Former clients, imputation, and mobility",
  public: "Government service and third-party neutrals",
  intake: "Organizations and prospective clients",
  litigation: "Litigation roles and limited services",
  choice: "Choice of law and conflict-check disclosure",
  chancery: "Delaware Court of Chancery admission",
});

const booleanFact = (id, label, group, description = null) => ({ id, type:"BOOLEAN", label, group, description });
const enumFact = (id, label, group, values, description = null) => ({ id, type:"ENUM", label, group, description, options:values.map((value) => ({ value, label:value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase()) })) });

export const LEGAL_CONFLICT_FACT_DEFINITIONS = Object.freeze([
  booleanFact("currentClientAdversity", "Is the proposed representation directly adverse to a current client?", GROUPS.current),
  booleanFact("materialLimitationRisk", "Is there a significant risk that another duty or personal interest will materially limit the representation?", GROUPS.current),
  booleanFact("sameProceedingAdverseClients", "Would the lawyer assert one current client’s claim against another current client in the same proceeding?", GROUPS.current),
  booleanFact("representationProhibitedByLaw", "Is the representation prohibited by law?", GROUPS.current),
  booleanFact("reasonablyBelievesCompetentDiligent", "Does the lawyer reasonably believe competent and diligent representation can be provided to every affected client?", GROUPS.current),
  booleanFact("informedConsentAllAffected", "Has every affected client given informed consent?", GROUPS.current),
  booleanFact("consentConfirmedInWriting", "Is each affected client’s informed consent confirmed in writing?", GROUPS.current),
  booleanFact("clientConsentAfterConsultation", "Has each affected client consented after consultation?", GROUPS.current),
  booleanFact("consentMemorializedInWriting", "Has the client consent been memorialized in writing?", GROUPS.current),
  booleanFact("clientConsentAfterFullDisclosure", "Has each affected client consented after full disclosure?", GROUPS.current),

  booleanFact("businessTransactionWithClient", "Is the lawyer entering a business transaction with a client or acquiring an adverse pecuniary interest?", GROUPS.specific),
  booleanFact("businessTermsFairReasonable", "Are the transaction and terms fair and reasonable to the client?", GROUPS.specific),
  booleanFact("businessTermsDisclosedInWriting", "Are the terms fully disclosed in an understandable writing?", GROUPS.specific),
  booleanFact("independentCounselAdvisedInWriting", "Was the client advised in writing to seek independent legal counsel?", GROUPS.specific),
  booleanFact("reasonableOpportunityIndependentCounsel", "Was the client given a reasonable opportunity to consult independent counsel?", GROUPS.specific),
  booleanFact("clientSignedTransactionConsent", "Did the client sign an informed-consent writing covering the terms and the lawyer’s role?", GROUPS.specific),
  booleanFact("clientInformationUsedToDisadvantage", "Would client information be used to the client’s disadvantage?", GROUPS.specific),
  booleanFact("informationUseConsent", "Has the client consented to that use of information?", GROUPS.specific),
  booleanFact("substantialClientGift", "Is the lawyer soliciting or preparing an instrument for a substantial client gift?", GROUPS.specific),
  booleanFact("giftRecipientRelatedToClient", "Is the recipient related to the client within the rule’s exception?", GROUPS.specific),
  booleanFact("literaryMediaRightsBeforeConclusion", "Would the lawyer obtain literary or media rights before the representation concludes?", GROUPS.specific),
  booleanFact("financialAssistanceToClient", "Would the lawyer provide financial assistance connected to litigation?", GROUPS.specific),
  booleanFact("financialAssistanceException", "Does an express costs, indigent-client, or other jurisdictional exception apply?", GROUPS.specific),
  booleanFact("thirdPartyCompensation", "Will someone other than the client compensate the lawyer?", GROUPS.specific),
  booleanFact("payorArrangementClientConsent", "Has the client consented to the third-party compensation arrangement?", GROUPS.specific),
  booleanFact("noProfessionalJudgmentInterference", "Does the arrangement preserve independent professional judgment and the client-lawyer relationship?", GROUPS.specific),
  booleanFact("clientInformationProtected", "Will client information remain protected as required by the confidentiality rule?", GROUPS.specific),
  booleanFact("aggregateSettlement", "Is this an aggregate settlement or aggregated plea agreement for multiple clients?", GROUPS.specific),
  booleanFact("aggregateDisclosureComplete", "Has each client received the required disclosure of claims, pleas, and participation?", GROUPS.specific),
  booleanFact("aggregateConsentSigned", "Has each client signed the required consent writing?", GROUPS.specific),
  booleanFact("aggregateConsentAfterConsultation", "Has each client consented after the required consultation and disclosure?", GROUPS.specific),
  booleanFact("prospectiveMalpracticeLimitation", "Would the engagement prospectively limit the lawyer’s malpractice liability?", GROUPS.specific),
  booleanFact("clientIndependentlyRepresented", "Is the client independently represented for the agreement?", GROUPS.specific),
  booleanFact("malpracticeClaimSettlement", "Would the lawyer settle a malpractice claim with an unrepresented client or former client?", GROUPS.specific),
  booleanFact("independentCounselAdviceForSettlement", "Was the person advised in writing to seek independent counsel and given a reasonable opportunity to do so?", GROUPS.specific),
  booleanFact("proprietaryInterestInLitigation", "Would the lawyer acquire a proprietary interest in the litigation or its subject matter?", GROUPS.specific),
  booleanFact("proprietaryInterestException", "Is the interest an authorized lien or permitted contingent fee?", GROUPS.specific),
  booleanFact("sexualRelationshipWithClient", "Is there a sexual relationship with a current client?", GROUPS.specific),
  booleanFact("sexualRelationshipPreexisting", "Did a consensual sexual relationship predate the client-lawyer relationship?", GROUPS.specific),
  booleanFact("relatedOpposingLawyers", "Are opposing lawyers closely related or intimately involved?", GROUPS.specific),
  booleanFact("relationshipConflictClientConsent", "Did the client consent after consultation about the lawyers’ relationship?", GROUPS.specific),
  booleanFact("clientFileLien", "Would the lawyer impose or enforce a lien against any part of a D.C. client’s file?", GROUPS.specific),
  booleanFact("retainedFileIsLawyerWorkProduct", "Is every retained item the lawyer’s own work product?", GROUPS.specific),
  booleanFact("retainedWorkProductUnpaid", "Is the retained work product unpaid?", GROUPS.specific),
  booleanFact("clientCanPayRetainedWorkProduct", "Is the client able to pay for the retained work product?", GROUPS.specific),
  booleanFact("retentionNoIrreparableHarmRisk", "Would withholding the work product avoid a significant risk of irreparable harm to the client?", GROUPS.specific),

  booleanFact("formerClientAdversity", "Is the proposed client materially adverse to a former client?", GROUPS.mobility),
  booleanFact("sameOrSubstantiallyRelatedMatter", "Is the new matter the same as or substantially related to the former matter?", GROUPS.mobility),
  booleanFact("formerClientConsent", "Has the former client consented to the representation?", GROUPS.mobility),
  booleanFact("formerClientConsentInWriting", "Is the former client’s consent in the form required by this jurisdiction?", GROUPS.mobility),
  booleanFact("materialFormerClientInformation", "Does the lawyer possess protected former-client information material to the matter?", GROUPS.mobility),
  booleanFact("imputedFirmConflict", "Is a lawyer’s personal current- or former-client conflict potentially imputed to the firm?", GROUPS.mobility),
  booleanFact("personalInterestImputationException", "Is the conflict purely personal and unlikely to materially limit the remaining lawyers?", GROUPS.mobility),
  booleanFact("lateralFormerFirmConflict", "Does an incoming lawyer’s former-firm matter create a lateral conflict?", GROUPS.mobility),
  booleanFact("timelyScreenImplemented", "Was an effective screen implemented promptly?", GROUPS.mobility),
  booleanFact("screenedLawyerNoMatterFee", "Is the screened lawyer apportioned no part of the matter’s fee where required?", GROUPS.mobility),
  booleanFact("requiredWrittenNoticeProvided", "Was the required written notice provided promptly?", GROUPS.mobility),
  booleanFact("screenComplianceCertified", "Were required screening certifications or undertakings completed?", GROUPS.mobility),
  booleanFact("dcLateralNoticeDescribesScreenAndCompliance", "Does the D.C. lateral notice describe the screening procedures and state compliance with the Rules?", GROUPS.mobility),
  booleanFact("formerClientRequestedConfidentialNotice", "Did the former client request that the fact and subject of the D.C. lateral representation remain confidential?", GROUPS.mobility),
  booleanFact("sealedNoticePreparedForDisciplinaryCounsel", "Was the required notice prepared concurrently for filing under seal with D.C. Disciplinary Counsel?", GROUPS.mobility),
  booleanFact("departedLawyerFormerClientMatter", "Did a departed lawyer represent the former client in the same or a substantially related matter?", GROUPS.mobility),
  booleanFact("remainingLawyerMaterialInformation", "Does a lawyer remaining at the firm possess protected information material to the matter?", GROUPS.mobility),
  booleanFact("formerClientInformationUseOrDisclosure", "Would protected former-client information be used or revealed outside an exception?", GROUPS.mobility),

  booleanFact("formerGovernmentServiceIntersection", "Does prior government service intersect the proposed matter or a party?", GROUPS.public),
  booleanFact("formerGovernmentSameMatter", "Did a former government lawyer participate personally and substantially in this matter?", GROUPS.public),
  booleanFact("governmentAgencyConsent", "Has the appropriate government agency given the required consent?", GROUPS.public),
  booleanFact("governmentConsentInWriting", "Is the government consent confirmed in the required writing?", GROUPS.public),
  booleanFact("confidentialGovernmentInformationRisk", "Does the lawyer have confidential government information usable to a person’s material disadvantage?", GROUPS.public),
  booleanFact("currentGovernmentPriorPrivateMatter", "Is a current government lawyer participating in a matter handled personally and substantially in private practice?", GROUPS.public),
  booleanFact("privateClientAndAgencyConsent", "Have the private client and government agency supplied every required consent?", GROUPS.public),
  booleanFact("governmentLawyerEmploymentNegotiation", "Is a government lawyer negotiating employment with a party or lawyer in a matter in which the government lawyer participates?", GROUPS.public),
  booleanFact("formerNeutralSameMatter", "Did the lawyer participate personally and substantially as judge, law clerk, arbitrator, mediator, or other neutral in this matter?", GROUPS.public),
  booleanFact("allProceedingPartiesConsent", "Have all parties to the proceeding given the required consent?", GROUPS.public),
  booleanFact("allPartiesConsentInWriting", "Is every party’s consent confirmed in the required writing?", GROUPS.public),
  booleanFact("neutralEmploymentNegotiation", "Is a judge, neutral, or law clerk negotiating employment with a party or lawyer in a matter in which the lawyer participates?", GROUPS.public),
  booleanFact("lawClerkNotifiedJudge", "If the lawyer is a law clerk, was the judge or adjudicative officer notified before employment negotiations?", GROUPS.public),

  booleanFact("organizationConstituentDualRepresentation", "Would counsel represent both an organization and one of its constituents?", GROUPS.intake),
  booleanFact("organizationConsentByDisinterestedAuthority", "Was any organizational consent given by an appropriate disinterested official or shareholders?", GROUPS.intake),
  booleanFact("prospectiveClientAdversity", "Would the representation be materially adverse to a prospective client in the same or a substantially related matter?", GROUPS.intake),
  booleanFact("prospectiveClientDisqualifyingInformation", "Did the lawyer receive significantly harmful information, or a confidence or secret under the selected rule?", GROUPS.intake),
  booleanFact("prospectiveClientAndAffectedClientConsent", "Have the prospective client and affected client both given the required consent?", GROUPS.intake),
  booleanFact("prospectiveConsentInWriting", "Is the prospective-client consent in the form required by this jurisdiction?", GROUPS.intake),
  booleanFact("reasonableMeasuresLimitedExposure", "Did the consulted lawyer take reasonable measures to avoid unnecessary exposure to disqualifying information?", GROUPS.intake),
  booleanFact("prospectiveScreenBelievedEffective", "Does the lawyer reasonably believe the prospective-client screen will protect the information?", GROUPS.intake),

  booleanFact("lawyerNecessaryWitness", "Is a lawyer likely to be a necessary witness at trial?", GROUPS.litigation),
  booleanFact("witnessTestimonyUncontested", "Will the lawyer’s testimony concern an uncontested issue?", GROUPS.litigation),
  booleanFact("witnessTestimonyLegalServices", "Will the testimony concern the nature or value of legal services?", GROUPS.litigation),
  booleanFact("witnessDisqualificationHardship", "Would disqualification work a substantial hardship on the client?", GROUPS.litigation),
  booleanFact("firmLawyerWitnessConflict", "Would another firm lawyer’s testimony independently create a Rule 1.7 or 1.9 conflict?", GROUPS.litigation),
  booleanFact("limitedServicesProgram", "Is this short-term limited service through a qualifying nonprofit or court program?", GROUPS.litigation),
  booleanFact("lawyerActuallyKnowsPersonalConflict", "Does the limited-service lawyer actually know of a personal current- or former-client conflict?", GROUPS.litigation),
  booleanFact("lawyerActuallyKnowsFirmConflict", "Does the limited-service lawyer actually know that the firm is disqualified?", GROUPS.litigation),

  booleanFact("conflictCheckDisclosure", "Will client information be disclosed to detect or resolve conflicts during a lawyer or firm transition?", GROUPS.choice),
  booleanFact("disclosureCompromisesPrivilege", "Would that disclosure compromise attorney-client privilege?", GROUPS.choice),
  booleanFact("disclosurePrejudicesClient", "Would that disclosure otherwise prejudice the client?", GROUPS.choice),
  booleanFact("choiceOfLawUncertain", "Is the governing professional-conduct jurisdiction unresolved?", GROUPS.choice),
  booleanFact("matterBeforeTribunal", "Is the conduct connected to a matter pending before a tribunal?", GROUPS.choice),
  booleanFact("tribunalRulesIdentified", "Have the tribunal’s jurisdiction and any tribunal-specific rules been identified?", GROUPS.choice),
  booleanFact("predominantEffectJurisdictionIdentified", "For non-tribunal conduct, has the jurisdiction of predominant effect been identified?", GROUPS.choice),
  booleanFact("reasonableBeliefPredominantEffect", "Is the lawyer’s choice supported by a reasonable belief about where the predominant effect will occur?", GROUPS.choice),

  enumFact("tribunal", "Tribunal", GROUPS.chancery, ["DELAWARE_CHANCERY"]),
  booleanFact("delawareCounselConfirmed", "Has responsible Delaware counsel been confirmed?", GROUPS.chancery),
  booleanFact("outsideCounselPresent", "Will a lawyer not admitted in Delaware appear?", GROUPS.chancery),
  enumFact("proHacViceStatus", "Outside lawyer’s pro hac vice status", GROUPS.chancery, ["ACTIVE", "PENDING", "DENIED", "EXPIRED", "NOT_STARTED"]),
  booleanFact("outsideCounselDelawareUndertaking", "Has outside counsel completed the Delaware-rule and jurisdiction undertaking?", GROUPS.chancery),
]);

export const LEGAL_CONFLICT_FACT_BY_ID = Object.freeze(Object.fromEntries(LEGAL_CONFLICT_FACT_DEFINITIONS.map((definition) => [definition.id, definition])));

export const DERIVED_CONFLICT_FACTS = Object.freeze({
  CURRENT_CLIENT_ADVERSITY:"currentClientAdversity",
  SAME_MATTER_ADVERSE_POSITIONS:"sameProceedingAdverseClients",
  PERSONAL_INTEREST:"materialLimitationRisk",
  FINANCIAL_INTEREST:"materialLimitationRisk",
  FIDUCIARY_RESPONSIBILITY:"materialLimitationRisk",
  FAMILY_CONNECTION:"materialLimitationRisk",
  OUTSIDE_RESPONSIBILITY:"materialLimitationRisk",
  FORMER_CLIENT_INTERSECTION:"formerClientAdversity",
  FORMER_GOVERNMENT_INTERSECTION:"formerGovernmentServiceIntersection",
  PROSPECTIVE_CLIENT_INTERSECTION:"prospectiveClientAdversity",
});

export function validateLegalConflictContext(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Policy question context must be an object");
  const result = {};
  for (const [key, fact] of Object.entries(value)) {
    const definition = LEGAL_CONFLICT_FACT_BY_ID[key];
    if (!definition) throw new Error(`Unsupported policy context fact: ${key}`);
    if (definition.type === "BOOLEAN" && typeof fact !== "boolean") throw new Error(`${key} must be a boolean`);
    if (definition.type === "ENUM" && !definition.options.some((option) => option.value === fact)) throw new Error(`Unsupported ${key} value`);
    if (definition.type === "STRING" && typeof fact !== "string") throw new Error(`${key} must be a string`);
    if (definition.type === "NUMBER" && (typeof fact !== "number" || !Number.isFinite(fact))) throw new Error(`${key} must be a finite number`);
    result[key] = structuredClone(fact);
  }
  return result;
}
