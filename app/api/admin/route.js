import { apiError, resolveRequestActor } from "../../../lib/auth/request-actor.mjs";
import { getRepository } from "../../../lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const repository = getRepository();
  try {
    const actor = await resolveRequestActor(request, repository);
    return Response.json(repository.globalAdminSnapshot(actor.accountId), { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
