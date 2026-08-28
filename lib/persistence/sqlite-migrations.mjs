const RESOURCE_TYPES = [
  "PERSON", "ACCOUNT", "ENTITY", "WORKSPACE", "MEMBERSHIP", "MATTER", "RELATIONSHIP",
  "ASSERTION", "INFERENCE", "CONFLICT_CHECK", "CONFLICT_HIT", "REVIEW_CASE", "DETERMINATION",
  "CONSENT", "SCREEN", "CONTROL", "POLICY_QUESTION", "POLICY_EVALUATION",
  "ASSOCIATED_PERSON_REQUEST", "IMPORT_BATCH", "ADMINISTRATIVE_ACTION",
];

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function now() { return new Date().toISOString(); }

function createEntitySearchIndex(db, { contentless = false } = {}) {
  try {
    db.exec(`CREATE VIRTUAL TABLE entity_search USING fts5(entity_id UNINDEXED, canonical_name, aliases${contentless ? ", content=''" : ""});`);
  } catch (error) {
    if (!/no such module:\s*fts5/i.test(String(error?.message))) throw error;
    db.exec(`
      CREATE TABLE entity_search (
        entity_id TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX entity_search_name_idx ON entity_search(canonical_name);
    `);
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE system_state (id TEXT PRIMARY KEY CHECK (id = 'global'), corpus_revision INTEGER NOT NULL DEFAULT 0);
    INSERT INTO system_state (id, corpus_revision) VALUES ('global', 0);

    CREATE TABLE persons (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, primary_profession TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id), primary_email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('INVITED','ACTIVE','DISABLED','CLOSED')),
      platform_role TEXT NOT NULL DEFAULT 'USER' CHECK (platform_role IN ('USER','SUPERADMIN')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT
    );
    CREATE TABLE auth_identities (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), provider TEXT NOT NULL,
      issuer TEXT NOT NULL, provider_subject TEXT NOT NULL, email_at_link_time TEXT,
      created_at TEXT NOT NULL, last_authenticated_at TEXT, UNIQUE (issuer, provider_subject)
    );

    CREATE TABLE entities (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('PERSON','ORGANIZATION','PROPERTY','TRUST','ESTATE','GOVERNMENT_BODY','OTHER')),
      canonical_name TEXT NOT NULL, person_id TEXT REFERENCES persons(id), jurisdiction TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE entity_aliases (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL);
    CREATE TABLE entity_identifiers (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), scheme TEXT NOT NULL, value TEXT NOT NULL, jurisdiction TEXT, created_at TEXT NOT NULL, UNIQUE(scheme, value));
    CREATE TABLE entity_addresses (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), label TEXT, address_text TEXT NOT NULL, normalized_address TEXT NOT NULL, effective_from TEXT, effective_to TEXT, created_at TEXT NOT NULL);
    CREATE TABLE entity_relationships (
      id TEXT PRIMARY KEY, from_entity_id TEXT NOT NULL REFERENCES entities(id), to_entity_id TEXT NOT NULL REFERENCES entities(id),
      relationship_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CURRENT', effective_from TEXT, effective_to TEXT,
      recorded_at TEXT NOT NULL, provenance TEXT, CHECK (from_entity_id != to_entity_id)
    );

    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, organization_entity_id TEXT REFERENCES entities(id), name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE', registration_mode TEXT NOT NULL DEFAULT 'INVITE_ONLY',
      settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE workspace_memberships (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT REFERENCES accounts(id),
      person_id TEXT NOT NULL REFERENCES persons(id), invited_by TEXT REFERENCES accounts(id), invited_at TEXT,
      joined_at TEXT, departed_at TEXT, status TEXT NOT NULL CHECK (status IN ('INVITED','ACTIVE','DEPARTED','REVOKED')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, person_id)
    );
    CREATE TABLE workspace_roles (
      membership_id TEXT NOT NULL REFERENCES workspace_memberships(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('MEMBER','REVIEWER','FIRMADMIN')), PRIMARY KEY (membership_id, role)
    );
    CREATE TABLE invitations (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL,
      person_id TEXT REFERENCES persons(id), token_hash TEXT NOT NULL UNIQUE, roles_json TEXT NOT NULL,
      invited_by TEXT NOT NULL REFERENCES accounts(id), invited_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      accepted_at TEXT, revoked_at TEXT, status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED'))
    );

    CREATE TABLE matters (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), code TEXT NOT NULL,
      title TEXT NOT NULL, matter_type TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL,
      representation_status TEXT NOT NULL DEFAULT 'PROPOSED', owner_person_id TEXT REFERENCES persons(id),
      sensitivity TEXT NOT NULL DEFAULT 'STANDARD', opened_at TEXT NOT NULL, closed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, code)
    );
    CREATE TABLE matter_parties (
      id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES matters(id), entity_id TEXT NOT NULL REFERENCES entities(id),
      role TEXT NOT NULL CHECK (role IN ('CLIENT','FORMER_CLIENT','PROSPECTIVE_CLIENT','ADVERSE_PARTY','RELATED_PARTY','CONSTITUENT','MATTER_PARTICIPANT','OTHER')),
      status TEXT NOT NULL DEFAULT 'ACTIVE', effective_from TEXT, effective_to TEXT, provenance TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE professional_relationships (
      id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), person_id TEXT NOT NULL REFERENCES persons(id),
      entity_id TEXT NOT NULL REFERENCES entities(id), relationship_type TEXT NOT NULL, representation_status TEXT,
      description TEXT NOT NULL, effective_from TEXT, effective_to TEXT, source TEXT NOT NULL,
      disclosure_class TEXT NOT NULL DEFAULT 'FIRM_ONLY' CHECK (disclosure_class IN ('PORTABLE','RESTRICTED','CONSENT_REQUIRED','FIRM_ONLY')),
      status TEXT NOT NULL DEFAULT 'CURRENT', recorded_at TEXT NOT NULL
    );
    CREATE TABLE personal_ledger_entries (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id), entity_id TEXT NOT NULL REFERENCES entities(id),
      relationship_id TEXT REFERENCES professional_relationships(id), context TEXT NOT NULL, involvement TEXT,
      effective_from TEXT, effective_to TEXT, source_workspace_id TEXT REFERENCES workspaces(id), source TEXT NOT NULL,
      provenance TEXT, disclosure_class TEXT NOT NULL CHECK (disclosure_class IN ('PORTABLE','RESTRICTED','CONSENT_REQUIRED','FIRM_ONLY')),
      sharing_authorized INTEGER NOT NULL DEFAULT 0, recorded_at TEXT NOT NULL
    );

    CREATE TABLE assertions (
      id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL, predicate TEXT NOT NULL, object_type TEXT, object_id TEXT, object_text TEXT,
      status TEXT NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','DISPUTED','RETRACTED','SUPERSEDED')),
      confidentiality_scope TEXT NOT NULL DEFAULT 'WORKSPACE', provenance TEXT,
      recorded_by TEXT REFERENCES accounts(id), recorded_at TEXT NOT NULL, effective_from TEXT, effective_to TEXT,
      supersedes_id TEXT REFERENCES assertions(id), superseded_at TEXT
    );
    CREATE TABLE inferences (
      id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL, inference_type TEXT NOT NULL, conclusion TEXT NOT NULL,
      match_confidence TEXT CHECK (match_confidence IN ('EXACT','STRONG','POSSIBLE','RELATED') OR match_confidence IS NULL),
      evidence_summary TEXT NOT NULL, corpus_revision INTEGER NOT NULL, recorded_at TEXT NOT NULL,
      effective_from TEXT, effective_to TEXT, supersedes_id TEXT REFERENCES inferences(id), superseded_at TEXT
    );
    CREATE TRIGGER inferences_immutable BEFORE UPDATE ON inferences BEGIN SELECT RAISE(ABORT, 'Inferences are immutable; create a superseding inference'); END;

    CREATE TABLE documents (
      id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), filename TEXT NOT NULL, media_type TEXT NOT NULL,
      size INTEGER NOT NULL, sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, uploaded_by TEXT NOT NULL REFERENCES accounts(id),
      uploaded_at TEXT NOT NULL, description TEXT, confidentiality_scope TEXT NOT NULL DEFAULT 'WORKSPACE',
      status TEXT NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED','WITHDRAWN')),
      supersedes_document_id TEXT REFERENCES documents(id)
    );
    CREATE TABLE resource_attachments (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL, attachment_role TEXT NOT NULL DEFAULT 'GENERAL', attached_by TEXT NOT NULL REFERENCES accounts(id),
      attached_at TEXT NOT NULL, note TEXT, UNIQUE(document_id, resource_type, resource_id, attachment_role)
    );
    CREATE TABLE evidence_links (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), assertion_id TEXT NOT NULL REFERENCES assertions(id),
      role TEXT NOT NULL CHECK (role IN ('SUPPORTS','CONTRADICTS','QUALIFIES','SOURCE_OF','SUPERSEDES')),
      page_start INTEGER, page_end INTEGER, section TEXT, paragraph TEXT, note TEXT,
      linked_by TEXT NOT NULL REFERENCES accounts(id), linked_at TEXT NOT NULL
    );

    CREATE TABLE conflict_checks (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), matter_id TEXT REFERENCES matters(id),
      reference TEXT NOT NULL, status TEXT NOT NULL, workflow_state TEXT NOT NULL CHECK (workflow_state IN ('GREEN','YELLOW','RED')),
      created_by TEXT NOT NULL REFERENCES accounts(id), executed_at TEXT NOT NULL, corpus_revision INTEGER NOT NULL,
      subjects_snapshot_json TEXT NOT NULL, knowledge_snapshot_json TEXT NOT NULL, completed_at TEXT, UNIQUE(workspace_id, reference)
    );
    CREATE TABLE conflict_check_subjects (
      id TEXT PRIMARY KEY, conflict_check_id TEXT NOT NULL REFERENCES conflict_checks(id) ON DELETE CASCADE,
      entity_id TEXT REFERENCES entities(id), supplied_name TEXT NOT NULL, role TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE conflict_hits (
      id TEXT PRIMARY KEY, conflict_check_id TEXT NOT NULL REFERENCES conflict_checks(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES conflict_check_subjects(id), matched_entity_id TEXT REFERENCES entities(id),
      source_resource_type TEXT NOT NULL, source_resource_id TEXT NOT NULL,
      match_confidence TEXT NOT NULL CHECK (match_confidence IN ('EXACT','STRONG','POSSIBLE','RELATED')),
      workflow_state TEXT NOT NULL CHECK (workflow_state IN ('GREEN','YELLOW','RED')),
      explanation_json TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'UNREVIEWED', reviewed_by TEXT REFERENCES accounts(id),
      reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE conflict_hit_evidence (
      id TEXT PRIMARY KEY, conflict_hit_id TEXT NOT NULL REFERENCES conflict_hits(id) ON DELETE CASCADE,
      evidence_type TEXT NOT NULL, evidence_id TEXT NOT NULL, explanation TEXT NOT NULL
    );

    CREATE TABLE review_cases (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), conflict_check_id TEXT REFERENCES conflict_checks(id),
      conflict_hit_id TEXT REFERENCES conflict_hits(id), reference TEXT NOT NULL, person_id TEXT REFERENCES persons(id),
      matter_id TEXT REFERENCES matters(id), entity_id TEXT REFERENCES entities(id), relationship_id TEXT REFERENCES professional_relationships(id),
      title TEXT NOT NULL, summary TEXT NOT NULL, workflow_state TEXT NOT NULL CHECK (workflow_state IN ('GREEN','YELLOW','RED')),
      human_disposition TEXT NOT NULL DEFAULT 'UNREVIEWED', status TEXT NOT NULL, assigned_account_id TEXT REFERENCES accounts(id),
      opened_at TEXT NOT NULL, review_due_at TEXT, closed_at TEXT, updated_at TEXT NOT NULL, UNIQUE(workspace_id, reference)
    );
    CREATE TABLE review_notes (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id) ON DELETE CASCADE, author_account_id TEXT NOT NULL REFERENCES accounts(id), body TEXT NOT NULL, note_type TEXT NOT NULL DEFAULT 'REVIEW', created_at TEXT NOT NULL);
    CREATE TABLE human_determinations (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id), disposition TEXT NOT NULL,
      rationale TEXT NOT NULL, rule_basis TEXT, jurisdiction TEXT, determined_by TEXT NOT NULL REFERENCES accounts(id),
      determined_at TEXT NOT NULL, supersedes_id TEXT REFERENCES human_determinations(id), superseded_at TEXT
    );
    CREATE TRIGGER determinations_immutable BEFORE UPDATE ON human_determinations BEGIN SELECT RAISE(ABORT, 'Determinations are immutable; create a superseding determination'); END;
    CREATE TABLE conflict_consents (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id), affected_entity_id TEXT REFERENCES entities(id),
      consent_type TEXT NOT NULL, rule_basis TEXT, jurisdiction TEXT, status TEXT NOT NULL CHECK (status IN ('REQUESTED','OBTAINED','DECLINED','REVOKED','EXPIRED','SUPERSEDED')),
      evidence_requirement TEXT, scope TEXT NOT NULL, conditions TEXT, obtained_at TEXT, effective_from TEXT, expires_at TEXT,
      revoked_at TEXT, recorded_by TEXT NOT NULL REFERENCES accounts(id), provenance TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE screens (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id), screened_person_id TEXT NOT NULL REFERENCES persons(id),
      matter_id TEXT NOT NULL REFERENCES matters(id), effective_at TEXT NOT NULL, restrictions TEXT NOT NULL,
      fee_restrictions TEXT, communications_restrictions TEXT, notice_requirements TEXT, notice_recipients TEXT,
      status TEXT NOT NULL CHECK (status IN ('PROPOSED','ACTIVE','INCOMPLETE','ENDED','BREACHED')),
      created_by TEXT NOT NULL REFERENCES accounts(id), reviewed_by TEXT REFERENCES accounts(id), created_at TEXT NOT NULL, reviewed_at TEXT
    );
    CREATE TABLE controls (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES review_cases(id), control_type TEXT NOT NULL,
      description TEXT NOT NULL, owner_person_id TEXT NOT NULL REFERENCES persons(id), mandatory INTEGER NOT NULL DEFAULT 1,
      due_at TEXT, status TEXT NOT NULL CHECK (status IN ('OPEN','COMPLETE','CANCELLED')), completed_at TEXT, created_at TEXT NOT NULL
    );

    CREATE TABLE associated_person_requests (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), subject_person_id TEXT NOT NULL REFERENCES persons(id),
      associated_entity_id TEXT NOT NULL REFERENCES entities(id), query_entity_id TEXT NOT NULL REFERENCES entities(id),
      question TEXT NOT NULL, disclosure_scope TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL REFERENCES accounts(id),
      requested_at TEXT NOT NULL, expires_at TEXT
    );
    CREATE TABLE associated_person_responses (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES associated_person_requests(id),
      response TEXT NOT NULL CHECK (response IN ('NO_KNOWN_CONNECTION','POSSIBLE_CONNECTION','KNOWN_CONNECTION','UNSURE')),
      permitted_detail TEXT, responded_at TEXT NOT NULL
    );
    CREATE TABLE import_batches (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), import_type TEXT NOT NULL, filename TEXT NOT NULL,
      status TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0, accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0, report_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL REFERENCES accounts(id),
      created_at TEXT NOT NULL, committed_at TEXT
    );
    CREATE TABLE seat_events (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), membership_id TEXT NOT NULL REFERENCES workspace_memberships(id),
      delta INTEGER NOT NULL CHECK (delta IN (-1,1)), reason TEXT NOT NULL, effective_at TEXT NOT NULL
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY, actor_account_id TEXT REFERENCES accounts(id), actor_person_id TEXT REFERENCES persons(id),
      authority_used TEXT NOT NULL, workspace_scope TEXT REFERENCES workspaces(id), action TEXT NOT NULL,
      resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, before_json TEXT, after_json TEXT,
      occurred_at TEXT NOT NULL, reason TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX idx_membership_workspace ON workspace_memberships(workspace_id, status);
    CREATE INDEX idx_entities_name ON entities(canonical_name);
    CREATE INDEX idx_alias_normalized ON entity_aliases(normalized_alias);
    CREATE INDEX idx_relationship_person ON professional_relationships(person_id, workspace_id);
    CREATE INDEX idx_assertion_subject ON assertions(subject_type, subject_id, status);
    CREATE INDEX idx_inference_subject ON inferences(subject_type, subject_id, recorded_at DESC);
    CREATE INDEX idx_checks_workspace ON conflict_checks(workspace_id, executed_at DESC);
    CREATE INDEX idx_cases_workspace ON review_cases(workspace_id, workflow_state, updated_at DESC);
    CREATE INDEX idx_audit_scope ON audit_events(workspace_scope, occurred_at DESC);
  `);
}

function importLegacy(db) {
  if (!tableExists(db, "legacy_people")) return;
  const timestamp = now();
  db.prepare("INSERT INTO entities (id, kind, canonical_name, jurisdiction, status, created_at, updated_at) VALUES ('ent-demo-firm','ORGANIZATION','Northstar Advisory Group','District of Columbia, US','ACTIVE',?,?)").run(timestamp, timestamp);
  db.prepare("INSERT INTO workspaces (id, organization_entity_id, name, registration_mode, created_at, updated_at) VALUES ('ws-demo','ent-demo-firm','Northstar Advisory Group','INVITE_ONLY',?,?)").run(timestamp, timestamp);
  for (const person of db.prepare("SELECT * FROM legacy_people").all()) {
    const accountId = `acct-${String(person.id).replace(/^p-/, "")}`;
    db.prepare("INSERT INTO persons (id, display_name, primary_profession, created_at, updated_at) VALUES (?,?,?,?,?)").run(person.id, person.name, person.title, timestamp, timestamp);
    db.prepare("INSERT INTO accounts (id, person_id, primary_email, status, platform_role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(accountId, person.id, person.email, "ACTIVE", person.id === "p-alex" ? "SUPERADMIN" : "USER", timestamp, timestamp);
    db.prepare("INSERT INTO auth_identities (id, account_id, provider, issuer, provider_subject, email_at_link_time, created_at) VALUES (?,?,?,?,?,?,?)")
      .run(`auth-${accountId}`, accountId, "development", "interlocks-local", accountId, person.email, timestamp);
    db.prepare("INSERT INTO entities (id, kind, canonical_name, person_id, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run(`ent-${person.id}`, "PERSON", person.name, person.id, timestamp, timestamp);
    db.prepare("INSERT INTO workspace_memberships (id, workspace_id, account_id, person_id, joined_at, status, created_at, updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)")
      .run(`mem-${person.id}`, "ws-demo", accountId, person.id, timestamp, timestamp, timestamp);
    const role = person.role === "Administrator" ? "FIRMADMIN" : person.role === "Reviewer" ? "REVIEWER" : "MEMBER";
    db.prepare("INSERT INTO workspace_roles (membership_id, role) VALUES (?,?)").run(`mem-${person.id}`, role);
    if (role !== "MEMBER") db.prepare("INSERT INTO workspace_roles (membership_id, role) VALUES (?, 'MEMBER')").run(`mem-${person.id}`);
    db.prepare("INSERT INTO seat_events (id, workspace_id, membership_id, delta, reason, effective_at) VALUES (?,?,?,?,?,?)")
      .run(`seat-${person.id}`, "ws-demo", `mem-${person.id}`, 1, "Legacy membership migrated", timestamp);
  }
  for (const entity of db.prepare("SELECT * FROM legacy_organizations").all()) {
    db.prepare("INSERT INTO entities (id, kind, canonical_name, jurisdiction, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(entity.id, "ORGANIZATION", entity.name, entity.jurisdiction, String(entity.status).toUpperCase(), timestamp, timestamp);
  }
  for (const matter of db.prepare("SELECT * FROM legacy_matters").all()) {
    db.prepare(`INSERT INTO matters (id, workspace_id, code, title, matter_type, stage, status, representation_status, owner_person_id, sensitivity, opened_at, created_at, updated_at)
      VALUES (?, 'ws-demo', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`)
      .run(matter.id, matter.code, matter.title, matter.type, matter.stage, String(matter.status).toUpperCase(), matter.owner_id, String(matter.sensitivity).toUpperCase(), matter.opened_at, matter.opened_at, timestamp);
  }
  for (const relationship of db.prepare("SELECT * FROM legacy_relationships").all()) {
    db.prepare(`INSERT INTO professional_relationships (id, workspace_id, person_id, entity_id, relationship_type, description, effective_from, effective_to, source, disclosure_class, status, recorded_at)
      VALUES (?, 'ws-demo', ?, ?, ?, ?, ?, ?, ?, 'FIRM_ONLY', ?, ?)`)
      .run(relationship.id, relationship.person_id, relationship.organization_id, relationship.type, relationship.description, relationship.start_date, relationship.end_date, relationship.source, relationship.active ? "CURRENT" : "HISTORICAL", relationship.created_at);
    db.prepare(`INSERT INTO assertions (id, workspace_id, subject_type, subject_id, predicate, object_type, object_id, object_text, confidentiality_scope, provenance, recorded_by, recorded_at, effective_from, effective_to)
      VALUES (?, 'ws-demo', 'PERSON', ?, 'HAS_PROFESSIONAL_RELATIONSHIP', 'ENTITY', ?, ?, 'WORKSPACE', ?, 'acct-alex', ?, ?, ?)`)
      .run(`assert-${relationship.id}`, relationship.person_id, relationship.organization_id, relationship.description, relationship.source, relationship.created_at, relationship.start_date, relationship.end_date);
  }
  const legacyCases = db.prepare("SELECT * FROM legacy_cases").all();
  for (const item of legacyCases) {
    const hasDecision = Boolean(db.prepare("SELECT 1 FROM legacy_decisions WHERE case_id = ?").get(item.id));
    const openMandatory = Boolean(db.prepare("SELECT 1 FROM legacy_controls WHERE case_id = ? AND status != 'Complete'").get(item.id));
    const workflow = openMandatory ? "RED" : hasDecision ? "GREEN" : "YELLOW";
    db.prepare(`INSERT INTO review_cases (id, workspace_id, reference, person_id, matter_id, entity_id, relationship_id, title, summary, workflow_state, human_disposition, status, assigned_account_id, opened_at, review_due_at, closed_at, updated_at)
      VALUES (?, 'ws-demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(item.id, item.reference, item.person_id, item.matter_id, item.organization_id, item.relationship_id, item.title, item.summary, workflow, hasDecision ? "CLEARED" : "UNREVIEWED", String(item.status).toUpperCase().replaceAll(" ", "_"), item.assignee_id ? `acct-${String(item.assignee_id).replace(/^p-/, "")}` : null, item.opened_at, item.review_due_at, item.closed_at, item.updated_at);
    db.prepare("INSERT INTO matter_parties (id, matter_id, entity_id, role, provenance, created_at) VALUES (?,?,?,?,?,?)")
      .run(`party-${item.id}`, item.matter_id, item.organization_id, "RELATED_PARTY", `Migrated from ${item.reference}`, item.opened_at);
  }
  for (const decision of db.prepare("SELECT * FROM legacy_decisions").all()) {
    const map = { "No conflict": "NO_CONFLICT", "Manage": "CLEARED", "Recuse": "SCREEN_REQUIRED", "Prohibit": "DECLINE" };
    db.prepare("INSERT INTO human_determinations (id, case_id, disposition, rationale, determined_by, determined_at) VALUES (?,?,?,?,?,?)")
      .run(decision.id, decision.case_id, map[decision.outcome] || "OTHER", decision.rationale, "acct-alex", decision.decided_at);
  }
  for (const control of db.prepare("SELECT * FROM legacy_controls").all()) {
    db.prepare("INSERT INTO controls (id, case_id, control_type, description, owner_person_id, mandatory, due_at, status, completed_at, created_at) VALUES (?,?,?,?,?,1,?,?,?,?)")
      .run(control.id, control.case_id, control.type, control.description, control.owner_id, control.due_at, control.status === "Complete" ? "COMPLETE" : "OPEN", control.completed_at, timestamp);
  }
  for (const note of db.prepare("SELECT * FROM legacy_notes").all()) {
    const person = db.prepare("SELECT id FROM legacy_people WHERE name = ?").get(note.author);
    db.prepare("INSERT INTO review_notes (id, case_id, author_account_id, body, created_at) VALUES (?,?,?,?,?)")
      .run(note.id, note.case_id, person ? `acct-${String(person.id).replace(/^p-/, "")}` : "acct-alex", note.body, note.created_at);
  }
  for (const event of db.prepare("SELECT * FROM legacy_audit_events").all()) {
    const person = db.prepare("SELECT id FROM legacy_people WHERE name = ?").get(event.actor);
    db.prepare(`INSERT INTO audit_events (id, actor_account_id, actor_person_id, authority_used, workspace_scope, action, resource_type, resource_id, occurred_at, metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(event.id, person ? `acct-${String(person.id).replace(/^p-/, "")}` : "acct-alex", person?.id || "p-alex", "MIGRATED_AUTHORITY", "ws-demo", event.action, String(event.entity_type).toUpperCase(), event.entity_id, event.created_at, event.metadata_json || "{}");
  }
  db.prepare("UPDATE system_state SET corpus_revision = 1 WHERE id = 'global'").run();
  for (const table of ["legacy_audit_events", "legacy_notes", "legacy_controls", "legacy_decisions", "legacy_cases", "legacy_relationships", "legacy_matters", "legacy_organizations", "legacy_people"]) db.exec(`DROP TABLE ${table}`);
}

export const SQLITE_MIGRATIONS = [
  {
    version: 1,
    name: "person_first_foundation",
    up(db) {
      const legacyTables = ["people", "organizations", "matters", "relationships", "cases", "decisions", "controls", "notes", "audit_events"];
      for (const table of legacyTables) if (tableExists(db, table)) db.exec(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
      createSchema(db);
      importLegacy(db);
    },
  },
  {
    version: 2,
    name: "entity_search_index",
    up(db) {
      createEntitySearchIndex(db, { contentless: true });
    },
  },
  {
    version: 3,
    name: "maintainable_entity_search_index",
    up(db) {
      db.exec("DROP TABLE entity_search");
      createEntitySearchIndex(db);
    },
  },
  {
    version: 4,
    name: "immutable_audit_history",
    up(db) {
      db.exec(`
        CREATE TRIGGER audit_events_immutable_update BEFORE UPDATE ON audit_events BEGIN
          SELECT RAISE(ABORT, 'Audit events are immutable');
        END;
        CREATE TRIGGER audit_events_immutable_delete BEFORE DELETE ON audit_events BEGIN
          SELECT RAISE(ABORT, 'Audit events are immutable');
        END;
      `);
    },
  },
  {
    version: 5,
    name: "jurisdictional_policy_engine",
    up(db) {
      db.exec(`
        CREATE TABLE policy_packs (
          pack_id TEXT NOT NULL, version TEXT NOT NULL, title TEXT NOT NULL, short_title TEXT,
          authority_type TEXT NOT NULL, jurisdiction TEXT, publisher TEXT NOT NULL,
          effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL,
          source_url TEXT NOT NULL, description TEXT, dsl_version TEXT NOT NULL,
          content_hash TEXT NOT NULL UNIQUE, manifest_json TEXT NOT NULL, installed_at TEXT NOT NULL,
          PRIMARY KEY (pack_id, version)
        );
        CREATE TABLE policy_questions (
          id TEXT PRIMARY KEY, conflict_check_id TEXT NOT NULL REFERENCES conflict_checks(id) ON DELETE CASCADE,
          question_key TEXT NOT NULL, question_text TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'QUESTION',
          created_by TEXT NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL,
          UNIQUE(conflict_check_id, question_key)
        );
        CREATE TABLE policy_authority_selections (
          id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES policy_questions(id) ON DELETE CASCADE,
          pack_id TEXT NOT NULL, pack_version TEXT NOT NULL,
          authority_status TEXT NOT NULL CHECK (authority_status IN ('CONTROLLING','POTENTIALLY_APPLICABLE','COMPARATIVE_ONLY')),
          selection_source TEXT NOT NULL CHECK (selection_source IN ('USER','RECOMMENDED','SYSTEM_FALLBACK')),
          rationale TEXT, selected_by TEXT NOT NULL REFERENCES accounts(id), selected_at TEXT NOT NULL,
          pack_snapshot_json TEXT NOT NULL,
          UNIQUE(question_id, pack_id),
          FOREIGN KEY (pack_id, pack_version) REFERENCES policy_packs(pack_id, version)
        );
        CREATE TABLE policy_evaluations (
          id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES policy_questions(id) ON DELETE CASCADE,
          authority_selection_id TEXT NOT NULL REFERENCES policy_authority_selections(id),
          engine_version TEXT NOT NULL, dsl_version TEXT NOT NULL, facts_hash TEXT NOT NULL,
          fact_snapshot_json TEXT NOT NULL, summary_json TEXT NOT NULL,
          evaluated_by TEXT NOT NULL REFERENCES accounts(id), evaluated_at TEXT NOT NULL
        );
        CREATE TABLE policy_rule_results (
          id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL REFERENCES policy_evaluations(id) ON DELETE CASCADE,
          pack_id TEXT NOT NULL, pack_version TEXT NOT NULL, rule_id TEXT NOT NULL,
          corresponds_to TEXT, outcome TEXT NOT NULL CHECK (outcome IN ('MATCHED','NOT_MATCHED','INDETERMINATE')),
          finding_code TEXT, finding_message TEXT, citation TEXT NOT NULL, source_url TEXT NOT NULL,
          comparison_note TEXT, missing_facts_json TEXT NOT NULL DEFAULT '[]',
          unknown_questions_json TEXT NOT NULL DEFAULT '[]', trace_json TEXT NOT NULL,
          created_at TEXT NOT NULL, UNIQUE(evaluation_id, rule_id)
        );
        ALTER TABLE review_cases ADD COLUMN policy_question_id TEXT REFERENCES policy_questions(id);
        CREATE INDEX idx_policy_question_check ON policy_questions(conflict_check_id);
        CREATE INDEX idx_policy_selection_question ON policy_authority_selections(question_id);
        CREATE INDEX idx_policy_evaluation_question ON policy_evaluations(question_id, evaluated_at DESC);
        CREATE INDEX idx_policy_result_evaluation ON policy_rule_results(evaluation_id, outcome);
        CREATE TRIGGER policy_questions_immutable BEFORE UPDATE ON policy_questions BEGIN
          SELECT RAISE(ABORT, 'Policy questions are immutable; create a new conflict check');
        END;
        CREATE TRIGGER policy_selections_immutable BEFORE UPDATE ON policy_authority_selections BEGIN
          SELECT RAISE(ABORT, 'Policy selections are immutable; create a new evaluation');
        END;
        CREATE TRIGGER policy_evaluations_immutable BEFORE UPDATE ON policy_evaluations BEGIN
          SELECT RAISE(ABORT, 'Policy evaluations are immutable');
        END;
        CREATE TRIGGER policy_results_immutable BEFORE UPDATE ON policy_rule_results BEGIN
          SELECT RAISE(ABORT, 'Policy rule results are immutable');
        END;
      `);
    },
  },
];

export { RESOURCE_TYPES };

export function migrateSqlite(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
  for (const migration of SQLITE_MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
