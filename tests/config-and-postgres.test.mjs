import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../lib/config.mjs";
import { postgresCutover } from "../lib/persistence/postgres-interlocks-repository.mjs";
import { postgresMigrations } from "../lib/persistence/postgres-migrations.mjs";
import { migrateSqlite } from "../lib/persistence/sqlite-migrations.mjs";

test("production configuration requires HTTPS, invite-safe mode, managed auth, and secure session material", () => {
  const base={INTERLOCKS_ENV:"production",INTERLOCKS_BASE_URL:"https://interlocks.example",INTERLOCKS_REGISTRATION_MODE:"INVITE_ONLY",INTERLOCKS_DEMO_MODE:"false",WORKOS_CLIENT_ID:"client_test",WORKOS_API_KEY:"sk_test",WORKOS_COOKIE_PASSWORD:"x".repeat(32),NEXT_PUBLIC_WORKOS_REDIRECT_URI:"https://interlocks.example/auth/callback"};
  assert.equal(loadConfig(base).authProvider,"workos");
  assert.throws(()=>loadConfig({...base,INTERLOCKS_DEMO_MODE:"true"}),/demo/i);
  assert.throws(()=>loadConfig({...base,INTERLOCKS_REGISTRATION_MODE:"DEVELOPMENT"}),/forbidden/i);
  assert.throws(()=>loadConfig({...base,INTERLOCKS_BASE_URL:"http://interlocks.example"}),/HTTPS/);
  assert.throws(()=>loadConfig({...base,WORKOS_COOKIE_PASSWORD:"short"}),/32 characters/);
});

test("PostgreSQL cutover has ordered native migrations for every critical aggregate", () => {
  assert.equal(postgresCutover.status,"migration-ready"); assert.deepEqual(postgresMigrations.map((item)=>item.version),[1,2,3]);
  const sql=postgresMigrations.map((migration)=>migration.sql).join("\n");
  for(const table of ["persons","accounts","workspaces","workspace_memberships","entities","matters","personal_ledger_entries","personal_associations","personal_association_interests","family_account_links","documents","assertions","inferences","conflict_checks","conflict_hits","review_cases","human_determinations","conflict_consents","screens","audit_events","policy_packs","policy_questions","policy_authority_selections","policy_evaluations","policy_rule_results"]) assert.match(sql,new RegExp(`CREATE TABLE ${table}`));
  assert.doesNotMatch(sql,/PRAGMA|AUTOINCREMENT|json_extract/);
});

