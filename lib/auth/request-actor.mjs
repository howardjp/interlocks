import { getConfig } from "../config.mjs";
import { DevelopmentIdentityProvider, WorkOSIdentityProvider } from "./identity-provider.mjs";

export async function resolveRequestActor(request, repository) {
  const config = getConfig();
  const provider = config.authProvider === "workos" ? new WorkOSIdentityProvider() : new DevelopmentIdentityProvider();
  const identity = await provider.resolveIdentity(request);
  return repository.resolveExternalIdentity(identity, { registrationMode: config.registrationMode });
}

export function requestWorkspace(request, fallback = null) {
  return request.headers.get("x-interlocks-workspace") || new URL(request.url).searchParams.get("workspace") || fallback;
}

export function apiError(error) {
  const status = error?.code === "FORBIDDEN" ? 403 : error?.code === "INVITE_REQUIRED" ? 401 : 400;
  const message = getConfig().environment === "production" && status >= 500 ? "The request could not be completed" : error?.message || "The request could not be completed";
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
