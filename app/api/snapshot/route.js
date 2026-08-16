import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(getRepository().getSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to load the Interlocks workspace" }, { status: 500 });
  }
}
