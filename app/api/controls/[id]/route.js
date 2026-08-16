import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const result = getRepository().completeControl(id, payload.actor || "Alex Morgan");
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete control";
    return Response.json({ error: message }, { status: 400 });
  }
}
