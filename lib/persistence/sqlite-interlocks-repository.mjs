import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { scoreDisclosure } from "../domain/risk-scoring.mjs";
import { InterlocksRepository } from "./interlocks-repository.mjs";

function isoNow() {
  return new Date().toISOString();
}

function addDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function runTransaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value;
}

function required(value, label) {
  const cleaned = clean(value);
  if (!cleaned) throw new Error(`${label} is required`);
  return cleaned;
}

function mapCase(row) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    summary: row.summary,
    conflictType: row.conflictType,
    riskScore: row.riskScore,
    riskLevel: row.riskLevel,
    riskFactors: JSON.parse(row.riskFactorsJson || "[]"),
    status: row.status,
    priority: row.priority,
    personId: row.personId,
    personName: row.personName,
    personTitle: row.personTitle,
    matterId: row.matterId,
    matterCode: row.matterCode,
    matterTitle: row.matterTitle,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    relationshipId: row.relationshipId,
    relationshipType: row.relationshipType,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    openedAt: row.openedAt,
    reviewDueAt: row.reviewDueAt,
    closedAt: row.closedAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteInterlocksRepository extends InterlocksRepository {
  constructor(databasePath = process.env.INTERLOCKS_DB_PATH || ".data/interlocks.db") {
    super();
    this.databasePath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (this.databasePath !== ":memory:") mkdirSync(dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.initialize();
  }

  initialize() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        department TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'Employee'
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        jurisdiction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active'
      );
      CREATE TABLE IF NOT EXISTS matters (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        stage TEXT NOT NULL,
        owner_id TEXT NOT NULL REFERENCES people(id),
        sensitivity TEXT NOT NULL DEFAULT 'standard',
        status TEXT NOT NULL DEFAULT 'Active',
        opened_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id),
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        financial_value REAL NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Self-disclosed',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        person_id TEXT NOT NULL REFERENCES people(id),
        matter_id TEXT NOT NULL REFERENCES matters(id),
        relationship_id TEXT REFERENCES relationships(id),
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        conflict_type TEXT NOT NULL,
        risk_score INTEGER NOT NULL,
        risk_level TEXT NOT NULL,
        risk_factors_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        assignee_id TEXT REFERENCES people(id),
        opened_at TEXT NOT NULL,
        review_due_at TEXT NOT NULL,
        closed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        outcome TEXT NOT NULL,
        rationale TEXT NOT NULL,
        decided_by TEXT NOT NULL,
        decided_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS controls (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        owner_id TEXT NOT NULL REFERENCES people(id),
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
      CREATE INDEX IF NOT EXISTS idx_cases_risk ON cases(risk_score DESC);
      CREATE INDEX IF NOT EXISTS idx_controls_due ON controls(status, due_at);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
    `);

    const count = this.database.prepare("SELECT COUNT(*) AS count FROM people").get().count;
    if (count === 0) this.seedDemo();
  }

  seedDemo() {
    const db = this.database;
    runTransaction(db, () => {
      const insertPerson = db.prepare(
        "INSERT INTO people (id, name, title, department, email, role) VALUES (?, ?, ?, ?, ?, ?)",
      );
      [
        ["p-alex", "Alex Morgan", "Ethics & Compliance Lead", "Office of Integrity", "alex.morgan@example.org", "Administrator"],
        ["p-maya", "Dr. Maya Chen", "Senior Research Scientist", "Applied Research", "maya.chen@example.org", "Employee"],
        ["p-daniel", "Daniel Ortiz", "Strategic Sourcing Manager", "Procurement", "daniel.ortiz@example.org", "Employee"],
        ["p-priya", "Priya Shah", "Program Director", "Programs", "priya.shah@example.org", "Employee"],
        ["p-liam", "Liam Walker", "Associate General Counsel", "Legal", "liam.walker@example.org", "Reviewer"],
        ["p-jordan", "Jordan Bell", "Principal Engineer", "Systems", "jordan.bell@example.org", "Employee"],
      ].forEach((row) => insertPerson.run(...row));

      const insertOrg = db.prepare(
        "INSERT INTO organizations (id, name, type, jurisdiction, status) VALUES (?, ?, ?, ?, ?)",
      );
      [
        ["o-meridian", "Meridian Analytics", "Vendor", "Delaware, US", "Active"],
        ["o-arcwell", "Arcwell Systems", "Vendor", "Virginia, US", "Active"],
        ["o-easton", "Easton University", "Academic partner", "Massachusetts, US", "Active"],
        ["o-lantern", "Lantern Foundation", "Funder", "New York, US", "Active"],
        ["o-civic", "CivicAI Council", "Professional body", "District of Columbia, US", "Active"],
      ].forEach((row) => insertOrg.run(...row));

      const insertMatter = db.prepare(
        "INSERT INTO matters (id, code, title, type, stage, owner_id, sensitivity, status, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      [
        ["m-aster", "AST-26-17", "Project Aster vendor selection", "Procurement", "Evaluation", "p-daniel", "restricted", "Active", "2026-07-18T13:00:00.000Z"],
        ["m-helios", "HEL-26-04", "Helios research consortium", "Sponsored research", "Proposal", "p-priya", "elevated", "Active", "2026-07-29T15:30:00.000Z"],
        ["m-northstar", "NTH-26-11", "Northstar technical hiring panel", "Personnel", "Interviews", "p-jordan", "elevated", "Active", "2026-08-02T14:00:00.000Z"],
        ["m-lantern", "LNT-26-02", "Lantern public-interest grant", "Grant", "Award review", "p-priya", "standard", "Active", "2026-06-24T12:00:00.000Z"],
        ["m-civic", "CVC-26-08", "Responsible AI advisory statement", "External engagement", "Drafting", "p-maya", "standard", "Active", "2026-08-05T16:00:00.000Z"],
      ].forEach((row) => insertMatter.run(...row));

      const insertRelationship = db.prepare(
        "INSERT INTO relationships (id, person_id, organization_id, type, description, start_date, end_date, financial_value, source, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      [
        ["r-maya-meridian", "p-maya", "o-meridian", "Fiduciary role", "Unpaid board director with voting authority.", "2024-03-01", null, 0, "Annual disclosure", 1, "2026-06-11T14:20:00.000Z"],
        ["r-daniel-arcwell", "p-daniel", "o-arcwell", "Family employment", "Sibling is a regional sales director.", "2025-09-15", null, 0, "Self-disclosed", 1, "2026-08-12T09:40:00.000Z"],
        ["r-priya-easton", "p-priya", "o-easton", "Gift or hospitality", "Accepted a $750 speaking honorarium.", "2026-05-18", "2026-05-18", 750, "Self-disclosed", 0, "2026-07-31T11:05:00.000Z"],
        ["r-jordan-lantern", "p-jordan", "o-lantern", "Financial interest", "Household owns a diversified fund with disclosed exposure.", "2023-01-01", null, 12500, "Annual disclosure", 1, "2026-06-09T15:10:00.000Z"],
        ["r-maya-civic", "p-maya", "o-civic", "Outside employment", "Paid technical adviser, limited to two hours monthly.", "2026-02-01", null, 4800, "Annual disclosure", 1, "2026-06-11T14:24:00.000Z"],
      ].forEach((row) => insertRelationship.run(...row));

      const insertCase = db.prepare(
        "INSERT INTO cases (id, reference, person_id, matter_id, relationship_id, organization_id, title, summary, conflict_type, risk_score, risk_level, risk_factors_json, status, priority, assignee_id, opened_at, review_due_at, closed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      [
        ["c-0041", "INT-2026-0041", "p-maya", "m-aster", "r-maya-meridian", "o-meridian", "Board role overlaps vendor evaluation", "Maya serves on Meridian Analytics’ board and was named as a technical evaluator for Project Aster.", "Actual", 92, "Critical", '["Fiduciary role: +55","Restricted matter: +22","Recommendation authority: +16"]', "In review", "Immediate", "p-liam", "2026-08-14T13:20:00.000Z", "2026-08-17T21:00:00.000Z", null, "2026-08-16T13:05:00.000Z"],
        ["c-0040", "INT-2026-0040", "p-daniel", "m-aster", "r-daniel-arcwell", "o-arcwell", "Family tie to bidding supplier", "Daniel’s sibling works for Arcwell Systems, one of four bidders in the active procurement.", "Apparent", 72, "High", '["Family employment: +32","Restricted matter: +22","Decision authority: +24"]', "Awaiting response", "High", "p-alex", "2026-08-12T09:42:00.000Z", "2026-08-18T21:00:00.000Z", null, "2026-08-15T18:44:00.000Z"],
        ["c-0039", "INT-2026-0039", "p-priya", "m-helios", "r-priya-easton", "o-easton", "Honorarium from consortium member", "A recent Easton University honorarium was disclosed before the Helios proposal team was finalized.", "Potential", 49, "Moderate", '["Gift or hospitality: +25","Elevated matter: +14","Advisory influence: +8"]', "In review", "Normal", "p-liam", "2026-08-10T15:10:00.000Z", "2026-08-21T21:00:00.000Z", null, "2026-08-15T15:25:00.000Z"],
        ["c-0038", "INT-2026-0038", "p-jordan", "m-lantern", "r-jordan-lantern", "o-lantern", "Indirect fund exposure to grantor", "The disclosed holding is diversified and Jordan has no role in the grant award decision.", "Potential", 31, "Low", '["Diversified financial interest: +18","Standard matter: +6","No decision authority: +0"]', "Resolved", "Low", "p-alex", "2026-08-06T12:30:00.000Z", "2026-08-13T21:00:00.000Z", "2026-08-09T16:05:00.000Z", "2026-08-09T16:05:00.000Z"],
        ["c-0037", "INT-2026-0037", "p-maya", "m-civic", "r-maya-civic", "o-civic", "Outside advisory work intersects statement", "Maya advises CivicAI Council and is contributing to an organizational statement requested by that council.", "Apparent", 61, "High", '["Outside employment: +45","Standard matter: +6","Advisory influence: +8"]', "Managed", "High", "p-alex", "2026-08-05T17:15:00.000Z", "2026-08-12T21:00:00.000Z", null, "2026-08-13T10:30:00.000Z"],
      ].forEach((row) => insertCase.run(...row));

      const insertDecision = db.prepare(
        "INSERT INTO decisions (id, case_id, outcome, rationale, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      insertDecision.run("d-0038", "c-0038", "No conflict", "The holding is indirect, diversified, and does not create material influence over the grant review.", "Alex Morgan", "2026-08-09T16:05:00.000Z");
      insertDecision.run("d-0037", "c-0037", "Manage", "The external role is permitted with authorship disclosure and independent final approval.", "Alex Morgan", "2026-08-13T10:30:00.000Z");

      const insertControl = db.prepare(
        "INSERT INTO controls (id, case_id, type, description, owner_id, due_at, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      [
        ["ctl-01", "c-0041", "Recusal", "Remove Maya from scoring, deliberations, and access to evaluator notes.", "p-daniel", "2026-08-17T18:00:00.000Z", "Open", null],
        ["ctl-02", "c-0041", "Access control", "Confirm Aster workspace permissions no longer include Maya.", "p-alex", "2026-08-18T16:00:00.000Z", "Open", null],
        ["ctl-03", "c-0040", "Certification", "Obtain written non-participation certification from Daniel.", "p-alex", "2026-08-18T21:00:00.000Z", "Open", null],
        ["ctl-04", "c-0037", "Disclosure", "Add external advisory role to the published contributor note.", "p-priya", "2026-08-19T21:00:00.000Z", "Open", null],
        ["ctl-05", "c-0037", "Independent approval", "Route final statement through Liam before release.", "p-liam", "2026-08-22T21:00:00.000Z", "Open", null],
        ["ctl-06", "c-0038", "Documentation", "Record fund diversification analysis in the matter file.", "p-alex", "2026-08-09T16:05:00.000Z", "Complete", "2026-08-09T16:05:00.000Z"],
      ].forEach((row) => insertControl.run(...row));

      const insertNote = db.prepare(
        "INSERT INTO notes (id, case_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      insertNote.run("n-01", "c-0041", "Liam Walker", "Procurement confirmed Maya has not submitted an evaluator score.", "2026-08-16T13:05:00.000Z");
      insertNote.run("n-02", "c-0040", "Alex Morgan", "Requested Daniel’s acknowledgement and the bidder contact protocol.", "2026-08-15T18:44:00.000Z");

      const insertAudit = db.prepare(
        "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, summary, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      [
        ["a-01", "Case", "c-0041", "note.added", "Liam Walker", "Added a review note to INT-2026-0041", "{}", "2026-08-16T13:05:00.000Z"],
        ["a-02", "Case", "c-0040", "status.changed", "Alex Morgan", "Moved INT-2026-0040 to Awaiting response", '{"from":"New","to":"Awaiting response"}', "2026-08-15T18:44:00.000Z"],
        ["a-03", "Case", "c-0039", "assigned", "Alex Morgan", "Assigned INT-2026-0039 to Liam Walker", "{}", "2026-08-15T15:25:00.000Z"],
        ["a-04", "Case", "c-0037", "decision.recorded", "Alex Morgan", "Recorded a Manage decision for INT-2026-0037", '{"outcome":"Manage"}', "2026-08-13T10:30:00.000Z"],
        ["a-05", "Relationship", "r-daniel-arcwell", "disclosure.created", "Daniel Ortiz", "Disclosed a family employment relationship with Arcwell Systems", "{}", "2026-08-12T09:40:00.000Z"],
        ["a-06", "Case", "c-0038", "case.resolved", "Alex Morgan", "Resolved INT-2026-0038 with no conflict", '{"outcome":"No conflict"}', "2026-08-09T16:05:00.000Z"],
      ].forEach((row) => insertAudit.run(...row));
    });
  }

  getSnapshot() {
    const db = this.database;
    const cases = db.prepare(`
      SELECT c.id, c.reference, c.title, c.summary,
        c.conflict_type AS conflictType, c.risk_score AS riskScore,
        c.risk_level AS riskLevel, c.risk_factors_json AS riskFactorsJson,
        c.status, c.priority, c.person_id AS personId, p.name AS personName,
        p.title AS personTitle, c.matter_id AS matterId, m.code AS matterCode,
        m.title AS matterTitle, c.organization_id AS organizationId,
        o.name AS organizationName, c.relationship_id AS relationshipId,
        r.type AS relationshipType, c.assignee_id AS assigneeId,
        a.name AS assigneeName, c.opened_at AS openedAt,
        c.review_due_at AS reviewDueAt, c.closed_at AS closedAt,
        c.updated_at AS updatedAt
      FROM cases c
      JOIN people p ON p.id = c.person_id
      JOIN matters m ON m.id = c.matter_id
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN relationships r ON r.id = c.relationship_id
      LEFT JOIN people a ON a.id = c.assignee_id
      ORDER BY CASE c.status WHEN 'Resolved' THEN 2 ELSE 1 END, c.risk_score DESC, c.opened_at DESC
    `).all().map(mapCase);

    const people = db.prepare(`
      SELECT p.id, p.name, p.title, p.department, p.email, p.role,
        COUNT(DISTINCT r.id) AS relationshipCount,
        COUNT(DISTINCT CASE WHEN c.status != 'Resolved' THEN c.id END) AS openCaseCount
      FROM people p
      LEFT JOIN relationships r ON r.person_id = p.id
      LEFT JOIN cases c ON c.person_id = p.id
      GROUP BY p.id ORDER BY p.name
    `).all();

    const organizations = db.prepare("SELECT * FROM organizations ORDER BY name").all();
    const matters = db.prepare(`
      SELECT m.id, m.code, m.title, m.type, m.stage, m.sensitivity, m.status,
        m.opened_at AS openedAt, p.name AS ownerName,
        COUNT(DISTINCT CASE WHEN c.status != 'Resolved' THEN c.id END) AS openCaseCount
      FROM matters m JOIN people p ON p.id = m.owner_id
      LEFT JOIN cases c ON c.matter_id = m.id
      GROUP BY m.id ORDER BY m.opened_at DESC
    `).all();

    const relationships = db.prepare(`
      SELECT r.id, r.person_id AS personId, p.name AS personName,
        r.organization_id AS organizationId, o.name AS organizationName,
        r.type, r.description, r.start_date AS startDate, r.end_date AS endDate,
        r.financial_value AS financialValue, r.source, r.active,
        r.created_at AS createdAt
      FROM relationships r JOIN people p ON p.id = r.person_id
      JOIN organizations o ON o.id = r.organization_id
      ORDER BY r.active DESC, r.created_at DESC
    `).all().map((row) => ({ ...row, active: Boolean(row.active) }));

    const controls = db.prepare(`
      SELECT ctl.id, ctl.case_id AS caseId, c.reference AS caseReference,
        ctl.type, ctl.description, ctl.owner_id AS ownerId, p.name AS ownerName,
        ctl.due_at AS dueAt, ctl.status, ctl.completed_at AS completedAt
      FROM controls ctl JOIN cases c ON c.id = ctl.case_id
      JOIN people p ON p.id = ctl.owner_id
      ORDER BY CASE ctl.status WHEN 'Open' THEN 1 ELSE 2 END, ctl.due_at
    `).all();

    const decisions = db.prepare(`
      SELECT d.id, d.case_id AS caseId, d.outcome, d.rationale,
        d.decided_by AS decidedBy, d.decided_at AS decidedAt
      FROM decisions d ORDER BY d.decided_at DESC
    `).all();
    const notes = db.prepare(`
      SELECT id, case_id AS caseId, author, body, created_at AS createdAt
      FROM notes ORDER BY created_at DESC
    `).all();
    const audit = db.prepare(`
      SELECT id, entity_type AS entityType, entity_id AS entityId,
        action, actor, summary, metadata_json AS metadataJson, created_at AS createdAt
      FROM audit_events ORDER BY created_at DESC LIMIT 250
    `).all().map((row) => ({ ...row, metadata: JSON.parse(row.metadataJson || "{}") }));

    const openCases = cases.filter((item) => item.status !== "Resolved");
    const openControls = controls.filter((item) => item.status === "Open");
    const stats = {
      openCases: openCases.length,
      urgentCases: openCases.filter((item) => ["Critical", "High"].includes(item.riskLevel)).length,
      dueSoon: openControls.filter((item) => new Date(item.dueAt) <= new Date(addDays(7))).length,
      managed: cases.filter((item) => item.status === "Managed").length,
      medianReviewDays: 3.4,
      riskMix: ["Critical", "High", "Moderate", "Low"].map((level) => ({
        level,
        count: openCases.filter((item) => item.riskLevel === level).length,
      })),
    };

    return {
      generatedAt: isoNow(),
      currentUser: people.find((person) => person.id === "p-alex"),
      stats,
      cases,
      people,
      organizations,
      matters,
      relationships,
      controls,
      decisions,
      notes,
      audit,
    };
  }

  nextReference() {
    const max = this.database.prepare(`
      SELECT MAX(CAST(SUBSTR(reference, 10) AS INTEGER)) AS value FROM cases
      WHERE reference LIKE 'INT-2026-%'
    `).get().value ?? 0;
    return `INT-2026-${String(Number(max) + 1).padStart(4, "0")}`;
  }

  createDisclosure(input, actor = "Alex Morgan") {
    const personId = required(input.personId, "Person");
    const matterId = required(input.matterId, "Matter");
    const organizationId = required(input.organizationId, "Organization");
    const relationshipType = required(input.relationshipType, "Relationship type");
    const description = required(input.description, "Description");
    const person = this.database.prepare("SELECT * FROM people WHERE id = ?").get(personId);
    const matter = this.database.prepare("SELECT * FROM matters WHERE id = ?").get(matterId);
    const organization = this.database.prepare("SELECT * FROM organizations WHERE id = ?").get(organizationId);
    if (!person || !matter || !organization) throw new Error("The selected person, matter, or organization no longer exists");

    const { score, level, factors } = scoreDisclosure({
      relationshipType,
      matterSensitivity: matter.sensitivity,
      influence: input.influence,
      financialValue: input.financialValue,
    });
    const now = isoNow();
    const relationshipId = `rel-${randomUUID()}`;
    const caseId = `case-${randomUUID()}`;
    const reference = this.nextReference();
    const title = clean(input.title) || `${relationshipType} involving ${organization.name}`;
    const dueDays = level === "Critical" ? 1 : level === "High" ? 3 : level === "Moderate" ? 7 : 14;

    runTransaction(this.database, () => {
      this.database.prepare(`
        INSERT INTO relationships (id, person_id, organization_id, type, description, start_date, end_date, financial_value, source, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'Self-disclosed', 1, ?)
      `).run(relationshipId, personId, organizationId, relationshipType, description, clean(input.startDate) || now.slice(0, 10), Number(input.financialValue) || 0, now);
      this.database.prepare(`
        INSERT INTO cases (id, reference, person_id, matter_id, relationship_id, organization_id, title, summary, conflict_type, risk_score, risk_level, risk_factors_json, status, priority, assignee_id, opened_at, review_due_at, closed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Potential', ?, ?, ?, 'New', ?, 'p-alex', ?, ?, NULL, ?)
      `).run(caseId, reference, personId, matterId, relationshipId, organizationId, title, description, score, level, JSON.stringify(factors), level === "Critical" ? "Immediate" : level === "High" ? "High" : "Normal", now, addDays(dueDays), now);
      this.audit("Case", caseId, "disclosure.created", actor, `Created ${reference} from a new disclosure`, { score, level });
    });

    return { id: caseId, reference, score, level };
  }

  audit(entityType, entityId, action, actor, summary, metadata = {}) {
    this.database.prepare(`
      INSERT INTO audit_events (id, entity_type, entity_id, action, actor, summary, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`audit-${randomUUID()}`, entityType, entityId, action, actor, summary, JSON.stringify(metadata), isoNow());
  }

  recordCaseAction(caseId, action, actor = "Alex Morgan") {
    const item = this.database.prepare("SELECT * FROM cases WHERE id = ?").get(caseId);
    if (!item) throw new Error("Case not found");
    const now = isoNow();

    runTransaction(this.database, () => {
      if (action.type === "note") {
        const body = required(action.body, "Note");
        this.database.prepare("INSERT INTO notes (id, case_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(`note-${randomUUID()}`, caseId, actor, body, now);
        this.database.prepare("UPDATE cases SET updated_at = ? WHERE id = ?").run(now, caseId);
        this.audit("Case", caseId, "note.added", actor, `Added a review note to ${item.reference}`);
        return;
      }

      if (action.type === "status") {
        const status = required(action.status, "Status");
        const allowed = ["New", "In review", "Awaiting response", "Managed", "Resolved"];
        if (!allowed.includes(status)) throw new Error("Unsupported case status");
        this.database.prepare("UPDATE cases SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
          .run(status, status === "Resolved" ? now : null, now, caseId);
        this.audit("Case", caseId, "status.changed", actor, `Moved ${item.reference} to ${status}`, { from: item.status, to: status });
        return;
      }

      if (action.type === "decision") {
        const outcome = required(action.outcome, "Outcome");
        const rationale = required(action.rationale, "Rationale");
        const allowed = ["No conflict", "Manage", "Recuse", "Prohibit"];
        if (!allowed.includes(outcome)) throw new Error("Unsupported decision outcome");
        this.database.prepare("INSERT INTO decisions (id, case_id, outcome, rationale, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(`decision-${randomUUID()}`, caseId, outcome, rationale, actor, now);
        const status = outcome === "No conflict" || outcome === "Prohibit" ? "Resolved" : "Managed";
        this.database.prepare("UPDATE cases SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?")
          .run(status, status === "Resolved" ? now : null, now, caseId);
        if (clean(action.controlDescription)) {
          const ownerId = clean(action.ownerId) || "p-alex";
          this.database.prepare("INSERT INTO controls (id, case_id, type, description, owner_id, due_at, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'Open', NULL)")
            .run(`control-${randomUUID()}`, caseId, outcome === "Recuse" ? "Recusal" : "Mitigation", clean(action.controlDescription), ownerId, clean(action.dueAt) || addDays(7));
        }
        this.audit("Case", caseId, "decision.recorded", actor, `Recorded a ${outcome} decision for ${item.reference}`, { outcome });
        return;
      }

      throw new Error("Unsupported case action");
    });
    return { id: caseId };
  }

  completeControl(controlId, actor = "Alex Morgan") {
    const control = this.database.prepare(`
      SELECT ctl.*, c.reference FROM controls ctl JOIN cases c ON c.id = ctl.case_id WHERE ctl.id = ?
    `).get(controlId);
    if (!control) throw new Error("Control not found");
    if (control.status === "Complete") return { id: controlId, status: "Complete" };
    const now = isoNow();
    runTransaction(this.database, () => {
      this.database.prepare("UPDATE controls SET status = 'Complete', completed_at = ? WHERE id = ?").run(now, controlId);
      this.audit("Control", controlId, "control.completed", actor, `Completed ${control.type} for ${control.reference}`);
    });
    return { id: controlId, status: "Complete" };
  }

  exportData() {
    return this.getSnapshot();
  }

  resetDemo(actor = "Alex Morgan") {
    const tables = ["audit_events", "notes", "controls", "decisions", "cases", "relationships", "matters", "organizations", "people"];
    runTransaction(this.database, () => tables.forEach((table) => this.database.exec(`DELETE FROM ${table}`)));
    this.seedDemo();
    this.audit("System", "demo", "demo.reset", actor, "Reset the local demonstration workspace");
    return { reset: true };
  }

  close() {
    this.database.close();
  }
}
