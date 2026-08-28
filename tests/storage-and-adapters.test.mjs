import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { InterlocksRepository } from "../lib/persistence/interlocks-repository.mjs";
import { PostgresInterlocksRepository, postgresCutover } from "../lib/persistence/postgres-interlocks-repository.mjs";
import { postgresMigrations } from "../lib/persistence/postgres-migrations.mjs";
import { InMemoryObjectStore, LocalFilesystemObjectStore, ObjectStore } from "../lib/storage/object-store.mjs";

test("the abstract object store refuses writes", () => {
  assert.throws(() => new ObjectStore().putImmutable("bytes"), /not implemented/);
});

test("the abstract object store refuses reads", () => {
  assert.throws(() => new ObjectStore().get("key"), /not implemented/);
});

test("in-memory object storage records content hash and size", () => {
  const store = new InMemoryObjectStore();
  const result = store.putImmutable("signed consent");
  assert.equal(result.sha256, createHash("sha256").update("signed consent").digest("hex"));
  assert.equal(result.size, Buffer.byteLength("signed consent"));
  assert.match(result.storageKey, new RegExp(`^memory/${result.sha256}/`));
});

test("in-memory object storage returns the exact bytes", () => {
  const store = new InMemoryObjectStore();
  const result = store.putImmutable(Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(store.get(result.storageKey), Buffer.from([0, 1, 2, 255]));
});

test("in-memory object storage copies caller input", () => {
  const store = new InMemoryObjectStore();
  const source = Buffer.from("original");
  const result = store.putImmutable(source);
  source.fill(0);
  assert.equal(store.get(result.storageKey).toString(), "original");
});

test("in-memory object storage returns defensive copies", () => {
  const store = new InMemoryObjectStore();
  const result = store.putImmutable("original");
  const firstRead = store.get(result.storageKey);
  firstRead.fill(0);
  assert.equal(store.get(result.storageKey).toString(), "original");
});

test("identical in-memory objects retain distinct immutable storage keys", () => {
  const store = new InMemoryObjectStore();
  const first = store.putImmutable("same");
  const second = store.putImmutable("same");
  assert.equal(first.sha256, second.sha256);
  assert.notEqual(first.storageKey, second.storageKey);
});

test("in-memory object storage rejects unknown keys", () => {
  assert.throws(() => new InMemoryObjectStore().get("memory/missing"), /not found/);
});

async function filesystemStore(t) {
  const directory = await mkdtemp(join(tmpdir(), "interlocks-objects-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new LocalFilesystemObjectStore(directory) };
}

test("filesystem object storage creates its root and records exact bytes", async (t) => {
  const directory = join(await mkdtemp(join(tmpdir(), "interlocks-parent-")), "nested", "objects");
  t.after(() => rm(dirname(dirname(directory)), { recursive: true, force: true }));
  const store = new LocalFilesystemObjectStore(directory);
  const result = store.putImmutable(Buffer.from([0, 17, 255]));
  assert.deepEqual(store.get(result.storageKey), Buffer.from([0, 17, 255]));
  assert.deepEqual(await readFile(join(directory, result.storageKey)), Buffer.from([0, 17, 255]));
});

test("filesystem objects are created owner-readable and owner-writable only", async (t) => {
  const { directory, store } = await filesystemStore(t);
  const result = store.putImmutable("private evidence");
  const mode = (await stat(join(directory, result.storageKey))).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("identical filesystem objects retain distinct keys and equal hashes", async (t) => {
  const { store } = await filesystemStore(t);
  const first = store.putImmutable("same");
  const second = store.putImmutable("same");
  assert.equal(first.sha256, second.sha256);
  assert.notEqual(first.storageKey, second.storageKey);
});

for (const key of ["missing", "../outside", "../../etc/passwd", "/etc/passwd", "."] ) {
  test(`filesystem object storage rejects unsafe or missing key ${key}`, async (t) => {
    const { store } = await filesystemStore(t);
    assert.throws(() => store.get(key), /not found/);
  });
}

const abstractMethods = [
  ["getSnapshot", []],
  ["createDisclosure", []],
  ["recordCaseAction", []],
  ["completeControl", []],
  ["exportData", []],
  ["resetDemo", []],
  ["createConflictCheck", []],
  ["createAssertion", []],
  ["createInference", []],
  ["uploadDocument", []],
  ["createConsent", []],
  ["createScreen", []],
  ["createPersonalAssociation", []],
  ["endPersonalAssociation", []],
  ["createAssociationInterest", []],
  ["revokeAssociationInterest", []],
  ["requestFamilyAccountLink", []],
  ["respondFamilyAccountLink", []],
  ["revokeFamilyAccountLink", []],
];

for (const [method, args] of abstractMethods) {
  test(`repository contract requires ${method} implementation`, () => {
    assert.throws(() => new InterlocksRepository()[method](...args), new RegExp(`${method}\\(\\) is not implemented`));
  });
}

test("PostgreSQL adapter rejects a missing connection URL", () => {
  assert.throws(() => new PostgresInterlocksRepository(), /DATABASE_URL/);
});

test("PostgreSQL adapter rejects a non-PostgreSQL connection URL", () => {
  assert.throws(() => new PostgresInterlocksRepository("sqlite:local.db"), /DATABASE_URL/);
});

test("PostgreSQL cutover is explicitly disabled until aggregate operations are ported", () => {
  assert.deepEqual(postgresCutover, {
    status: "migration-ready",
    activeAdapter: false,
    reason: "The local MVP remains on the synchronous repository contract; hosted cutover must port aggregate operations to transactions before DATABASE_URL is enabled.",
  });
  assert.equal(Object.isFrozen(postgresCutover), true);
});

function postgresHarness({ applied = [], failOnMigration = false } = {}) {
  const calls = [];
  let released = false;
  let ended = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === "SELECT version FROM schema_migrations") return { rows: applied.map((version) => ({ version })) };
      if (failOnMigration && sql === postgresMigrations[0].sql) throw new Error("migration failed");
      return { rows: [] };
    },
    release() { released = true; },
  };
  const pool = {
    async connect() { return client; },
    async query(sql) {
      calls.push({ sql });
      return { rows: [{ database: "interlocks_test", timestamp: "2026-08-28T00:00:00Z" }] };
    },
    async end() { ended = true; },
  };
  return { pool, calls, get released() { return released; }, get ended() { return ended; } };
}

test("PostgreSQL migration runs every unapplied migration transactionally", async () => {
  const harness = postgresHarness();
  const repository = new PostgresInterlocksRepository("postgresql://example/interlocks", { pool: harness.pool });
  await repository.migrate();
  assert.equal(harness.calls[0].sql, "BEGIN");
  assert.ok(harness.calls.some((call) => call.sql === postgresMigrations[0].sql));
  assert.ok(harness.calls.some((call) => call.sql.startsWith("INSERT INTO schema_migrations") && call.values[0] === 1));
  assert.equal(harness.calls.at(-1).sql, "COMMIT");
  assert.equal(harness.released, true);
});

test("PostgreSQL migration does not reapply recorded versions", async () => {
  const harness = postgresHarness({ applied: postgresMigrations.map((migration) => migration.version) });
  const repository = new PostgresInterlocksRepository("postgresql://example/interlocks", { pool: harness.pool });
  await repository.migrate();
  assert.equal(harness.calls.some((call) => postgresMigrations.some((migration) => call.sql === migration.sql)), false);
  assert.equal(harness.calls.some((call) => call.sql.startsWith("INSERT INTO schema_migrations")), false);
  assert.equal(harness.calls.at(-1).sql, "COMMIT");
});

test("PostgreSQL migration rolls back and releases its client on failure", async () => {
  const harness = postgresHarness({ failOnMigration: true });
  const repository = new PostgresInterlocksRepository("postgresql://example/interlocks", { pool: harness.pool });
  await assert.rejects(() => repository.migrate(), /migration failed/);
  assert.equal(harness.calls.at(-1).sql, "ROLLBACK");
  assert.equal(harness.released, true);
});

test("PostgreSQL health reports the selected driver and server values", async () => {
  const harness = postgresHarness();
  const repository = new PostgresInterlocksRepository("postgresql://example/interlocks", { pool: harness.pool });
  assert.deepEqual(await repository.health(), {
    status: "ok",
    driver: "postgres",
    database: "interlocks_test",
    timestamp: "2026-08-28T00:00:00Z",
  });
});

test("PostgreSQL close drains the supplied pool", async () => {
  const harness = postgresHarness();
  const repository = new PostgresInterlocksRepository("postgresql://example/interlocks", { pool: harness.pool });
  await repository.close();
  assert.equal(harness.ended, true);
});
