import { apiError, resolveRequestActor } from "@/lib/auth/request-actor.mjs";
import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const repository = getRepository();
    const actor = await resolveRequestActor(request, repository);
    const { id } = await params;
    const payload = await request.json();
    const result = repository.recordCaseAction(id, payload, actor.accountId);
    return Response.json({ result });
  } catch (error) {
    return apiError(error);
  }
}
