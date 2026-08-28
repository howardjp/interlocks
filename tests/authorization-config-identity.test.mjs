import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { ACTIONS, AuthorizationService } from "../lib/auth/authorization.mjs";
import { DevelopmentIdentityProvider, IdentityProvider, WorkOSIdentityProvider } from "../lib/auth/identity-provider.mjs";
import { apiError, requestWorkspace, resolveRequestActor } from "../lib/auth/request-actor.mjs";
import { loadConfig, resetConfigForTests } from "../lib/config.mjs";

const authorization = new AuthorizationService();
const allActions = Object.values(ACTIONS);

function actor({
  accountStatus = "ACTIVE",
  platformRole = "USER",
  personId = "person-1",
  workspaceId = "workspace-1",
  membershipStatus = "ACTIVE",
  roles = ["MEMBER"],
} = {}) {
  return {
    accountId: "account-1",
    accountStatus,
    platformRole,
    personId,
    memberships: workspaceId ? [{ workspaceId, status: membershipStatus, roles }] : [],
  };
}

for (const [role, allowed] of [
  ["MEMBER", [ACTIONS.READ_WORKSPACE, ACTIONS.VIEW_DOCUMENT]],
  ["REVIEWER", [ACTIONS.READ_WORKSPACE, ACTIONS.VIEW_DOCUMENT, ACTIONS.REVIEW]],
  ["FIRMADMIN", [ACTIONS.READ_WORKSPACE, ACTIONS.VIEW_DOCUMENT, ACTIONS.MANAGE_WORKSPACE, ACTIONS.MANAGE_MEMBERS, ACTIONS.EXPORT]],
]) {
  for (const action of allActions) {
    if ([ACTIONS.READ_PERSONAL_LEDGER, ACTIONS.SHARE_PERSONAL_LEDGER, ACTIONS.PLATFORM_ADMIN].includes(action)) continue;
    test(`${role} ${allowed.includes(action) ? "may" : "may not"} perform ${action}`, () => {
      assert.equal(authorization.can(actor({ roles: [role] }), action, { workspaceId: "workspace-1" }), allowed.includes(action));
    });
  }
}

for (const action of allActions) {
  test(`inactive accounts cannot perform ${action}`, () => {
    assert.equal(authorization.can(actor({ accountStatus: "SUSPENDED" }), action, { workspaceId: "workspace-1", ownerPersonId: "person-1" }), false);
  });
}

