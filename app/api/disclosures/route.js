import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const payload = await request.json();
    const result = getRepository().createDisclosure(payload, payload.actor || "Alex Morgan");
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create disclosure";
    return Response.json({ error: message }, { status: 400 });
  }
}
