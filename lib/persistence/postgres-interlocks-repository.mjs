import pg from "pg";
import { postgresMigrations } from "./postgres-migrations.mjs";

export class PostgresInterlocksRepository {
  constructor(connectionString, options = {}) {
    if (!connectionString?.startsWith("postgres")) throw new Error("A PostgreSQL DATABASE_URL is required");
    this.pool = options.pool || new pg.Pool({ connectionString, max: 10, ssl: options.ssl });
  }

  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
      const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((row) => Number(row.version)));
      for (const migration of postgresMigrations) if (!applied.has(migration.version)) {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version,name) VALUES ($1,$2)", [migration.version, migration.name]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async health() {
    const result = await this.pool.query("SELECT current_database() AS database, now() AS timestamp");
    return { status: "ok", driver: "postgres", ...result.rows[0] };
  }

  async close() { await this.pool.end(); }
}

export const postgresCutover = Object.freeze({
  status: "migration-ready",
  activeAdapter: false,
  reason: "The local MVP remains on the synchronous repository contract; hosted cutover must port aggregate operations to transactions before DATABASE_URL is enabled.",
});
