import { resolve } from "node:path";

const ENVIRONMENTS = ["development", "test", "production"];
const REGISTRATION_MODES = ["DEVELOPMENT", "INVITE_ONLY", "PUBLIC"];

function boolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function loadConfig(environment = process.env) {
  const appEnvironment = environment.INTERLOCKS_ENV || "development";
  if (!ENVIRONMENTS.includes(appEnvironment)) throw new Error("INTERLOCKS_ENV must be development, test, or production");
  const registrationMode = environment.INTERLOCKS_REGISTRATION_MODE || (appEnvironment === "development" ? "DEVELOPMENT" : "INVITE_ONLY");
  if (!REGISTRATION_MODES.includes(registrationMode)) throw new Error("Unsupported INTERLOCKS_REGISTRATION_MODE");

  const demoMode = boolean(environment.INTERLOCKS_DEMO_MODE, appEnvironment === "development");
  const databaseUrl = environment.DATABASE_URL || null;
  const databaseDriver = databaseUrl?.startsWith("postgres") ? "postgres" : "sqlite";
  const authConfigured = Boolean(environment.WORKOS_CLIENT_ID && environment.WORKOS_API_KEY && environment.WORKOS_COOKIE_PASSWORD && environment.NEXT_PUBLIC_WORKOS_REDIRECT_URI);

  const config = {
    environment: appEnvironment,
    registrationMode,
    demoMode,
    databaseDriver,
    databaseUrl,
    sqlitePath: resolve(/* turbopackIgnore: true */ environment.INTERLOCKS_DB_PATH || ".data/interlocks.db"),
    objectStoreDriver: environment.INTERLOCKS_OBJECT_STORE || "filesystem",
    objectStorePath: resolve(/* turbopackIgnore: true */ environment.INTERLOCKS_DOCUMENT_PATH || ".data/documents"),
    authProvider: authConfigured ? "workos" : "development",
    authConfigured,
    appBaseUrl: environment.INTERLOCKS_BASE_URL || "http://localhost:3000",
    logLevel: environment.INTERLOCKS_LOG_LEVEL || (appEnvironment === "production" ? "info" : "debug"),
  };

  if (appEnvironment === "production") {
    if (demoMode) throw new Error("INTERLOCKS_DEMO_MODE must be false in production");
    if (registrationMode === "DEVELOPMENT") throw new Error("Development registration is forbidden in production");
    if (!authConfigured) throw new Error("WorkOS AuthKit configuration is required in production");
    if (environment.WORKOS_COOKIE_PASSWORD.length < 32) throw new Error("WORKOS_COOKIE_PASSWORD must be at least 32 characters");
    if (!config.appBaseUrl.startsWith("https://")) throw new Error("INTERLOCKS_BASE_URL must use HTTPS in production");
  }

  return Object.freeze(config);
}

let cached;
export function getConfig() {
  cached ||= loadConfig();
  return cached;
}

export function resetConfigForTests() {
  cached = undefined;
}
