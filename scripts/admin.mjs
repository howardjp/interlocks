#!/usr/bin/env node

import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";

const [command, identifier, ...reasonParts] = process.argv.slice(2);
if (command !== "promote-superadmin" || !identifier) {
  console.error("Usage: npm run admin -- promote-superadmin <account-id-or-email> [reason]");
  process.exitCode = 2;
} else {
  const repository = new SqliteInterlocksRepository();
  try {
    const result = repository.promoteSuperadmin(identifier, reasonParts.join(" ") || "Proprietor bootstrap");
    console.log(`Promoted ${result.accountId} to ${result.platformRole}; an immutable audit event was recorded.`);
  } finally {
    repository.close();
  }
}