test("a missing actor has no authority", () => {
  assert.equal(authorization.can(null, ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-1" }), false);
});

test("an inactive membership grants no workspace authority", () => {
  assert.equal(authorization.can(actor({ membershipStatus: "DEPARTED" }), ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-1" }), false);
});

test("a membership grants no authority in another workspace", () => {
  assert.equal(authorization.can(actor(), ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-2" }), false);
});

test("an unknown role grants no authority", () => {
  assert.equal(authorization.can(actor({ roles: ["OWNER"] }), ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-1" }), false);
});

test("multiple roles combine their permitted actions", () => {
  const combined = actor({ roles: ["MEMBER", "REVIEWER"] });
  assert.equal(authorization.can(combined, ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-1" }), true);
  assert.equal(authorization.can(combined, ACTIONS.REVIEW, { workspaceId: "workspace-1" }), true);
  assert.equal(authorization.can(combined, ACTIONS.EXPORT, { workspaceId: "workspace-1" }), false);
});

for (const action of [ACTIONS.READ_PERSONAL_LEDGER, ACTIONS.SHARE_PERSONAL_LEDGER]) {
  test(`a person may perform ${action} on their own ledger`, () => {
    assert.equal(authorization.can(actor({ workspaceId: null }), action, { ownerPersonId: "person-1" }), true);
  });

  test(`a workspace role may not perform ${action} on another person's ledger`, () => {
    assert.equal(authorization.can(actor({ roles: ["FIRMADMIN"] }), action, { workspaceId: "workspace-1", ownerPersonId: "person-2" }), false);
  });

  test(`a superadmin may not perform ${action} on another person's ledger`, () => {
    assert.equal(authorization.can(actor({ platformRole: "SUPERADMIN" }), action, { ownerPersonId: "person-2", readOnly: true }), false);
  });
}

for (const action of allActions.filter((value) => ![ACTIONS.READ_PERSONAL_LEDGER, ACTIONS.SHARE_PERSONAL_LEDGER].includes(value))) {
  test(`an active superadmin may perform ${action}`, () => {
    assert.equal(authorization.can(actor({ platformRole: "SUPERADMIN", workspaceId: null }), action, { workspaceId: "workspace-any" }), true);
  });
}

test("authorization requires workspace context for ordinary workspace actions", () => {
  assert.equal(authorization.can(actor(), ACTIONS.READ_WORKSPACE), false);
});

test("require returns normally for an authorized action", () => {
  assert.equal(authorization.require(actor(), ACTIONS.READ_WORKSPACE, { workspaceId: "workspace-1" }), undefined);
});

test("require throws a stable forbidden error for an unauthorized action", () => {
  assert.throws(
    () => authorization.require(actor(), ACTIONS.PLATFORM_ADMIN),
    (error) => error.code === "FORBIDDEN" && /not authorized/.test(error.message),
  );
});

const productionBase = Object.freeze({
  INTERLOCKS_ENV: "production",
  INTERLOCKS_BASE_URL: "https://interlocks.example",
  INTERLOCKS_REGISTRATION_MODE: "INVITE_ONLY",
  INTERLOCKS_DEMO_MODE: "false",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://interlocks.example/auth/callback",
});

const configCases = [
  ["development defaults", {}, { environment: "development", registrationMode: "DEVELOPMENT", demoMode: true, authProvider: "development", databaseDriver: "sqlite", logLevel: "debug" }],
  ["test defaults", { INTERLOCKS_ENV: "test" }, { environment: "test", registrationMode: "INVITE_ONLY", demoMode: false, authProvider: "development", databaseDriver: "sqlite", logLevel: "debug" }],
  ["explicit false demo mode", { INTERLOCKS_DEMO_MODE: "false" }, { demoMode: false }],
  ["case-insensitive true demo mode", { INTERLOCKS_DEMO_MODE: "TRUE" }, { demoMode: true }],
  ["PostgreSQL URL selection", { DATABASE_URL: "postgresql://localhost/interlocks" }, { databaseDriver: "postgres", databaseUrl: "postgresql://localhost/interlocks" }],
  ["postgres URL selection", { DATABASE_URL: "postgres://localhost/interlocks" }, { databaseDriver: "postgres" }],
  ["non-PostgreSQL URL remains on SQLite boundary", { DATABASE_URL: "mysql://localhost/interlocks" }, { databaseDriver: "sqlite" }],
  ["custom log level", { INTERLOCKS_LOG_LEVEL: "warn" }, { logLevel: "warn" }],
  ["custom object store", { INTERLOCKS_OBJECT_STORE: "s3" }, { objectStoreDriver: "s3" }],
  ["custom HTTPS development base URL", { INTERLOCKS_BASE_URL: "https://local.example" }, { appBaseUrl: "https://local.example" }],
  ["complete WorkOS configuration", productionBase, { environment: "production", authConfigured: true, authProvider: "workos", demoMode: false }],
];

for (const [name, environment, expected] of configCases) {
  test(`configuration: ${name}`, () => {
    const config = loadConfig(environment);
    for (const [key, value] of Object.entries(expected)) assert.equal(config[key], value, key);
    assert.equal(Object.isFrozen(config), true);
  });
}

test("configuration resolves relative SQLite and object-store paths", () => {
  const config = loadConfig({ INTERLOCKS_DB_PATH: "var/test.db", INTERLOCKS_DOCUMENT_PATH: "var/docs" });
  assert.equal(config.sqlitePath, resolve("var/test.db"));
  assert.equal(config.objectStorePath, resolve("var/docs"));
});

for (const key of ["WORKOS_CLIENT_ID", "WORKOS_API_KEY", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"]) {
  test(`partial WorkOS configuration missing ${key} remains disabled outside production`, () => {
    const environment = { ...productionBase, INTERLOCKS_ENV: "development" };
    delete environment[key];
    const config = loadConfig(environment);
    assert.equal(config.authConfigured, false);
    assert.equal(config.authProvider, "development");
  });
}

for (const [name, environment, pattern] of [
  ["unknown environment", { INTERLOCKS_ENV: "staging" }, /INTERLOCKS_ENV/],
  ["unknown registration mode", { INTERLOCKS_REGISTRATION_MODE: "MAGIC_LINK" }, /Unsupported INTERLOCKS_REGISTRATION_MODE/],
  ["production demo mode", { ...productionBase, INTERLOCKS_DEMO_MODE: "true" }, /demo/i],
  ["production development registration", { ...productionBase, INTERLOCKS_REGISTRATION_MODE: "DEVELOPMENT" }, /forbidden/i],
  ["production missing managed auth", { ...productionBase, WORKOS_API_KEY: "" }, /WorkOS AuthKit/],
  ["production short cookie secret", { ...productionBase, WORKOS_COOKIE_PASSWORD: "too-short" }, /32 characters/],
  ["production insecure base URL", { ...productionBase, INTERLOCKS_BASE_URL: "http://interlocks.example" }, /HTTPS/],
]) {
  test(`configuration rejects ${name}`, () => assert.throws(() => loadConfig(environment), pattern));
}

test("the abstract identity provider refuses unresolved identities", async () => {
  await assert.rejects(() => new IdentityProvider().resolveIdentity(new Request("http://localhost")), /not implemented/);
});

test("development identity provider uses its configured default account", async () => {
  const identity = await new DevelopmentIdentityProvider("acct-default").resolveIdentity(new Request("http://localhost"));
  assert.deepEqual(identity, { provider: "development", issuer: "interlocks-local", providerSubject: "acct-default" });
});

test("development identity provider reads the identity header", async () => {
  const identity = await new DevelopmentIdentityProvider().resolveIdentity(new Request("http://localhost", { headers: { "x-interlocks-account": "acct-header" } }));
  assert.equal(identity.providerSubject, "acct-header");
});

test("development identity provider reads the identity cookie", async () => {
  const identity = await new DevelopmentIdentityProvider().resolveIdentity(new Request("http://localhost", { headers: { cookie: "other=x; interlocks-dev-account=acct-cookie; theme=dark" } }));
  assert.equal(identity.providerSubject, "acct-cookie");
});

test("development identity header takes precedence over the cookie", async () => {
  const identity = await new DevelopmentIdentityProvider().resolveIdentity(new Request("http://localhost", { headers: { cookie: "interlocks-dev-account=acct-cookie", "x-interlocks-account": "acct-header" } }));
  assert.equal(identity.providerSubject, "acct-header");
});

test("WorkOS identity resolution requests a signed-in user and maps the durable subject", async () => {
  let options;
  const provider = new WorkOSIdentityProvider(async (received) => {
    options = received;
    return { user: { id: "user_123", email: "james@example.org", firstName: "James", lastName: "Howard" } };
  });
  assert.deepEqual(await provider.resolveIdentity(), {
    provider: "workos",
    issuer: "https://api.workos.com/user_management",
    providerSubject: "user_123",
    email: "james@example.org",
    displayName: "James Howard",
  });
  assert.deepEqual(options, { ensureSignedIn: true });
});

test("WorkOS identity resolution falls back to email when names are unavailable", async () => {
  const provider = new WorkOSIdentityProvider(async () => ({ user: { id: "user_456", email: "nina@example.org", firstName: "", lastName: null } }));
  assert.equal((await provider.resolveIdentity()).displayName, "nina@example.org");
});

test("request actor resolves development identity through the repository boundary", async (t) => {
  const originalEnvironment = process.env.INTERLOCKS_ENV;
  const originalRegistration = process.env.INTERLOCKS_REGISTRATION_MODE;
  process.env.INTERLOCKS_ENV = "test";
  process.env.INTERLOCKS_REGISTRATION_MODE = "INVITE_ONLY";
  resetConfigForTests();
  t.after(() => {
    if (originalEnvironment == null) delete process.env.INTERLOCKS_ENV; else process.env.INTERLOCKS_ENV = originalEnvironment;
    if (originalRegistration == null) delete process.env.INTERLOCKS_REGISTRATION_MODE; else process.env.INTERLOCKS_REGISTRATION_MODE = originalRegistration;
    resetConfigForTests();
  });
  let received;
  const repository = {
    resolveExternalIdentity(identity, options) {
      received = { identity, options };
      return { accountId: identity.providerSubject };
    },
  };
  const actor = await resolveRequestActor(new Request("http://localhost/api", { headers: { "x-interlocks-account": "acct-test" } }), repository);
  assert.deepEqual(actor, { accountId: "acct-test" });
  assert.deepEqual(received, {
    identity: { provider: "development", issuer: "interlocks-local", providerSubject: "acct-test" },
    options: { registrationMode: "INVITE_ONLY" },
  });
});

test("request workspace prefers an explicit header", () => {
  const request = new Request("http://localhost/api/snapshot?workspace=query", { headers: { "x-interlocks-workspace": "header" } });
  assert.equal(requestWorkspace(request, "fallback"), "header");
});

test("request workspace falls back to the query string", () => {
  assert.equal(requestWorkspace(new Request("http://localhost/api/snapshot?workspace=query"), "fallback"), "query");
});

test("request workspace falls back to the caller default", () => {
  assert.equal(requestWorkspace(new Request("http://localhost/api/snapshot"), "fallback"), "fallback");
});

for (const [name, code, status] of [
  ["forbidden errors", "FORBIDDEN", 403],
  ["invitation-required errors", "INVITE_REQUIRED", 401],
  ["validation errors", undefined, 400],
]) {
  test(`API error maps ${name} to ${status}`, async () => {
    const error = new Error("Specific message");
    error.code = code;
    const response = apiError(error);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "Specific message" });
  });
}

test("API error supplies a generic message when no error is available", async () => {
  assert.deepEqual(await apiError(null).json(), { error: "The request could not be completed" });
});
