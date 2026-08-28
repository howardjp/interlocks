import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AuthorizationService, ACTIONS } from "../auth/authorization.mjs";
import { matchEntity, normalizeName, relatedMatch } from "../domain/entity-matching.mjs";
import { assertHumanDisposition, deriveWorkflowState } from "../domain/workflow-state.mjs";
import { getConfig } from "../config.mjs";
import { InMemoryObjectStore, LocalFilesystemObjectStore } from "../storage/object-store.mjs";
import { InterlocksRepository } from "./interlocks-repository.mjs";
import { migrateSqlite, RESOURCE_TYPES } from "./sqlite-migrations.mjs";

const RESOURCE_TABLES = Object.freeze({
  PERSON: "persons", ACCOUNT: "accounts", ENTITY: "entities", WORKSPACE: "workspaces",
  MEMBERSHIP: "workspace_memberships", MATTER: "matters", RELATIONSHIP: "professional_relationships",
  ASSERTION: "assertions", INFERENCE: "inferences", CONFLICT_CHECK: "conflict_checks",
  CONFLICT_HIT: "conflict_hits", REVIEW_CASE: "review_cases", DETERMINATION: "human_determinations",
  CONSENT: "conflict_consents", SCREEN: "screens", CONTROL: "controls",
  ASSOCIATED_PERSON_REQUEST: "associated_person_requests", IMPORT_BATCH: "import_batches",
  ADMINISTRATIVE_ACTION: "audit_events",
});

function isoNow() { return new Date().toISOString(); }
function addDays(days, origin = new Date()) { const date = new Date(origin); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }
function clean(value) { return typeof value === "string" ? value.trim() : value; }
function required(value, label) { const result = clean(value); if (!result) throw new Error(`${label} is required`); return result; }
function id(prefix) { return `${prefix}-${randomUUID()}`; }
function parse(value, fallback = {}) { try { return JSON.parse(value || ""); } catch { return fallback; } }
function upper(value) { return String(value || "").trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_"); }

function transaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try { const result = work(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}

function csvRows(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = ""; if (row.some((value) => value !== "")) rows.push(row); row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values, index) => ({ __row: index + 2, ...Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() || ""])) }));
}

