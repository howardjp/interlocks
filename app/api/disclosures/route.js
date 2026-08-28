import { apiError, requestWorkspace, resolveRequestActor } from "@/lib/auth/request-actor.mjs";
import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const repository = getRepository();
    const actor = await resolveRequestActor(request, repository);
    const payload = await request.json();
    const result = repository.createDisclosure(payload, actor.accountId, payload.workspaceId || requestWorkspace(request, "ws-northstar"));
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
