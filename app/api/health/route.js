import { getConfig } from "../../../lib/config.mjs";
import { getRepository } from "../../../lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = getRepository().health();
    return Response.json({ ...health, environment: getConfig().environment }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