test("a legacy scored prototype migrates without losing records or carrying arithmetic forward", () => {
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE people (id TEXT,name TEXT,title TEXT,email TEXT,role TEXT);
    CREATE TABLE organizations (id TEXT,name TEXT,jurisdiction TEXT,status TEXT);
    CREATE TABLE matters (id TEXT,code TEXT,title TEXT,type TEXT,stage TEXT,status TEXT,owner_id TEXT,sensitivity TEXT,opened_at TEXT);
    CREATE TABLE relationships (id TEXT,person_id TEXT,organization_id TEXT,type TEXT,description TEXT,start_date TEXT,end_date TEXT,source TEXT,active INTEGER,created_at TEXT);
    CREATE TABLE cases (id TEXT,reference TEXT,person_id TEXT,matter_id TEXT,organization_id TEXT,relationship_id TEXT,title TEXT,summary TEXT,risk_score INTEGER,status TEXT,assignee_id TEXT,opened_at TEXT,review_due_at TEXT,closed_at TEXT,updated_at TEXT);
    CREATE TABLE decisions (id TEXT,case_id TEXT,outcome TEXT,rationale TEXT,decided_at TEXT);
    CREATE TABLE controls (id TEXT,case_id TEXT,type TEXT,description TEXT,owner_id TEXT,due_at TEXT,status TEXT,completed_at TEXT);
    CREATE TABLE notes (id TEXT,case_id TEXT,author TEXT,body TEXT,created_at TEXT);
    CREATE TABLE audit_events (id TEXT,actor TEXT,action TEXT,entity_type TEXT,entity_id TEXT,created_at TEXT,metadata_json TEXT);
    INSERT INTO people VALUES ('p-alex','Alex Morgan','General Counsel','alex@example.org','Administrator');
    INSERT INTO organizations VALUES ('o-legacy','Legacy Client','Delaware','Active');
    INSERT INTO matters VALUES ('m-legacy','LEG-1','Legacy engagement','Representation','Review','Active','p-alex','Standard','2026-01-01T00:00:00Z');
    INSERT INTO relationships VALUES ('r-legacy','p-alex','o-legacy','Former client','Prior representation','2020-01-01',NULL,'Legacy disclosure',1,'2026-01-01T00:00:00Z');
    INSERT INTO cases VALUES ('c-legacy','INT-2026-0001','p-alex','m-legacy','o-legacy','r-legacy','Legacy review','A scored prototype case',99,'Managed','p-alex','2026-01-01T00:00:00Z','2026-01-08',NULL,'2026-01-02T00:00:00Z');
    INSERT INTO decisions VALUES ('d-legacy','c-legacy','Manage','Proceed with documented safeguards.','2026-01-02T00:00:00Z');
    INSERT INTO controls VALUES ('ctl-legacy','c-legacy','Disclosure','Record client notice','p-alex','2026-01-03','Complete','2026-01-03T00:00:00Z');
    INSERT INTO notes VALUES ('n-legacy','c-legacy','Alex Morgan','Reviewed original intake.','2026-01-02T00:00:00Z');
    INSERT INTO audit_events VALUES ('a-legacy','Alex Morgan','case.created','case','c-legacy','2026-01-01T00:00:00Z','{}');
  `);
  migrateSqlite(db);
  assert.deepEqual(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row)=>row.version),[1,2,3,4,5,6]);
  assert.equal(db.prepare("SELECT human_disposition AS disposition,workflow_state AS state FROM review_cases WHERE id='c-legacy'").get().disposition,"CLEARED");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM review_notes WHERE case_id='c-legacy'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM human_determinations WHERE case_id='c-legacy'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('review_cases') WHERE lower(name) LIKE '%score%'").get().count,0);
  db.close();
});

test("SQLite migration failure rolls back the active migration", () => {
  const calls = [];
  const db = {
    exec(sql) {
      calls.push(sql);
      if (sql.includes("CREATE TABLE system_state")) throw new Error("schema failure");
    },
    prepare(sql) {
      if (sql === "SELECT version FROM schema_migrations") return { all: () => [] };
      if (sql === "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") return { get: () => undefined };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  assert.throws(() => migrateSqlite(db), /schema failure/);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("SQLite migrations fall back to a plain indexed search table when FTS5 is unavailable", () => {
  const calls = [];
  const applied = [];
  const db = {
    exec(sql) {
      calls.push(sql);
      if (sql.includes("CREATE VIRTUAL TABLE entity_search")) throw new Error("no such module: fts5");
    },
    prepare(sql) {
      if (sql === "SELECT version FROM schema_migrations") return { all: () => [{ version: 1 }] };
      if (sql.startsWith("INSERT INTO schema_migrations")) return { run: (version) => applied.push(version) };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  migrateSqlite(db);

  assert.deepEqual(applied, [2, 3, 4, 5, 6]);
  assert.equal(calls.filter((sql) => sql.includes("CREATE VIRTUAL TABLE entity_search")).length, 2);
  assert.equal(calls.filter((sql) => sql.includes("CREATE TABLE entity_search")).length, 2);
  assert.equal(calls.filter((sql) => sql === "COMMIT").length, 5);
  assert.equal(calls.includes("ROLLBACK"), false);
});

test("SQLite search migration does not hide errors unrelated to unavailable FTS5", () => {
  const calls = [];
  const db = {
    exec(sql) {
      calls.push(sql);
      if (sql.includes("CREATE VIRTUAL TABLE entity_search")) throw new Error("database disk image is malformed");
    },
    prepare(sql) {
      if (sql === "SELECT version FROM schema_migrations") return { all: () => [{ version: 1 }] };
      if (sql.startsWith("INSERT INTO schema_migrations")) return { run: () => {} };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  assert.throws(() => migrateSqlite(db), /disk image is malformed/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.some((sql) => sql.includes("CREATE TABLE entity_search")), false);
});
