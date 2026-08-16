import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    return Response.json({ result: getRepository().resetDemo(payload.actor || "Alex Morgan") });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset demo data";
    return Response.json({ error: message }, { status: 400 });
  }
}
