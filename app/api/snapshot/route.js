import { apiError, requestWorkspace, resolveRequestActor } from "@/lib/auth/request-actor.mjs";
import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const repository = getRepository();
  try {
    const actor = await resolveRequestActor(request, repository);
    const url = new URL(request.url);
    return Response.json(repository.getSnapshot(actor.accountId, requestWorkspace(request), {
      viewAsAccountId: url.searchParams.get("viewAs") || null,
      reason: url.searchParams.get("reason") || null,
    }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