export class SqliteInterlocksRepository extends InterlocksRepository {
  constructor(databasePath = process.env.INTERLOCKS_DB_PATH || ".data/interlocks.db", options = {}) {
    super();
    this.databasePath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (this.databasePath !== ":memory:") mkdirSync(dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.authorization = options.authorization || new AuthorizationService();
    this.objectStore = options.objectStore || (databasePath === ":memory:" ? new InMemoryObjectStore() : new LocalFilesystemObjectStore(options.objectStorePath || getConfig().objectStorePath));
    migrateSqlite(this.database);
    if (!this.database.prepare("SELECT 1 FROM persons LIMIT 1").get() && options.seed !== false) this.seedDemo();
    this.rebuildSearchIndex();
  }

  migrationState() { return this.database.prepare("SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version").all(); }
  corpusRevision() { return Number(this.database.prepare("SELECT corpus_revision AS revision FROM system_state WHERE id='global'").get().revision); }

  incrementCorpus(workspaceId, actor, reason) {
    this.database.prepare("UPDATE system_state SET corpus_revision=corpus_revision+1 WHERE id='global'").run();
    this.database.prepare("UPDATE review_cases SET workflow_state='YELLOW',updated_at=? WHERE workspace_id=? AND status NOT IN ('CLOSED','DECLINED','WITHDRAWN')").run(isoNow(), workspaceId);
    this.audit(actor, { authority: "KNOWLEDGE_EDITOR", workspaceId, action: "corpus.revised", resourceType: "WORKSPACE", resourceId: workspaceId, reason, after: { corpusRevision: this.corpusRevision() } });
  }

  seedDemo() {
    const db = this.database; const at = "2026-08-28T12:00:00.000Z";
    transaction(db, () => {
      const people = [
        ["p-alex", "Alex Morgan", "Ethics & Compliance Lead", "alex.morgan@example.org", "acct-alex", "SUPERADMIN"],
        ["p-maya", "Dr. Maya Chen", "Senior Research Scientist", "maya.chen@example.org", "acct-maya", "USER"],
        ["p-daniel", "Daniel Ortiz", "Strategic Sourcing Manager", "daniel.ortiz@example.org", "acct-daniel", "USER"],
        ["p-priya", "Priya Shah", "Program Director", "priya.shah@example.org", "acct-priya", "USER"],
        ["p-liam", "Liam Walker", "Associate General Counsel", "liam.walker@example.org", "acct-liam", "USER"],
        ["p-jordan", "Jordan Bell", "Principal Engineer", "jordan.bell@example.org", "acct-jordan", "USER"],
        ["p-nina", "Nina Basu", "External adviser", "nina.basu@example.org", "acct-nina", "USER"],
      ];
      for (const [personId, name, profession, email, accountId, platformRole] of people) {
        db.prepare("INSERT INTO persons (id,display_name,primary_profession,created_at,updated_at) VALUES (?,?,?,?,?)").run(personId, name, profession, at, at);
        db.prepare("INSERT INTO accounts (id,person_id,primary_email,status,platform_role,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?,?)").run(accountId, personId, email, platformRole, at, at);
        db.prepare("INSERT INTO auth_identities (id,account_id,provider,issuer,provider_subject,email_at_link_time,created_at,last_authenticated_at) VALUES (?,?,'development','interlocks-local',?,?,?,?)").run(`auth-${accountId}`, accountId, accountId, email, at, at);
        db.prepare("INSERT INTO entities (id,kind,canonical_name,person_id,created_at,updated_at) VALUES (?,'PERSON',?,?,?,?)").run(`ent-${personId}`, name, personId, at, at);
      }

      const organizations = [
        ["ent-northstar", "Northstar Advisory Group", "District of Columbia, US", "ORGANIZATION"],
        ["ent-blue-ridge", "Blue Ridge Legal Clinic", "Maryland, US", "ORGANIZATION"],
        ["o-meridian", "Meridian Analytics", "Delaware, US", "ORGANIZATION"],
        ["o-arcwell", "Arcwell Systems", "Virginia, US", "ORGANIZATION"],
        ["o-easton", "Easton University", "Massachusetts, US", "ORGANIZATION"],
        ["o-lantern", "Lantern Foundation", "New York, US", "ORGANIZATION"],
        ["o-civic", "CivicAI Council", "District of Columbia, US", "ORGANIZATION"],
        ["o-meridian-holdings", "Meridian Holdings, Inc.", "Delaware, US", "ORGANIZATION"],
        ["o-solar", "Solaris Dynamics", "Colorado, US", "ORGANIZATION"],
        ["gov-doe", "United States Department of Energy", "United States", "GOVERNMENT_BODY"],
      ];
      for (const [entityId, name, jurisdiction, kind] of organizations) db.prepare("INSERT INTO entities (id,kind,canonical_name,jurisdiction,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(entityId, kind, name, jurisdiction, at, at);
      db.prepare("INSERT INTO entities (id,kind,canonical_name,jurisdiction,created_at,updated_at) VALUES ('property-main','PROPERTY','123 Main Street','Maryland, US',?,?)").run(at, at);
      db.prepare("INSERT INTO entity_aliases (id,entity_id,alias,normalized_alias,source,created_at) VALUES ('alias-meridian','o-meridian','Meridian AI','meridian ai','Corporate filing',?)").run(at);
      db.prepare("INSERT INTO entity_aliases (id,entity_id,alias,normalized_alias,source,created_at) VALUES ('alias-jordan','ent-p-jordan','J. Bell','j bell','Self disclosure',?)").run(at);
      db.prepare("INSERT INTO entity_addresses (id,entity_id,label,address_text,normalized_address,created_at) VALUES ('addr-jordan','ent-p-jordan','Home','123 Main Street','123 main street',?)").run(at);
      db.prepare("INSERT INTO entity_addresses (id,entity_id,label,address_text,normalized_address,created_at) VALUES ('addr-property','property-main','Property','123 Main Street','123 main street',?)").run(at);
      db.prepare("INSERT INTO entity_relationships (id,from_entity_id,to_entity_id,relationship_type,recorded_at,provenance) VALUES ('er-meridian-parent','o-meridian','o-meridian-holdings','SUBSIDIARY_OF',?,'Annual report')").run(at);

      db.prepare("INSERT INTO workspaces (id,organization_entity_id,name,registration_mode,created_at,updated_at) VALUES ('ws-northstar','ent-northstar','Northstar Advisory Group','INVITE_ONLY',?,?)").run(at, at);
      db.prepare("INSERT INTO workspaces (id,organization_entity_id,name,registration_mode,created_at,updated_at) VALUES ('ws-blue-ridge','ent-blue-ridge','Blue Ridge Legal Clinic','INVITE_ONLY',?,?)").run(at, at);
      const memberships = [
        ["mem-alex-a", "ws-northstar", "acct-alex", "p-alex", ["MEMBER", "FIRMADMIN", "REVIEWER"]],
        ["mem-maya-a", "ws-northstar", "acct-maya", "p-maya", ["MEMBER"]],
        ["mem-daniel-a", "ws-northstar", "acct-daniel", "p-daniel", ["MEMBER", "FIRMADMIN"]],
        ["mem-priya-a", "ws-northstar", "acct-priya", "p-priya", ["MEMBER"]],
        ["mem-liam-a", "ws-northstar", "acct-liam", "p-liam", ["MEMBER", "REVIEWER"]],
        ["mem-jordan-a", "ws-northstar", "acct-jordan", "p-jordan", ["MEMBER"]],
        ["mem-alex-b", "ws-blue-ridge", "acct-alex", "p-alex", ["MEMBER", "FIRMADMIN"]],
      ];
      for (const [membershipId, workspaceId, accountId, personId, roles] of memberships) {
        db.prepare("INSERT INTO workspace_memberships (id,workspace_id,account_id,person_id,joined_at,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(membershipId, workspaceId, accountId, personId, at, at, at);
        for (const role of roles) db.prepare("INSERT INTO workspace_roles (membership_id,role) VALUES (?,?)").run(membershipId, role);
        db.prepare("INSERT INTO seat_events (id,workspace_id,membership_id,delta,reason,effective_at) VALUES (?,?,?,?,?,?)").run(`seat-${membershipId}`, workspaceId, membershipId, 1, "Initial active membership", at);
      }

      const matters = [
        ["m-aster", "AST-26-17", "Project Aster vendor selection", "PROCUREMENT", "EVALUATION", "p-daniel", "RESTRICTED"],
        ["m-helios", "HEL-26-04", "Helios research consortium", "SPONSORED_RESEARCH", "PROPOSAL", "p-priya", "ELEVATED"],
        ["m-northstar", "NTH-26-11", "Northstar technical hiring panel", "PERSONNEL", "INTERVIEWS", "p-jordan", "ELEVATED"],
        ["m-lantern", "LNT-26-02", "Lantern public-interest grant", "GRANT", "AWARD_REVIEW", "p-priya", "STANDARD"],
        ["m-civic", "CVC-26-08", "Responsible AI advisory statement", "EXTERNAL_ENGAGEMENT", "DRAFTING", "p-maya", "STANDARD"],
      ];
      for (const [matterId, code, title, type, stage, owner, sensitivity] of matters) db.prepare(`INSERT INTO matters (id,workspace_id,code,title,matter_type,stage,status,representation_status,owner_person_id,sensitivity,opened_at,created_at,updated_at) VALUES (?,'ws-northstar',?,?,?,?,'ACTIVE','ACTIVE',?,?,?,?,?)`).run(matterId, code, title, type, stage, owner, sensitivity, at, at, at);

      const parties = [["party-aster-meridian","m-aster","o-meridian","PROSPECTIVE_CLIENT"],["party-aster-arcwell","m-aster","o-arcwell","ADVERSE_PARTY"],["party-helios-easton","m-helios","o-easton","CLIENT"],["party-lantern","m-lantern","o-lantern","CLIENT"],["party-civic","m-civic","o-civic","CLIENT"]];
      for (const values of parties) db.prepare("INSERT INTO matter_parties (id,matter_id,entity_id,role,provenance,created_at) VALUES (?,?,?,?, 'Demo matter intake', ?)").run(...values, at);

      const relationships = [
        ["r-maya-meridian","p-maya","o-meridian","FIDUCIARY_ROLE","Unpaid board director with voting authority.","FIRM_ONLY"],
        ["r-daniel-arcwell","p-daniel","o-arcwell","FAMILY_EMPLOYMENT","Sibling is a regional sales director.","RESTRICTED"],
        ["r-priya-easton","p-priya","o-easton","GIFT_OR_HOSPITALITY","Accepted a $750 speaking honorarium.","PORTABLE"],
        ["r-jordan-lantern","p-jordan","o-lantern","FINANCIAL_INTEREST","Household owns a diversified fund with disclosed exposure.","PORTABLE"],
        ["r-maya-civic","p-maya","o-civic","OUTSIDE_EMPLOYMENT","Paid technical adviser, limited to two hours monthly.","PORTABLE"],
        ["r-jordan-doe","p-jordan","gov-doe","FORMER_GOVERNMENT_EMPLOYMENT","Former technical program manager.","PORTABLE"],
        ["r-jordan-property","p-jordan","property-main","PROPERTY_INTEREST","Household property interest at 123 Main Street.","FIRM_ONLY"],
      ];
      for (const [relationshipId, personId, entityId, type, description, disclosureClass] of relationships) {
        db.prepare("INSERT INTO professional_relationships (id,workspace_id,person_id,entity_id,relationship_type,description,effective_from,source,disclosure_class,status,recorded_at) VALUES (?,'ws-northstar',?,?,?,?, '2024-01-01','Self-disclosed',?,'CURRENT',?)").run(relationshipId, personId, entityId, type, description, disclosureClass, at);
        db.prepare("INSERT INTO assertions (id,workspace_id,subject_type,subject_id,predicate,object_type,object_id,object_text,confidentiality_scope,provenance,recorded_by,recorded_at,effective_from) VALUES (?,'ws-northstar','PERSON',?,'HAS_PROFESSIONAL_RELATIONSHIP','ENTITY',?,?,'WORKSPACE','Self-disclosed','acct-alex',?,'2024-01-01')").run(`assert-${relationshipId}`, personId, entityId, description, at);
        if (disclosureClass === "PORTABLE") db.prepare("INSERT INTO personal_ledger_entries (id,person_id,entity_id,relationship_id,context,involvement,source_workspace_id,source,provenance,disclosure_class,sharing_authorized,recorded_at) VALUES (?,?,?,?,?,?,'ws-northstar','Self-disclosed','Verified by account holder','PORTABLE',1,?)").run(`ledger-${relationshipId}`, personId, entityId, relationshipId, description, type, at);
      }
      db.prepare("INSERT INTO personal_ledger_entries (id,person_id,entity_id,context,involvement,source,provenance,disclosure_class,sharing_authorized,recorded_at) VALUES ('ledger-jordan-solar','p-jordan','o-solar','Prior representation of Solaris Dynamics','FORMER_CLIENT','Prior-firm portable export','Account holder authorized identity-only disclosure','PORTABLE',1,?)").run(at);

      const cases = [
        ["c-0041","INT-2026-0041","p-maya","m-aster","o-meridian","r-maya-meridian","Board role overlaps vendor evaluation","Maya serves on Meridian Analytics’ board and was named as a technical evaluator.","RED","SCREEN_REQUIRED","IN_REVIEW","acct-liam"],
        ["c-0040","INT-2026-0040","p-daniel","m-aster","o-arcwell","r-daniel-arcwell","Family tie to bidding supplier","Daniel’s sibling works for a bidder in the active procurement.","YELLOW","UNREVIEWED","AWAITING_RESPONSE","acct-alex"],
        ["c-0039","INT-2026-0039","p-priya","m-helios","o-easton","r-priya-easton","Honorarium from consortium member","A recent honorarium was disclosed before the proposal team was finalized.","YELLOW","UNREVIEWED","IN_REVIEW","acct-liam"],
        ["c-0038","INT-2026-0038","p-jordan","m-lantern","o-lantern","r-jordan-lantern","Indirect fund exposure to grantor","The holding is diversified and Jordan has no award role.","GREEN","NO_CONFLICT","CLOSED","acct-alex"],
        ["c-0037","INT-2026-0037","p-maya","m-civic","o-civic","r-maya-civic","Outside advisory work intersects statement","External advisory work intersects an organizational statement.","RED","CLEARED","MANAGED","acct-alex"],
      ];
      for (const values of cases) db.prepare("INSERT INTO review_cases (id,workspace_id,reference,person_id,matter_id,entity_id,relationship_id,title,summary,workflow_state,human_disposition,status,assigned_account_id,opened_at,review_due_at,updated_at) VALUES (?,'ws-northstar',?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...values, at, addDays(7, at), at);
      db.prepare("INSERT INTO human_determinations (id,case_id,disposition,rationale,rule_basis,jurisdiction,determined_by,determined_at) VALUES ('det-0038','c-0038','NO_CONFLICT','Reviewer found no material limitation after examining the diversified holding.','Firm policy COI-2','District of Columbia','acct-alex',?)").run(at);
      db.prepare("INSERT INTO human_determinations (id,case_id,disposition,rationale,rule_basis,jurisdiction,determined_by,determined_at) VALUES ('det-0037','c-0037','CLEARED','Permitted subject to authorship disclosure and independent approval.','Firm policy COI-4','District of Columbia','acct-alex',?)").run(at);
      const controls = [["ctl-01","c-0041","SCREEN","Remove Maya from scoring, deliberations, and evaluator notes.","p-daniel",1,"OPEN"],["ctl-02","c-0041","ACCESS","Confirm Aster permissions no longer include Maya.","p-alex",1,"OPEN"],["ctl-03","c-0040","CERTIFICATION","Obtain written non-participation certification from Daniel.","p-alex",1,"OPEN"],["ctl-04","c-0037","DISCLOSURE","Add the external role to the contributor note.","p-priya",1,"OPEN"],["ctl-05","c-0037","INDEPENDENT_APPROVAL","Route the final statement through Liam.","p-liam",1,"OPEN"],["ctl-06","c-0038","DOCUMENTATION","Record the diversification analysis.","p-alex",0,"COMPLETE"]];
      for (const values of controls) db.prepare("INSERT INTO controls (id,case_id,control_type,description,owner_person_id,mandatory,due_at,status,completed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(...values.slice(0, 6), addDays(7, at), values[6], values[6] === "COMPLETE" ? at : null, at);
      db.prepare("INSERT INTO review_notes (id,case_id,author_account_id,body,created_at) VALUES ('note-01','c-0041','acct-liam','Procurement confirmed Maya has not submitted an evaluator score.',?)").run(at);
      db.prepare("INSERT INTO audit_events (id,actor_account_id,actor_person_id,authority_used,workspace_scope,action,resource_type,resource_id,after_json,occurred_at,metadata_json) VALUES ('audit-seed','acct-alex','p-alex','SUPERADMIN','ws-northstar','workspace.seeded','WORKSPACE','ws-northstar','{}',?,'{}')").run(at);
      db.prepare("UPDATE system_state SET corpus_revision=1 WHERE id='global'").run();
    });
  }

  rebuildSearchIndex() {
    this.database.exec("DELETE FROM entity_search");
    const insert = this.database.prepare("INSERT INTO entity_search (entity_id,canonical_name,aliases) VALUES (?,?,?)");
    for (const entity of this.database.prepare("SELECT id,canonical_name FROM entities").all()) {
      const aliases = this.database.prepare("SELECT alias FROM entity_aliases WHERE entity_id=?").all(entity.id).map((item) => item.alias).join(" ");
      insert.run(entity.id, entity.canonical_name, aliases);
    }
  }

  getActor(accountId = "acct-alex") {
    const account = this.database.prepare("SELECT a.id AS accountId,a.person_id AS personId,a.primary_email AS email,a.status AS accountStatus,a.platform_role AS platformRole,p.display_name AS name,p.primary_profession AS title FROM accounts a JOIN persons p ON p.id=a.person_id WHERE a.id=?").get(accountId);
    if (!account) throw new Error("Account not found");
    const memberships = this.database.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.status,w.name AS workspaceName FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.account_id=? ORDER BY (SELECT COUNT(*) FROM review_cases c WHERE c.workspace_id=m.workspace_id) DESC,w.name").all(accountId).map((membership) => ({ ...membership, roles: this.database.prepare("SELECT role FROM workspace_roles WHERE membership_id=? ORDER BY role").all(membership.id).map((item) => item.role) }));
    return { ...account, memberships };
  }

  resolveExternalIdentity(identity, { registrationMode = getConfig().registrationMode } = {}) {
    const linked = this.database.prepare("SELECT account_id AS accountId FROM auth_identities WHERE issuer=? AND provider_subject=?").get(identity.issuer, identity.providerSubject);
    if (linked) { this.database.prepare("UPDATE auth_identities SET last_authenticated_at=? WHERE issuer=? AND provider_subject=?").run(isoNow(), identity.issuer, identity.providerSubject); return this.getActor(linked.accountId); }
    if (identity.provider === "development") return this.getActor(identity.providerSubject);
    const account = identity.email && this.database.prepare("SELECT id FROM accounts WHERE lower(primary_email)=lower(?) AND status IN ('INVITED','ACTIVE')").get(identity.email);
    if (!account && registrationMode !== "PUBLIC") { const error = new Error("An invitation is required for this account"); error.code = "INVITE_REQUIRED"; throw error; }
    const accountId = account?.id || id("acct");
    if (!account) {
      const personId = id("person"); const at = isoNow();
      transaction(this.database, () => {
        this.database.prepare("INSERT INTO persons (id,display_name,created_at,updated_at) VALUES (?,?,?,?)").run(personId, identity.displayName || identity.email, at, at);
        this.database.prepare("INSERT INTO accounts (id,person_id,primary_email,status,platform_role,created_at,updated_at) VALUES (?,?,?,'ACTIVE','USER',?,?)").run(accountId, personId, identity.email, at, at);
      });
    }
    this.database.prepare("INSERT INTO auth_identities (id,account_id,provider,issuer,provider_subject,email_at_link_time,created_at,last_authenticated_at) VALUES (?,?,?,?,?,?,?,?)").run(id("auth"), accountId, identity.provider, identity.issuer, identity.providerSubject, identity.email, isoNow(), isoNow());
    return this.getActor(accountId);
  }

  audit(actor, { authority, workspaceId = null, action, resourceType, resourceId, before = null, after = null, reason = null, metadata = {} }) {
    this.database.prepare("INSERT INTO audit_events (id,actor_account_id,actor_person_id,authority_used,workspace_scope,action,resource_type,resource_id,before_json,after_json,occurred_at,reason,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id("audit"), actor?.accountId || null, actor?.personId || null, authority || actor?.platformRole || "SYSTEM", workspaceId, action, resourceType, resourceId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), isoNow(), reason, JSON.stringify(metadata));
  }

  currentBillableSeats(workspaceId) { return Number(this.database.prepare("SELECT COUNT(*) AS count FROM workspace_memberships WHERE workspace_id=? AND status='ACTIVE'").get(workspaceId).count); }

  getSnapshot(accountId = "acct-alex", requestedWorkspaceId = null, options = {}) {
    const realActor = this.getActor(accountId); let actor = realActor; let viewAs = null;
    if (options.viewAsAccountId) {
      this.authorization.require(realActor, ACTIONS.PLATFORM_ADMIN, { readOnly: true });
      actor = this.getActor(options.viewAsAccountId);
      viewAs = { superadminAccountId: realActor.accountId, accountId: actor.accountId, name: actor.name, readOnly: true };
      this.audit(realActor, { authority: "SUPERADMIN", action: "view_as.started", resourceType: "ACCOUNT", resourceId: actor.accountId, reason: options.reason || "Administrative support" });
    }
    const available = actor.platformRole === "SUPERADMIN"
      ? this.database.prepare("SELECT id AS workspaceId,name AS workspaceName,status FROM workspaces ORDER BY name").all().map((item) => ({ ...item, roles: ["SUPERADMIN"] }))
      : actor.memberships.filter((item) => item.status === "ACTIVE");
    const workspaceId = requestedWorkspaceId || actor.memberships.find((item) => item.status === "ACTIVE")?.workspaceId || available[0]?.workspaceId || null;
    if (workspaceId) this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId, readOnly: Boolean(viewAs) });
    const query = (sql, ...args) => workspaceId ? this.database.prepare(sql).all(...args) : [];
    const one = (sql, ...args) => workspaceId ? this.database.prepare(sql).get(...args) : null;
    const workspace = one("SELECT id,name,status,registration_mode AS registrationMode,settings_json AS settingsJson FROM workspaces WHERE id=?", workspaceId);
    const entities = query(`SELECT DISTINCT e.id,e.kind,e.canonical_name AS canonicalName,e.jurisdiction,e.status,
      (SELECT group_concat(alias,' · ') FROM entity_aliases WHERE entity_id=e.id) AS aliasText FROM entities e WHERE e.id IN (
      SELECT entity_id FROM professional_relationships WHERE workspace_id=? UNION SELECT mp.entity_id FROM matter_parties mp JOIN matters m ON m.id=mp.matter_id WHERE m.workspace_id=?
      UNION SELECT organization_entity_id FROM workspaces WHERE id=? UNION SELECT from_entity_id FROM entity_relationships WHERE from_entity_id IN (SELECT entity_id FROM professional_relationships WHERE workspace_id=?)
      UNION SELECT to_entity_id FROM entity_relationships WHERE to_entity_id IN (SELECT entity_id FROM professional_relationships WHERE workspace_id=?)) ORDER BY e.canonical_name`, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId).map((item) => ({ ...item, aliases: item.aliasText ? item.aliasText.split(" · ") : [] }));
    const matters = query(`SELECT m.id,m.code,m.title,m.matter_type AS matterType,m.stage,m.status,m.representation_status AS representationStatus,m.sensitivity,m.opened_at AS openedAt,p.display_name AS ownerName,(SELECT COUNT(*) FROM matter_parties WHERE matter_id=m.id) AS partyCount FROM matters m LEFT JOIN persons p ON p.id=m.owner_person_id WHERE m.workspace_id=? ORDER BY m.updated_at DESC`, workspaceId);
    const relationships = query(`SELECT r.id,r.person_id AS personId,p.display_name AS personName,r.entity_id AS entityId,e.canonical_name AS entityName,r.relationship_type AS relationshipType,r.representation_status AS representationStatus,r.description,r.effective_from AS effectiveFrom,r.effective_to AS effectiveTo,r.source,r.disclosure_class AS disclosureClass,r.status,r.recorded_at AS recordedAt FROM professional_relationships r JOIN persons p ON p.id=r.person_id JOIN entities e ON e.id=r.entity_id WHERE r.workspace_id=? ORDER BY r.recorded_at DESC`, workspaceId);
    const cases = query(`SELECT c.id,c.reference,c.title,c.summary,c.workflow_state AS workflowState,c.human_disposition AS humanDisposition,c.status,c.person_id AS personId,p.display_name AS personName,c.matter_id AS matterId,m.code AS matterCode,m.title AS matterTitle,c.entity_id AS entityId,e.canonical_name AS entityName,c.assigned_account_id AS assignedAccountId,ap.display_name AS assigneeName,c.opened_at AS openedAt,c.review_due_at AS reviewDueAt,c.closed_at AS closedAt,c.updated_at AS updatedAt FROM review_cases c LEFT JOIN persons p ON p.id=c.person_id LEFT JOIN matters m ON m.id=c.matter_id LEFT JOIN entities e ON e.id=c.entity_id LEFT JOIN accounts aa ON aa.id=c.assigned_account_id LEFT JOIN persons ap ON ap.id=aa.person_id WHERE c.workspace_id=? ORDER BY CASE c.workflow_state WHEN 'RED' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END,c.updated_at DESC`, workspaceId);
    const checks = query(`SELECT id,reference,matter_id AS matterId,status,workflow_state AS workflowState,executed_at AS executedAt,corpus_revision AS corpusRevision,(corpus_revision < ?) AS reReviewSuggested,(SELECT COUNT(*) FROM conflict_hits WHERE conflict_check_id=conflict_checks.id) AS hitCount FROM conflict_checks WHERE workspace_id=? ORDER BY executed_at DESC`, this.corpusRevision(), workspaceId).map((item) => ({ ...item, reReviewSuggested: Boolean(item.reReviewSuggested) }));
    const hits = query(`SELECT h.id,h.conflict_check_id AS conflictCheckId,h.subject_id AS subjectId,h.matched_entity_id AS matchedEntityId,e.canonical_name AS matchedEntityName,h.source_resource_type AS sourceResourceType,h.source_resource_id AS sourceResourceId,h.match_confidence AS matchConfidence,h.workflow_state AS workflowState,h.explanation_json AS explanationJson,h.review_status AS reviewStatus,h.created_at AS createdAt FROM conflict_hits h JOIN conflict_checks cc ON cc.id=h.conflict_check_id LEFT JOIN entities e ON e.id=h.matched_entity_id WHERE cc.workspace_id=? ORDER BY h.created_at DESC`, workspaceId).map((item) => ({ ...item, explanation: parse(item.explanationJson, []) }));
    const controls = query(`SELECT ctl.id,ctl.case_id AS caseId,c.reference AS caseReference,ctl.control_type AS controlType,ctl.description,ctl.owner_person_id AS ownerPersonId,p.display_name AS ownerName,ctl.mandatory,ctl.due_at AS dueAt,ctl.status,ctl.completed_at AS completedAt FROM controls ctl JOIN review_cases c ON c.id=ctl.case_id JOIN persons p ON p.id=ctl.owner_person_id WHERE c.workspace_id=? ORDER BY ctl.status,ctl.due_at`, workspaceId).map((item) => ({ ...item, mandatory: Boolean(item.mandatory) }));
    const notes = query(`SELECT n.id,n.case_id AS caseId,p.display_name AS author,n.body,n.note_type AS noteType,n.created_at AS createdAt FROM review_notes n JOIN review_cases c ON c.id=n.case_id JOIN accounts a ON a.id=n.author_account_id JOIN persons p ON p.id=a.person_id WHERE c.workspace_id=? ORDER BY n.created_at DESC`, workspaceId);
    const determinations = query(`SELECT d.id,d.case_id AS caseId,d.disposition,d.rationale,d.rule_basis AS ruleBasis,d.jurisdiction,p.display_name AS determinedBy,d.determined_at AS determinedAt,d.supersedes_id AS supersedesId FROM human_determinations d JOIN review_cases c ON c.id=d.case_id JOIN accounts a ON a.id=d.determined_by JOIN persons p ON p.id=a.person_id WHERE c.workspace_id=? ORDER BY d.determined_at DESC`, workspaceId);
    const consents = query(`SELECT co.id,co.case_id AS caseId,co.affected_entity_id AS affectedEntityId,e.canonical_name AS affectedEntityName,co.consent_type AS consentType,co.rule_basis AS ruleBasis,co.jurisdiction,co.status,co.evidence_requirement AS evidenceRequirement,co.scope,co.conditions,co.obtained_at AS obtainedAt,co.effective_from AS effectiveFrom,co.expires_at AS expiresAt,co.created_at AS createdAt FROM conflict_consents co JOIN review_cases c ON c.id=co.case_id LEFT JOIN entities e ON e.id=co.affected_entity_id WHERE c.workspace_id=? ORDER BY co.created_at DESC`, workspaceId);
    const screens = query(`SELECT s.id,s.case_id AS caseId,s.screened_person_id AS screenedPersonId,p.display_name AS screenedPersonName,s.matter_id AS matterId,m.code AS matterCode,s.effective_at AS effectiveAt,s.restrictions,s.fee_restrictions AS feeRestrictions,s.communications_restrictions AS communicationsRestrictions,s.notice_requirements AS noticeRequirements,s.notice_recipients AS noticeRecipients,s.status,s.created_at AS createdAt FROM screens s JOIN review_cases c ON c.id=s.case_id JOIN persons p ON p.id=s.screened_person_id JOIN matters m ON m.id=s.matter_id WHERE c.workspace_id=? ORDER BY s.created_at DESC`, workspaceId);
    const assertions = query(`SELECT id,subject_type AS subjectType,subject_id AS subjectId,predicate,object_type AS objectType,object_id AS objectId,object_text AS objectText,status,confidentiality_scope AS confidentialityScope,provenance,recorded_at AS recordedAt,effective_from AS effectiveFrom,effective_to AS effectiveTo,supersedes_id AS supersedesId FROM assertions WHERE workspace_id=? ORDER BY recorded_at DESC`, workspaceId);
    const inferences = query(`SELECT i.id,i.subject_type AS subjectType,i.subject_id AS subjectId,i.inference_type AS inferenceType,i.conclusion,i.match_confidence AS matchConfidence,i.evidence_summary AS evidenceSummary,i.corpus_revision AS corpusRevision,i.recorded_at AS recordedAt,i.supersedes_id AS supersedesId,EXISTS(SELECT 1 FROM inferences n WHERE n.supersedes_id=i.id) AS superseded FROM inferences i WHERE i.workspace_id=? ORDER BY i.recorded_at DESC`, workspaceId).map((item) => ({ ...item, superseded: Boolean(item.superseded) }));
    const documents = query(`SELECT d.id,d.filename,d.media_type AS mediaType,d.size,d.sha256,d.uploaded_at AS uploadedAt,d.description,d.confidentiality_scope AS confidentialityScope,d.status,d.supersedes_document_id AS supersedesDocumentId,p.display_name AS uploadedBy,(SELECT COUNT(*) FROM resource_attachments WHERE document_id=d.id) AS attachmentCount,(SELECT COUNT(*) FROM evidence_links WHERE document_id=d.id) AS evidenceLinkCount FROM documents d JOIN accounts a ON a.id=d.uploaded_by JOIN persons p ON p.id=a.person_id WHERE d.workspace_id=? ORDER BY d.uploaded_at DESC`, workspaceId);
    const memberships = query(`SELECT m.id,m.account_id AS accountId,m.person_id AS personId,p.display_name AS personName,a.primary_email AS email,m.status,m.invited_at AS invitedAt,m.joined_at AS joinedAt,m.departed_at AS departedAt FROM workspace_memberships m JOIN persons p ON p.id=m.person_id LEFT JOIN accounts a ON a.id=m.account_id WHERE m.workspace_id=? ORDER BY p.display_name`, workspaceId).map((item) => ({ ...item, roles: this.database.prepare("SELECT role FROM workspace_roles WHERE membership_id=? ORDER BY role").all(item.id).map((role) => role.role) }));
    const invitations = query("SELECT id,email,roles_json AS rolesJson,invited_at AS invitedAt,expires_at AS expiresAt,status FROM invitations WHERE workspace_id=? ORDER BY invited_at DESC", workspaceId).map((item) => ({ ...item, roles: parse(item.rolesJson, []) }));
    const associatedRequests = query(`SELECT q.id,q.subject_person_id AS subjectPersonId,sp.display_name AS subjectPersonName,q.associated_entity_id AS associatedEntityId,ae.canonical_name AS associatedEntityName,q.query_entity_id AS queryEntityId,qe.canonical_name AS queryEntityName,q.question,q.disclosure_scope AS disclosureScope,q.status,q.requested_at AS requestedAt,q.expires_at AS expiresAt FROM associated_person_requests q JOIN persons sp ON sp.id=q.subject_person_id JOIN entities ae ON ae.id=q.associated_entity_id JOIN entities qe ON qe.id=q.query_entity_id WHERE q.workspace_id=? ORDER BY q.requested_at DESC`, workspaceId);
    const associatedResponses = query(`SELECT r.id,r.request_id AS requestId,r.response,r.permitted_detail AS permittedDetail,r.responded_at AS respondedAt FROM associated_person_responses r JOIN associated_person_requests q ON q.id=r.request_id WHERE q.workspace_id=? ORDER BY r.responded_at DESC`, workspaceId);
    const audit = query(`SELECT au.id,au.actor_account_id AS actorAccountId,p.display_name AS actorName,au.authority_used AS authorityUsed,au.workspace_scope AS workspaceScope,au.action,au.resource_type AS resourceType,au.resource_id AS resourceId,au.before_json AS beforeJson,au.after_json AS afterJson,au.occurred_at AS occurredAt,au.reason,au.metadata_json AS metadataJson FROM audit_events au LEFT JOIN persons p ON p.id=au.actor_person_id WHERE au.workspace_scope=? ORDER BY au.occurred_at DESC LIMIT 300`, workspaceId).map((item) => ({ ...item, before: parse(item.beforeJson, null), after: parse(item.afterJson, null), metadata: parse(item.metadataJson, {}) }));
    const ledger = this.database.prepare(`SELECT l.id,l.person_id AS personId,e.canonical_name AS entityName,l.context,l.involvement,l.source_workspace_id AS sourceWorkspaceId,l.source,l.provenance,l.disclosure_class AS disclosureClass,l.sharing_authorized AS sharingAuthorized,l.recorded_at AS recordedAt FROM personal_ledger_entries l JOIN entities e ON e.id=l.entity_id WHERE l.person_id=? ORDER BY l.recorded_at DESC`).all(actor.personId).map((item) => ({ ...item, sharingAuthorized: Boolean(item.sharingAuthorized) }));
    return {
      generatedAt: isoNow(), corpusRevision: this.corpusRevision(), actor, realActor, viewAs, availableWorkspaces: available,
      workspace: workspace ? { ...workspace, settings: parse(workspace.settingsJson, {}) } : null,
      stats: { openCases: cases.filter((item) => !["CLOSED","DECLINED","WITHDRAWN"].includes(item.status)).length, red: cases.filter((item) => item.workflowState === "RED").length, yellow: cases.filter((item) => item.workflowState === "YELLOW").length, green: cases.filter((item) => item.workflowState === "GREEN").length, openControls: controls.filter((item) => item.status === "OPEN").length, currentBillableSeats: workspaceId ? this.currentBillableSeats(workspaceId) : 0 },
      entities, matters, relationships, cases, checks, hits, controls, notes, determinations, consents, screens,
      assertions, inferences, documents, memberships, invitations, associatedRequests, associatedResponses, audit, ledger,
      migrations: realActor.platformRole === "SUPERADMIN" ? this.migrationState() : [],
      configuration: { environment: getConfig().environment, registrationMode: getConfig().registrationMode, demoMode: getConfig().demoMode, authProvider: getConfig().authProvider, databaseDriver: "sqlite", objectStoreDriver: getConfig().objectStoreDriver },
    };
  }

  createWorkspace(accountId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.PLATFORM_ADMIN);
    const workspaceId = id("ws"); const entityId = id("entity"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO entities (id,kind,canonical_name,jurisdiction,created_at,updated_at) VALUES (?,'ORGANIZATION',?,?,?,?)").run(entityId, required(input.name, "Workspace name"), clean(input.jurisdiction) || null, at, at);
      this.database.prepare("INSERT INTO workspaces (id,organization_entity_id,name,registration_mode,created_at,updated_at) VALUES (?,?,?,'INVITE_ONLY',?,?)").run(workspaceId, entityId, required(input.name, "Workspace name"), at, at);
      this.audit(actor, { authority: "SUPERADMIN", workspaceId, action: "workspace.created", resourceType: "WORKSPACE", resourceId: workspaceId, after: { name: input.name } });
    });
    this.rebuildSearchIndex(); return { id: workspaceId, name: input.name };
  }

  createInvitation(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.MANAGE_MEMBERS, { workspaceId });
    const roles = [...new Set((input.roles || ["MEMBER"]).map(upper))];
    for (const role of roles) if (!["MEMBER","REVIEWER","FIRMADMIN"].includes(role)) throw new Error("Unsupported workspace role");
    const token = randomBytes(24).toString("base64url"); const tokenHash = createHash("sha256").update(token).digest("hex"); const invitationId = id("invite");
    const at = isoNow(); const expiresAt = addDays(Number(input.expiresInDays) || 14);
    this.database.prepare("INSERT INTO invitations (id,workspace_id,email,person_id,token_hash,roles_json,invited_by,invited_at,expires_at,status) VALUES (?,?,?,?,?,?,?,?,?,'PENDING')").run(invitationId, workspaceId, required(input.email, "Email").toLowerCase(), clean(input.personId) || null, tokenHash, JSON.stringify(roles), accountId, at, expiresAt);
    this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "invitation.created", resourceType: "MEMBERSHIP", resourceId: invitationId, after: { email: input.email, roles, expiresAt } });
    return { id: invitationId, token, invitationUrl: `${getConfig().appBaseUrl}/invite/${token}`, expiresAt };
  }

  acceptInvitation(accountId, token) {
    const actor = this.getActor(accountId); const hash = createHash("sha256").update(required(token, "Invitation token")).digest("hex");
    const invitation = this.database.prepare("SELECT * FROM invitations WHERE token_hash=?").get(hash);
    if (!invitation || invitation.status !== "PENDING" || new Date(invitation.expires_at) <= new Date()) throw new Error("Invitation is invalid or expired");
    if (invitation.email.toLowerCase() !== actor.email.toLowerCase()) throw new Error("Invitation belongs to another account");
    const membershipId = id("membership"); const at = isoNow(); const roles = parse(invitation.roles_json, ["MEMBER"]);
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO workspace_memberships (id,workspace_id,account_id,person_id,invited_by,invited_at,joined_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?)").run(membershipId, invitation.workspace_id, accountId, actor.personId, invitation.invited_by, invitation.invited_at, at, at, at);
      for (const role of roles) this.database.prepare("INSERT INTO workspace_roles (membership_id,role) VALUES (?,?)").run(membershipId, role);
      this.database.prepare("UPDATE invitations SET status='ACCEPTED',accepted_at=? WHERE id=?").run(at, invitation.id);
      this.database.prepare("INSERT INTO seat_events (id,workspace_id,membership_id,delta,reason,effective_at) VALUES (?,?,?,1,'Invitation accepted',?)").run(id("seat"), invitation.workspace_id, membershipId, at);
      this.audit(actor, { authority: "INVITEE", workspaceId: invitation.workspace_id, action: "invitation.accepted", resourceType: "MEMBERSHIP", resourceId: membershipId, after: { roles } });
    });
    return { membershipId, workspaceId: invitation.workspace_id, status: "ACTIVE" };
  }

  updateMembership(accountId, workspaceId, membershipId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.MANAGE_MEMBERS, { workspaceId });
    const membership = this.database.prepare("SELECT * FROM workspace_memberships WHERE id=? AND workspace_id=?").get(membershipId, workspaceId);
    if (!membership) throw new Error("Membership not found");
    transaction(this.database, () => {
      if (input.roles) {
        const roles = [...new Set(input.roles.map(upper))]; this.database.prepare("DELETE FROM workspace_roles WHERE membership_id=?").run(membershipId);
        for (const role of roles) { if (!["MEMBER","REVIEWER","FIRMADMIN"].includes(role)) throw new Error("Unsupported workspace role"); this.database.prepare("INSERT INTO workspace_roles (membership_id,role) VALUES (?,?)").run(membershipId, role); }
        this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "membership.roles_changed", resourceType: "MEMBERSHIP", resourceId: membershipId, after: { roles } });
      }
      if (input.status && upper(input.status) !== membership.status) {
        const status = upper(input.status); if (!["ACTIVE","DEPARTED","REVOKED"].includes(status)) throw new Error("Unsupported membership status");
        const at = isoNow(); this.database.prepare("UPDATE workspace_memberships SET status=?,departed_at=?,updated_at=? WHERE id=?").run(status, status === "DEPARTED" ? at : null, at, membershipId);
        if (membership.status === "ACTIVE" && status !== "ACTIVE") this.database.prepare("INSERT INTO seat_events (id,workspace_id,membership_id,delta,reason,effective_at) VALUES (?,?,?,-1,?,?)").run(id("seat"), workspaceId, membershipId, status === "DEPARTED" ? "Member departed" : "Membership revoked", at);
        this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "membership.status_changed", resourceType: "MEMBERSHIP", resourceId: membershipId, before: { status: membership.status }, after: { status } });
      }
    });
    return { id: membershipId };
  }

  promoteSuperadmin(identifier, reason = "Bootstrap promotion") {
    const account = this.database.prepare("SELECT id,person_id AS personId,platform_role AS platformRole FROM accounts WHERE id=? OR lower(primary_email)=lower(?)").get(identifier, identifier);
    if (!account) throw new Error("Account not found");
    this.database.prepare("UPDATE accounts SET platform_role='SUPERADMIN',updated_at=? WHERE id=?").run(isoNow(), account.id);
    const actor = this.getActor(account.id); this.audit(actor, { authority: "BOOTSTRAP", action: "platform_role.granted", resourceType: "ACCOUNT", resourceId: account.id, before: { platformRole: account.platformRole }, after: { platformRole: "SUPERADMIN" }, reason });
    return { accountId: account.id, platformRole: "SUPERADMIN" };
  }

  createEntity(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.MANAGE_WORKSPACE, { workspaceId });
    const entityId = id("entity"); const requestedKind = upper(input.kind || "ORGANIZATION"); const kind = requestedKind === "GOVERNMENT" ? "GOVERNMENT_BODY" : requestedKind;
    if (!["PERSON","ORGANIZATION","PROPERTY","TRUST","ESTATE","GOVERNMENT_BODY","OTHER"].includes(kind)) throw new Error("Unsupported entity kind");
    const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO entities (id,kind,canonical_name,jurisdiction,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(entityId, kind, required(input.canonicalName || input.name, "Name"), clean(input.jurisdiction) || null, at, at);
      for (const alias of input.aliases || []) this.database.prepare("INSERT INTO entity_aliases (id,entity_id,alias,normalized_alias,source,created_at) VALUES (?,?,?,?,?,?)").run(id("alias"), entityId, alias, normalizeName(alias), "User supplied", at);
      this.database.prepare("INSERT INTO professional_relationships (id,workspace_id,person_id,entity_id,relationship_type,description,source,disclosure_class,status,recorded_at) VALUES (?,?,?,?, 'WORKSPACE_ENTITY','Workspace entity record','Manual entry','FIRM_ONLY','CURRENT',?)").run(id("relationship"), workspaceId, actor.personId, entityId, at);
      this.incrementCorpus(workspaceId, actor, "Entity created");
      this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "entity.created", resourceType: "ENTITY", resourceId: entityId, after: { kind, name: input.canonicalName || input.name } });
    });
    this.rebuildSearchIndex(); return { id: entityId };
  }

  createMatter(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.MANAGE_WORKSPACE, { workspaceId }); const matterId = id("matter"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO matters (id,workspace_id,code,title,matter_type,stage,status,representation_status,owner_person_id,sensitivity,opened_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?)").run(matterId, workspaceId, required(input.code, "Matter code"), required(input.title, "Matter title"), upper(input.matterType || "ENGAGEMENT"), upper(input.stage || "INTAKE"), upper(input.representationStatus || "PROPOSED"), clean(input.ownerPersonId) || actor.personId, upper(input.sensitivity || "STANDARD"), at, at, at);
      for (const party of input.parties || []) this.database.prepare("INSERT INTO matter_parties (id,matter_id,entity_id,role,provenance,created_at) VALUES (?,?,?,?,?,?)").run(id("party"), matterId, party.entityId, upper(party.role), party.provenance || "Matter intake", at);
      this.incrementCorpus(workspaceId, actor, "Matter created");
      this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "matter.created", resourceType: "MATTER", resourceId: matterId, after: { code: input.code, title: input.title } });
    });
    return { id: matterId };
  }

  createAssertion(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId }); const assertionId = id("assertion"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO assertions (id,workspace_id,subject_type,subject_id,predicate,object_type,object_id,object_text,status,confidentiality_scope,provenance,recorded_by,recorded_at,effective_from,effective_to,supersedes_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(assertionId, workspaceId, upper(required(input.subjectType, "Subject type")), required(input.subjectId, "Subject"), upper(required(input.predicate, "Predicate")), clean(input.objectType) ? upper(input.objectType) : null, clean(input.objectId) || null, clean(input.objectText) || null, upper(input.status || "CURRENT"), upper(input.confidentialityScope || "WORKSPACE"), clean(input.provenance) || "User assertion", accountId, at, clean(input.effectiveFrom) || null, clean(input.effectiveTo) || null, clean(input.supersedesId) || null);
      if (input.supersedesId) this.database.prepare("UPDATE assertions SET status='SUPERSEDED',superseded_at=? WHERE id=? AND workspace_id=?").run(at, input.supersedesId, workspaceId);
      this.incrementCorpus(workspaceId, actor, "Assertion recorded");
      this.audit(actor, { authority: "MEMBER", workspaceId, action: "assertion.created", resourceType: "ASSERTION", resourceId: assertionId, after: { predicate: upper(input.predicate), provenance: input.provenance } });
    });
    return { id: assertionId, corpusRevision: this.corpusRevision() };
  }

  createInference(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId });
    if (input.supersedesId && !this.database.prepare("SELECT 1 FROM inferences WHERE id=? AND workspace_id=?").get(input.supersedesId, workspaceId)) throw new Error("Superseded inference not found");
    const inferenceId = id("inference"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO inferences (id,workspace_id,subject_type,subject_id,inference_type,conclusion,match_confidence,evidence_summary,corpus_revision,recorded_at,effective_from,effective_to,supersedes_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(inferenceId, workspaceId, upper(required(input.subjectType, "Subject type")), required(input.subjectId, "Subject"), upper(required(input.inferenceType, "Inference type")), required(input.conclusion, "Conclusion"), clean(input.matchConfidence) ? upper(input.matchConfidence) : null, required(input.evidenceSummary, "Evidence summary"), this.corpusRevision(), at, clean(input.effectiveFrom) || at, clean(input.effectiveTo) || null, clean(input.supersedesId) || null);
      this.audit(actor, { authority: "REVIEWER", workspaceId, action: input.supersedesId ? "inference.superseded" : "inference.created", resourceType: "INFERENCE", resourceId: inferenceId, after: { conclusion: input.conclusion, supersedesId: input.supersedesId || null } });
    });
    return { id: inferenceId, corpusRevision: this.corpusRevision() };
  }

  uploadDocument(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId });
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytesBase64 || "", input.bytesBase64 ? "base64" : "utf8");
    if (!bytes.length) throw new Error("Document bytes are required");
    const stored = this.objectStore.putImmutable(bytes); const documentId = id("document"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO documents (id,workspace_id,filename,media_type,size,sha256,storage_key,uploaded_by,uploaded_at,description,confidentiality_scope,status,supersedes_document_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,'CURRENT',?)").run(documentId, workspaceId, required(input.filename, "Filename"), required(input.mediaType, "Media type"), stored.size, stored.sha256, stored.storageKey, accountId, at, clean(input.description) || null, upper(input.confidentialityScope || "WORKSPACE"), clean(input.supersedesDocumentId) || null);
      if (input.supersedesDocumentId) this.database.prepare("UPDATE documents SET status='SUPERSEDED' WHERE id=? AND workspace_id=?").run(input.supersedesDocumentId, workspaceId);
      for (const attachment of input.attachments || []) this.attachDocumentInternal(documentId, attachment, accountId, at);
      for (const evidence of input.evidenceLinks || []) this.linkEvidenceInternal(documentId, evidence, accountId, at);
      this.incrementCorpus(workspaceId, actor, "Document evidence uploaded");
      this.audit(actor, { authority: "MEMBER", workspaceId, action: "document.uploaded", resourceType: "DOCUMENT", resourceId: documentId, after: { filename: input.filename, sha256: stored.sha256, size: stored.size } });
    });
    return { id: documentId, ...stored };
  }

  assertResource(resourceType, resourceId) {
    const type = upper(resourceType); const table = RESOURCE_TABLES[type];
    if (!RESOURCE_TYPES.includes(type) || !table) throw new Error("Unsupported attachment resource type");
    if (!this.database.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(resourceId)) throw new Error("Attachment target not found");
    return type;
  }

  attachDocumentInternal(documentId, attachment, accountId, at = isoNow()) {
    const resourceType = this.assertResource(attachment.resourceType, attachment.resourceId);
    this.database.prepare("INSERT INTO resource_attachments (id,document_id,resource_type,resource_id,attachment_role,attached_by,attached_at,note) VALUES (?,?,?,?,?,?,?,?)").run(id("attachment"), documentId, resourceType, attachment.resourceId, upper(attachment.role || "GENERAL"), accountId, at, clean(attachment.note) || null);
  }

  linkEvidenceInternal(documentId, evidence, accountId, at = isoNow()) {
    if (!this.database.prepare("SELECT 1 FROM assertions WHERE id=?").get(evidence.assertionId)) throw new Error("Assertion not found");
    this.database.prepare("INSERT INTO evidence_links (id,document_id,assertion_id,role,page_start,page_end,section,paragraph,note,linked_by,linked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id("evidence"), documentId, evidence.assertionId, upper(evidence.role || "SUPPORTS"), Number(evidence.pageStart) || null, Number(evidence.pageEnd) || null, clean(evidence.section) || null, clean(evidence.paragraph) || null, clean(evidence.note) || null, accountId, at);
  }

  readDocument(accountId, documentId, workspaceId) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.VIEW_DOCUMENT, { workspaceId, readOnly: true });
    const document = this.database.prepare("SELECT * FROM documents WHERE id=? AND workspace_id=?").get(documentId, workspaceId);
    if (!document) throw new Error("Document not found");
    this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "MEMBER", workspaceId, action: "document.viewed", resourceType: "DOCUMENT", resourceId: documentId, reason: "Document review" });
    return { metadata: document, bytes: this.objectStore.get(document.storage_key) };
  }

  visibleEntityIds(workspaceId, actor, participatingPersonIds = []) {
    this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId });
    const ids = new Set(this.database.prepare("SELECT entity_id AS id FROM professional_relationships WHERE workspace_id=? UNION SELECT mp.entity_id FROM matter_parties mp JOIN matters m ON m.id=mp.matter_id WHERE m.workspace_id=? UNION SELECT organization_entity_id FROM workspaces WHERE id=?").all(workspaceId, workspaceId, workspaceId).map((item) => item.id));
    const ledgerPeople = new Set([actor.personId]);
    for (const personId of participatingPersonIds) {
      if (this.database.prepare("SELECT 1 FROM workspace_memberships WHERE workspace_id=? AND person_id=? AND status='ACTIVE'").get(workspaceId, personId)) ledgerPeople.add(personId);
    }
    for (const personId of ledgerPeople) for (const entry of this.database.prepare("SELECT entity_id AS id FROM personal_ledger_entries WHERE person_id=? AND sharing_authorized=1 AND disclosure_class='PORTABLE'").all(personId)) ids.add(entry.id);
    for (const request of this.database.prepare("SELECT query_entity_id AS id FROM associated_person_requests WHERE workspace_id=? AND status='ANSWERED'").all(workspaceId)) ids.add(request.id);
    for (const relation of this.database.prepare("SELECT from_entity_id AS fromId,to_entity_id AS toId FROM entity_relationships").all()) if (ids.has(relation.fromId) || ids.has(relation.toId)) { ids.add(relation.fromId); ids.add(relation.toId); }
    return ids;
  }

  createConflictCheck(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId });
    const subjects = input.subjects || []; if (!subjects.length) throw new Error("At least one conflict-check subject is required");
    if (input.matterId && !this.database.prepare("SELECT 1 FROM matters WHERE id=? AND workspace_id=?").get(input.matterId, workspaceId)) throw new Error("Matter not found in this workspace");
    const checkId = id("check"); const at = isoNow(); const revision = this.corpusRevision();
    const reference = `CHK-${new Date().getUTCFullYear()}-${String(Number(this.database.prepare("SELECT COUNT(*) AS count FROM conflict_checks WHERE workspace_id=?").get(workspaceId).count) + 1).padStart(4, "0")}`;
    const visible = this.visibleEntityIds(workspaceId, actor, input.participatingPersonIds || []);
    const candidates = [...visible].map((entityId) => {
      const entity = this.database.prepare("SELECT id,kind,canonical_name AS canonicalName FROM entities WHERE id=?").get(entityId);
      entity.aliases = this.database.prepare("SELECT alias FROM entity_aliases WHERE entity_id=?").all(entityId).map((item) => item.alias);
      entity.identifiers = this.database.prepare("SELECT value FROM entity_identifiers WHERE entity_id=?").all(entityId).map((item) => item.value);
      entity.addresses = this.database.prepare("SELECT address_text AS address FROM entity_addresses WHERE entity_id=?").all(entityId).map((item) => item.address);
      return entity;
    });
    const createdHits = [];
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO conflict_checks (id,workspace_id,matter_id,reference,status,workflow_state,created_by,executed_at,corpus_revision,subjects_snapshot_json,knowledge_snapshot_json,completed_at) VALUES (?,?,?,?,'COMPLETE','GREEN',?,?,?,?,?,?)").run(checkId, workspaceId, clean(input.matterId) || null, reference, accountId, at, revision, JSON.stringify(subjects), JSON.stringify({ corpusRevision: revision, entityIds: [...visible] }), at);
      for (const subject of subjects) {
        const subjectId = id("subject");
        this.database.prepare("INSERT INTO conflict_check_subjects (id,conflict_check_id,entity_id,supplied_name,role,metadata_json) VALUES (?,?,?,?,?,?)").run(subjectId, checkId, clean(subject.entityId) || null, required(subject.name, "Subject name"), upper(subject.role || "OTHER"), JSON.stringify(subject.metadata || {}));
        const directMatches = [];
        for (const candidate of candidates) {
          const result = matchEntity({ name: subject.name, identifiers: subject.identifiers || [], addresses: subject.addresses || [] }, candidate);
          if (!result) continue; directMatches.push(candidate.id); createdHits.push(this.insertHit(checkId, subjectId, candidate.id, workspaceId, result, at));
        }
        for (const matchedId of directMatches) {
          const relations = this.database.prepare("SELECT er.*,f.canonical_name AS fromName,t.canonical_name AS toName FROM entity_relationships er JOIN entities f ON f.id=er.from_entity_id JOIN entities t ON t.id=er.to_entity_id WHERE er.from_entity_id=? OR er.to_entity_id=?").all(matchedId, matchedId);
          for (const relation of relations) {
            const relatedId = relation.from_entity_id === matchedId ? relation.to_entity_id : relation.from_entity_id;
            if (!visible.has(relatedId)) continue;
            createdHits.push(this.insertHit(checkId, subjectId, relatedId, workspaceId, relatedMatch({ type: relation.relationship_type, fromName: relation.fromName, toName: relation.toName }), at, "ENTITY_RELATIONSHIP", relation.id));
          }
        }
      }
      if (createdHits.length) this.database.prepare("UPDATE conflict_checks SET workflow_state='YELLOW' WHERE id=?").run(checkId);
      for (const hit of createdHits) {
        const caseId = id("case"); const caseReference = this.nextCaseReference(workspaceId);
        this.database.prepare("INSERT INTO review_cases (id,workspace_id,conflict_check_id,conflict_hit_id,reference,matter_id,entity_id,title,summary,workflow_state,human_disposition,status,assigned_account_id,opened_at,review_due_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'YELLOW','UNREVIEWED','NEW',?,?,?,?)").run(caseId, workspaceId, checkId, hit.id, caseReference, clean(input.matterId) || null, hit.matchedEntityId, `Review ${hit.matchedEntityName}`, hit.explanation.reasons.join("; "), accountId, at, addDays(7), at);
      }
      this.audit(actor, { authority: "MEMBER", workspaceId, action: "conflict_check.executed", resourceType: "CONFLICT_CHECK", resourceId: checkId, after: { reference, corpusRevision: revision, hitCount: createdHits.length } });
    });
    return { id: checkId, reference, workflowState: createdHits.length ? "YELLOW" : "GREEN", hits: createdHits };
  }

  insertHit(checkId, subjectId, matchedEntityId, workspaceId, result, at, sourceType = null, sourceId = null) {
    const entity = this.database.prepare("SELECT canonical_name AS name FROM entities WHERE id=?").get(matchedEntityId);
    const relationship = sourceType ? null : this.database.prepare("SELECT id FROM professional_relationships WHERE workspace_id=? AND entity_id=? LIMIT 1").get(workspaceId, matchedEntityId);
    const party = sourceType || relationship ? null : this.database.prepare("SELECT mp.id FROM matter_parties mp JOIN matters m ON m.id=mp.matter_id WHERE m.workspace_id=? AND mp.entity_id=? LIMIT 1").get(workspaceId, matchedEntityId);
    const ledger = sourceType || relationship || party ? null : this.database.prepare("SELECT id FROM personal_ledger_entries WHERE entity_id=? AND sharing_authorized=1 AND disclosure_class='PORTABLE' LIMIT 1").get(matchedEntityId);
    const associated = sourceType || relationship || party || ledger ? null : this.database.prepare("SELECT r.id FROM associated_person_responses r JOIN associated_person_requests q ON q.id=r.request_id WHERE q.workspace_id=? AND q.query_entity_id=? LIMIT 1").get(workspaceId, matchedEntityId);
    const hitId = id("hit"); const effectiveSourceType = sourceType || (relationship ? "RELATIONSHIP" : party ? "MATTER_PARTY" : ledger ? "LEDGER_ENTRY" : "ASSOCIATED_PERSON_RESPONSE"); const effectiveSourceId = sourceId || relationship?.id || party?.id || ledger?.id || associated?.id || matchedEntityId;
    const explanation = { reasons: result.reasons, source: effectiveSourceType, statement: "Candidate surfaced for human review; no legal conclusion has been made." };
    this.database.prepare("INSERT INTO conflict_hits (id,conflict_check_id,subject_id,matched_entity_id,source_resource_type,source_resource_id,match_confidence,workflow_state,explanation_json,review_status,created_at) VALUES (?,?,?,?,?,?,?,'YELLOW',?,'UNREVIEWED',?)").run(hitId, checkId, subjectId, matchedEntityId, effectiveSourceType, effectiveSourceId, result.confidence, JSON.stringify(explanation), at);
    this.database.prepare("INSERT INTO conflict_hit_evidence (id,conflict_hit_id,evidence_type,evidence_id,explanation) VALUES (?,?,?,?,?)").run(id("hit-evidence"), hitId, effectiveSourceType, effectiveSourceId, result.reasons.join("; "));
    return { id: hitId, matchedEntityId, matchedEntityName: entity.name, matchConfidence: result.confidence, explanation };
  }

  nextCaseReference(workspaceId) { return `INT-${new Date().getUTCFullYear()}-${String(Number(this.database.prepare("SELECT COUNT(*) AS count FROM review_cases WHERE workspace_id=?").get(workspaceId).count) + 1).padStart(4, "0")}`; }

  createDisclosure(input, accountId = "acct-alex", workspaceId = "ws-northstar") {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.READ_WORKSPACE, { workspaceId });
    const personId = required(input.personId, "Person"); const matterId = required(input.matterId, "Matter"); const entityId = required(input.entityId || input.organizationId, "Entity");
    if (!this.database.prepare("SELECT 1 FROM workspace_memberships WHERE workspace_id=? AND person_id=? AND status='ACTIVE'").get(workspaceId, personId)) throw new Error("Person is not active in this workspace");
    if (!this.database.prepare("SELECT 1 FROM matters WHERE id=? AND workspace_id=?").get(matterId, workspaceId)) throw new Error("Matter not found");
    const relationshipId = id("relationship"); const caseId = id("case"); const at = isoNow(); const reference = this.nextCaseReference(workspaceId);
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO professional_relationships (id,workspace_id,person_id,entity_id,relationship_type,description,effective_from,source,disclosure_class,status,recorded_at) VALUES (?,?,?,?,?,?,?,'Self-disclosed',?,'CURRENT',?)").run(relationshipId, workspaceId, personId, entityId, upper(required(input.relationshipType, "Relationship type")), required(input.description, "Description"), clean(input.startDate) || at.slice(0, 10), upper(input.disclosureClass || "FIRM_ONLY"), at);
      const assertionId = id("assertion"); this.database.prepare("INSERT INTO assertions (id,workspace_id,subject_type,subject_id,predicate,object_type,object_id,object_text,confidentiality_scope,provenance,recorded_by,recorded_at,effective_from) VALUES (?,?,'PERSON',?,'HAS_PROFESSIONAL_RELATIONSHIP','ENTITY',?,?,'WORKSPACE','Self-disclosed',?,?,?)").run(assertionId, workspaceId, personId, entityId, input.description, accountId, at, clean(input.startDate) || at.slice(0, 10));
      this.database.prepare("INSERT INTO review_cases (id,workspace_id,reference,person_id,matter_id,entity_id,relationship_id,title,summary,workflow_state,human_disposition,status,assigned_account_id,opened_at,review_due_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'YELLOW','UNREVIEWED','NEW',?,?,?,?)").run(caseId, workspaceId, reference, personId, matterId, entityId, relationshipId, clean(input.title) || `${input.relationshipType} disclosure`, input.description, accountId, at, addDays(7), at);
      if (upper(input.disclosureClass || "FIRM_ONLY") === "PORTABLE") this.database.prepare("INSERT INTO personal_ledger_entries (id,person_id,entity_id,relationship_id,context,involvement,source_workspace_id,source,provenance,disclosure_class,sharing_authorized,recorded_at) VALUES (?,?,?,?,?,?,?,'Self-disclosed','Account holder entry','PORTABLE',1,?)").run(id("ledger"), personId, entityId, relationshipId, input.description, upper(input.relationshipType), workspaceId, at);
      this.incrementCorpus(workspaceId, actor, "Self-disclosure recorded");
      this.audit(actor, { authority: "MEMBER", workspaceId, action: "disclosure.created", resourceType: "REVIEW_CASE", resourceId: caseId, after: { reference, workflowState: "YELLOW", assertionId } });
    });
    return { id: caseId, reference, workflowState: "YELLOW" };
  }

  evaluateCaseState(caseId) {
    const item = this.database.prepare("SELECT human_disposition AS humanDisposition FROM review_cases WHERE id=?").get(caseId);
    const mandatory = this.database.prepare("SELECT status FROM controls WHERE case_id=? AND mandatory=1").all(caseId).map((control) => ({ satisfied: control.status === "COMPLETE" }));
    return deriveWorkflowState({ explicitHold: ["CONFLICT_NONCONSENTABLE","DECLINE","WITHDRAW"].includes(item.humanDisposition), mandatoryRequirements: mandatory, humanDisposition: item.humanDisposition });
  }

  recordCaseAction(caseId, action, accountId = "acct-alex") {
    const actor = this.getActor(accountId); const item = this.database.prepare("SELECT * FROM review_cases WHERE id=?").get(caseId);
    if (!item) throw new Error("Case not found"); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId: item.workspace_id }); const at = isoNow();
    transaction(this.database, () => {
      if (action.type === "note") {
        this.database.prepare("INSERT INTO review_notes (id,case_id,author_account_id,body,note_type,created_at) VALUES (?,?,?,?,?,?)").run(id("note"), caseId, accountId, required(action.body, "Note"), upper(action.noteType || "REVIEW"), at);
        this.database.prepare("UPDATE review_cases SET status='IN_REVIEW',updated_at=? WHERE id=?").run(at, caseId);
        this.audit(actor, { authority: "REVIEWER", workspaceId: item.workspace_id, action: "review_note.created", resourceType: "REVIEW_CASE", resourceId: caseId }); return;
      }
      if (action.type === "status") {
        const status = upper(required(action.status, "Status")); this.database.prepare("UPDATE review_cases SET status=?,updated_at=? WHERE id=?").run(status, at, caseId);
        this.audit(actor, { authority: "REVIEWER", workspaceId: item.workspace_id, action: "case.status_changed", resourceType: "REVIEW_CASE", resourceId: caseId, before: { status: item.status }, after: { status } }); return;
      }
      if (["decision","determination"].includes(action.type)) {
        const dispositionMap = { "NO CONFLICT": "NO_CONFLICT", MANAGE: "CLEARED", RECUSE: "SCREEN_REQUIRED", PROHIBIT: "DECLINE" };
        const disposition = dispositionMap[String(action.outcome || "").toUpperCase()] || upper(action.disposition || action.outcome); assertHumanDisposition(disposition); const determinationId = id("determination");
        this.database.prepare("INSERT INTO human_determinations (id,case_id,disposition,rationale,rule_basis,jurisdiction,determined_by,determined_at,supersedes_id) VALUES (?,?,?,?,?,?,?,?,?)").run(determinationId, caseId, disposition, required(action.rationale, "Rationale"), clean(action.ruleBasis) || null, clean(action.jurisdiction) || null, accountId, at, clean(action.supersedesId) || null);
        this.database.prepare("UPDATE review_cases SET human_disposition=?,status=?,updated_at=? WHERE id=?").run(disposition, ["NO_CONFLICT","CLEARED"].includes(disposition) ? "MANAGED" : disposition === "DECLINE" ? "DECLINED" : "IN_REVIEW", at, caseId);
        if (clean(action.controlDescription)) this.database.prepare("INSERT INTO controls (id,case_id,control_type,description,owner_person_id,mandatory,due_at,status,created_at) VALUES (?,?,?,?,?,?,?,'OPEN',?)").run(id("control"), caseId, upper(action.controlType || "MITIGATION"), action.controlDescription, clean(action.ownerPersonId || action.ownerId) || actor.personId, action.mandatory === false ? 0 : 1, clean(action.dueAt) || addDays(7), at);
        const state = this.evaluateCaseState(caseId); this.database.prepare("UPDATE review_cases SET workflow_state=? WHERE id=?").run(state, caseId);
        this.audit(actor, { authority: "REVIEWER", workspaceId: item.workspace_id, action: "determination.created", resourceType: "DETERMINATION", resourceId: determinationId, after: { disposition, workflowState: state } }); return;
      }
      throw new Error("Unsupported case action");
    });
    return { id: caseId, workflowState: this.database.prepare("SELECT workflow_state AS workflowState FROM review_cases WHERE id=?").get(caseId).workflowState };
  }

  createConsent(accountId, caseId, input) {
    const actor = this.getActor(accountId); const item = this.database.prepare("SELECT workspace_id AS workspaceId FROM review_cases WHERE id=?").get(caseId);
    if (!item) throw new Error("Case not found"); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId: item.workspaceId });
    const consentId = id("consent"); const at = isoNow(); const status = upper(input.status || "REQUESTED");
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO conflict_consents (id,case_id,affected_entity_id,consent_type,rule_basis,jurisdiction,status,evidence_requirement,scope,conditions,obtained_at,effective_from,expires_at,revoked_at,recorded_by,provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(consentId, caseId, clean(input.affectedEntityId) || null, upper(input.consentType || "INFORMED_CONSENT"), clean(input.ruleBasis) || null, clean(input.jurisdiction) || null, status, clean(input.evidenceRequirement) ? upper(input.evidenceRequirement) : null, required(input.scope, "Consent scope"), clean(input.conditions) || null, status === "OBTAINED" ? clean(input.obtainedAt) || at : null, clean(input.effectiveFrom) || null, clean(input.expiresAt) || null, status === "REVOKED" ? at : null, accountId, clean(input.provenance) || null, at);
      for (const documentId of input.documentIds || []) this.attachDocumentInternal(documentId, { resourceType: "CONSENT", resourceId: consentId, role: "CONSENT_EVIDENCE" }, accountId, at);
      this.database.prepare("UPDATE review_cases SET workflow_state='YELLOW',updated_at=? WHERE id=?").run(at, caseId);
      this.audit(actor, { authority: "REVIEWER", workspaceId: item.workspaceId, action: "consent.created", resourceType: "CONSENT", resourceId: consentId, after: { status, note: "Consent does not itself clear the case" } });
    });
    return { id: consentId, status, workflowState: "YELLOW" };
  }

  createScreen(accountId, caseId, input) {
    const actor = this.getActor(accountId); const item = this.database.prepare("SELECT workspace_id AS workspaceId,matter_id AS matterId FROM review_cases WHERE id=?").get(caseId);
    if (!item) throw new Error("Case not found"); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId: item.workspaceId });
    const screenId = id("screen"); const at = isoNow(); const status = upper(input.status || "PROPOSED");
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO screens (id,case_id,screened_person_id,matter_id,effective_at,restrictions,fee_restrictions,communications_restrictions,notice_requirements,notice_recipients,status,created_by,reviewed_by,created_at,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(screenId, caseId, required(input.screenedPersonId, "Screened person"), clean(input.matterId) || item.matterId, required(input.effectiveAt, "Effective time"), required(input.restrictions, "Restrictions"), clean(input.feeRestrictions) || null, clean(input.communicationsRestrictions) || null, clean(input.noticeRequirements) || null, clean(input.noticeRecipients) || null, status, accountId, status === "ACTIVE" ? accountId : null, at, status === "ACTIVE" ? at : null);
      for (const documentId of input.documentIds || []) this.attachDocumentInternal(documentId, { resourceType: "SCREEN", resourceId: screenId, role: "SCREEN_EVIDENCE" }, accountId, at);
      this.database.prepare("UPDATE review_cases SET workflow_state=?,updated_at=? WHERE id=?").run(status === "INCOMPLETE" ? "RED" : "YELLOW", at, caseId);
      this.audit(actor, { authority: "REVIEWER", workspaceId: item.workspaceId, action: "screen.created", resourceType: "SCREEN", resourceId: screenId, after: { status, note: "Screen requires human sufficiency review" } });
    });
    return { id: screenId, status };
  }

  completeControl(controlId, accountId = "acct-alex") {
    const actor = this.getActor(accountId); const control = this.database.prepare("SELECT ctl.*,c.workspace_id AS workspaceId FROM controls ctl JOIN review_cases c ON c.id=ctl.case_id WHERE ctl.id=?").get(controlId);
    if (!control) throw new Error("Control not found"); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId: control.workspaceId });
    if (control.status === "COMPLETE") return { id: controlId, status: "COMPLETE" };
    transaction(this.database, () => {
      this.database.prepare("UPDATE controls SET status='COMPLETE',completed_at=? WHERE id=?").run(isoNow(), controlId);
      const state = this.evaluateCaseState(control.case_id); this.database.prepare("UPDATE review_cases SET workflow_state=?,updated_at=? WHERE id=?").run(state, isoNow(), control.case_id);
      this.audit(actor, { authority: "REVIEWER", workspaceId: control.workspaceId, action: "control.completed", resourceType: "CONTROL", resourceId: controlId, after: { workflowState: state } });
    });
    return { id: controlId, status: "COMPLETE" };
  }

  createAssociatedPersonRequest(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.REVIEW, { workspaceId }); const requestId = id("associated-request"); const at = isoNow();
    this.database.prepare("INSERT INTO associated_person_requests (id,workspace_id,subject_person_id,associated_entity_id,query_entity_id,question,disclosure_scope,status,requested_by,requested_at,expires_at) VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?)").run(requestId, workspaceId, required(input.subjectPersonId, "Subject person"), required(input.associatedEntityId, "Associated person or interest"), required(input.queryEntityId, "Query entity"), required(input.question, "Question"), required(input.disclosureScope, "Disclosure scope"), accountId, at, clean(input.expiresAt) || addDays(14));
    this.audit(actor, { authority: "REVIEWER", workspaceId, action: "associated_person.requested", resourceType: "ASSOCIATED_PERSON_REQUEST", resourceId: requestId, after: { disclosureScope: input.disclosureScope } }); return { id: requestId };
  }

  respondAssociatedPerson(accountId, requestId, input) {
    const actor = this.getActor(accountId); const request = this.database.prepare("SELECT * FROM associated_person_requests WHERE id=?").get(requestId); if (!request) throw new Error("Request not found");
    const response = upper(input.response); if (!["NO_KNOWN_CONNECTION","POSSIBLE_CONNECTION","KNOWN_CONNECTION","UNSURE"].includes(response)) throw new Error("Unsupported response");
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO associated_person_responses (id,request_id,response,permitted_detail,responded_at) VALUES (?,?,?,?,?)").run(id("associated-response"), requestId, response, clean(input.permittedDetail) || null, isoNow());
      this.database.prepare("UPDATE associated_person_requests SET status='ANSWERED' WHERE id=?").run(requestId);
      this.incrementCorpus(request.workspace_id, actor, "Associated-person response received");
      this.audit(actor, { authority: "RESPONDENT", workspaceId: request.workspace_id, action: "associated_person.responded", resourceType: "ASSOCIATED_PERSON_REQUEST", resourceId: requestId, after: { response, permittedDetail: input.permittedDetail || null } });
    });
    return { id: requestId, response };
  }

  previewImport(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.MANAGE_WORKSPACE, { workspaceId });
    const type = upper(input.type); const requiredColumns = { ENTITIES:["name","kind"],ALIASES:["entity_id","alias"],MATTERS:["code","title"],PARTIES:["matter_id","entity_id","role"],RELATIONSHIPS:["person_id","entity_id","relationship_type","description"],LEDGER_ENTRIES:["person_id","entity_id","context","disclosure_class"] }[type];
    if (!requiredColumns) throw new Error("Unsupported import type"); const rows = csvRows(required(input.csv, "CSV")); const errors = []; const seen = new Set();
    for (const row of rows) { for (const column of requiredColumns) if (!row[column]) errors.push({ row: row.__row, column, message: "Required value missing" }); const key = JSON.stringify(requiredColumns.map((column) => row[column]?.toLowerCase())); if (seen.has(key)) errors.push({ row: row.__row, message: "Duplicate row in import" }); else seen.add(key); }
    return { type, rows, errors, valid: errors.length === 0 };
  }

  commitImport(accountId, workspaceId, input) {
    const actor = this.getActor(accountId); const preview = this.previewImport(accountId, workspaceId, input); if (!preview.valid) throw new Error("Import has validation errors; nothing was committed"); const batchId = id("import"); const at = isoNow();
    transaction(this.database, () => {
      this.database.prepare("INSERT INTO import_batches (id,workspace_id,import_type,filename,status,row_count,accepted_count,rejected_count,report_json,created_by,created_at,committed_at) VALUES (?,?,?,?,'COMMITTED',?,?,0,'{}',?,?,?)").run(batchId, workspaceId, preview.type, input.filename || `${preview.type.toLowerCase()}.csv`, preview.rows.length, preview.rows.length, accountId, at, at);
      for (const row of preview.rows) {
        if (preview.type === "ENTITIES") {
          const entityId = id("entity"); this.database.prepare("INSERT INTO entities (id,kind,canonical_name,jurisdiction,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(entityId, upper(row.kind), row.name, row.jurisdiction || null, at, at);
          this.database.prepare("INSERT INTO professional_relationships (id,workspace_id,person_id,entity_id,relationship_type,description,source,disclosure_class,status,recorded_at) VALUES (?,?,?,?, 'WORKSPACE_ENTITY','Imported workspace entity',?,'FIRM_ONLY','CURRENT',?)").run(id("relationship"), workspaceId, actor.personId, entityId, `Import ${batchId}`, at);
        } else if (preview.type === "ALIASES") this.database.prepare("INSERT INTO entity_aliases (id,entity_id,alias,normalized_alias,source,created_at) VALUES (?,?,?,?,?,?)").run(id("alias"), row.entity_id, row.alias, normalizeName(row.alias), `Import ${batchId}`, at);
        else if (preview.type === "PARTIES") this.database.prepare("INSERT INTO matter_parties (id,matter_id,entity_id,role,provenance,created_at) VALUES (?,?,?,?,?,?)").run(id("party"), row.matter_id, row.entity_id, upper(row.role), `Import ${batchId}`, at);
        else if (preview.type === "RELATIONSHIPS") this.database.prepare("INSERT INTO professional_relationships (id,workspace_id,person_id,entity_id,relationship_type,description,source,disclosure_class,status,recorded_at) VALUES (?,?,?,?,?,?,?,'FIRM_ONLY','CURRENT',?)").run(id("relationship"), workspaceId, row.person_id, row.entity_id, upper(row.relationship_type), row.description, `Import ${batchId}`, at);
        else if (preview.type === "LEDGER_ENTRIES") this.database.prepare("INSERT INTO personal_ledger_entries (id,person_id,entity_id,context,source_workspace_id,source,disclosure_class,sharing_authorized,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id("ledger"), row.person_id, row.entity_id, row.context, workspaceId, `Import ${batchId}`, upper(row.disclosure_class), upper(row.disclosure_class) === "PORTABLE" ? 1 : 0, at);
        else if (preview.type === "MATTERS") this.database.prepare("INSERT INTO matters (id,workspace_id,code,title,matter_type,stage,status,representation_status,owner_person_id,sensitivity,opened_at,created_at,updated_at) VALUES (?,?,?,?,?,'INTAKE','ACTIVE','PROPOSED',?,'STANDARD',?,?,?)").run(id("matter"), workspaceId, row.code, row.title, upper(row.matter_type || "ENGAGEMENT"), row.owner_person_id || actor.personId, at, at, at);
      }
      this.incrementCorpus(workspaceId, actor, `Import ${batchId} committed`);
      this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "import.committed", resourceType: "IMPORT_BATCH", resourceId: batchId, after: { type: preview.type, rows: preview.rows.length } });
    });
    this.rebuildSearchIndex(); return { id: batchId, accepted: preview.rows.length, rejected: 0 };
  }

  exportData(accountId = "acct-alex", workspaceId = "ws-northstar", kind = "workspace", resourceId = null) {
    const actor = this.getActor(accountId);
    if (kind === "personal") {
      this.authorization.require(actor, ACTIONS.READ_PERSONAL_LEDGER, { ownerPersonId: actor.personId });
      const entries = this.database.prepare("SELECT l.*,e.canonical_name AS entity_name FROM personal_ledger_entries l JOIN entities e ON e.id=l.entity_id WHERE l.person_id=? AND l.disclosure_class IN ('PORTABLE','RESTRICTED') ORDER BY l.recorded_at").all(actor.personId);
      this.audit(actor, { authority: "ACCOUNT_OWNER", action: "personal_ledger.exported", resourceType: "PERSON", resourceId: actor.personId });
      return { schema: "interlocks.personal-ledger.v1", exportedAt: isoNow(), person: { id: actor.personId, name: actor.name }, entries };
    }
    this.authorization.require(actor, ACTIONS.EXPORT, { workspaceId }); let result;
    if (kind === "check") {
      const check = this.database.prepare("SELECT * FROM conflict_checks WHERE id=? AND workspace_id=?").get(resourceId, workspaceId); if (!check) throw new Error("Conflict check not found");
      result = { schema: "interlocks.conflict-check.v1", check, subjects: this.database.prepare("SELECT * FROM conflict_check_subjects WHERE conflict_check_id=?").all(resourceId), hits: this.database.prepare("SELECT * FROM conflict_hits WHERE conflict_check_id=?").all(resourceId), cases: this.database.prepare("SELECT * FROM review_cases WHERE conflict_check_id=?").all(resourceId), determinations: this.database.prepare("SELECT d.* FROM human_determinations d JOIN review_cases c ON c.id=d.case_id WHERE c.conflict_check_id=?").all(resourceId), consents: this.database.prepare("SELECT co.* FROM conflict_consents co JOIN review_cases c ON c.id=co.case_id WHERE c.conflict_check_id=?").all(resourceId), screens: this.database.prepare("SELECT s.* FROM screens s JOIN review_cases c ON c.id=s.case_id WHERE c.conflict_check_id=?").all(resourceId), exportedAt: isoNow() };
    } else result = { schema: "interlocks.workspace.v1", ...this.getSnapshot(accountId, workspaceId) };
    this.audit(actor, { authority: actor.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "FIRMADMIN", workspaceId, action: "data.exported", resourceType: kind === "check" ? "CONFLICT_CHECK" : "WORKSPACE", resourceId: resourceId || workspaceId, after: { kind } });
    return result;
  }

  globalAdminSnapshot(accountId) {
    const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.PLATFORM_ADMIN, { readOnly: true });
    const result = {
      accounts: this.database.prepare("SELECT a.id,a.primary_email AS email,a.status,a.platform_role AS platformRole,p.display_name AS personName,(SELECT COUNT(*) FROM workspace_memberships WHERE account_id=a.id AND status='ACTIVE') AS activeMemberships FROM accounts a JOIN persons p ON p.id=a.person_id ORDER BY p.display_name").all(),
      workspaces: this.database.prepare("SELECT w.id,w.name,w.status,w.registration_mode AS registrationMode,(SELECT COUNT(*) FROM workspace_memberships WHERE workspace_id=w.id AND status='ACTIVE') AS activeSeats FROM workspaces w ORDER BY w.name").all(),
      pendingInvitations: this.database.prepare("SELECT COUNT(*) AS count FROM invitations WHERE status='PENDING'").get().count,
      openCases: this.database.prepare("SELECT COUNT(*) AS count FROM review_cases WHERE status NOT IN ('CLOSED','DECLINED','WITHDRAWN')").get().count,
      recentActivity: this.database.prepare("SELECT action,resource_type AS resourceType,resource_id AS resourceId,occurred_at AS occurredAt FROM audit_events ORDER BY occurred_at DESC LIMIT 30").all(), health: this.health(),
    };
    this.audit(actor, { authority: "SUPERADMIN", action: "admin.console_viewed", resourceType: "ADMINISTRATIVE_ACTION", resourceId: actor.accountId, reason: "Platform administration" }); return result;
  }

  health() { return { status: "ok", database: "sqlite", schemaVersion: this.migrationState().at(-1)?.version || 0, corpusRevision: this.corpusRevision(), timestamp: isoNow() }; }

  resetDemo(accountId = "acct-alex") {
    if (!getConfig().demoMode) throw new Error("Demo reset is disabled"); const actor = this.getActor(accountId); this.authorization.require(actor, ACTIONS.PLATFORM_ADMIN);
    const tables = ["audit_events","seat_events","import_batches","associated_person_responses","associated_person_requests","controls","screens","conflict_consents","human_determinations","review_notes","review_cases","conflict_hit_evidence","conflict_hits","conflict_check_subjects","conflict_checks","evidence_links","resource_attachments","documents","inferences","assertions","personal_ledger_entries","professional_relationships","matter_parties","matters","invitations","workspace_roles","workspace_memberships","workspaces","entity_relationships","entity_addresses","entity_identifiers","entity_aliases","entities","auth_identities","accounts","persons"];
    transaction(this.database, () => {
      this.database.exec("DROP TRIGGER audit_events_immutable_update; DROP TRIGGER audit_events_immutable_delete;");
      for (const table of tables) this.database.exec(`DELETE FROM ${table}`);
      this.database.exec(`
        UPDATE system_state SET corpus_revision=0 WHERE id='global';
        CREATE TRIGGER audit_events_immutable_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
        CREATE TRIGGER audit_events_immutable_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are immutable'); END;
      `);
    });
    this.seedDemo(); this.rebuildSearchIndex(); this.audit(this.getActor("acct-alex"), { authority: "SUPERADMIN", workspaceId: "ws-northstar", action: "demo.reset", resourceType: "WORKSPACE", resourceId: "ws-northstar", reason: "Restore canonical demonstration workspace" }); return { reset: true };
  }

  close() { this.database.close(); }
}
