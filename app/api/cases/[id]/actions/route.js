import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const result = getRepository().recordCaseAction(id, payload, payload.actor || "Alex Morgan");
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update case";
    return Response.json({ error: message }, { status: 400 });
  }
}
