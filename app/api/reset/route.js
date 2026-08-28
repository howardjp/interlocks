import { apiError, resolveRequestActor } from "@/lib/auth/request-actor.mjs";
import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const repository = getRepository();
    const actor = await resolveRequestActor(request, repository);
    return Response.json({ result: repository.resetDemo(actor.accountId) });
  } catch (error) {
    return apiError(error);
  }
}
