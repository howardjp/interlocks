import { apiError, requestWorkspace, resolveRequestActor } from "@/lib/auth/request-actor.mjs";
import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request) {
  const repository = getRepository();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  const kind = url.searchParams.get("kind") || "workspace";
  let data;
  try {
    const actor = await resolveRequestActor(request, repository);
    data = repository.exportData(actor.accountId, requestWorkspace(request, "ws-northstar"), kind, url.searchParams.get("id") || url.searchParams.get("resourceId"));
  } catch (error) { return apiError(error); }
  if (format === "csv") {
    const headers = ["Reference", "Title", "Person", "Matter", "Entity", "Action state", "Human disposition", "Status", "Reviewer", "Opened", "Review due"];
    const rows = data.cases.map((item) => [
      item.reference,
      item.title,
      item.personName,
      `${item.matterCode} — ${item.matterTitle}`,
      item.entityName,
      item.workflowState,
      item.humanDisposition,
      item.status,
      item.assigneeName,
      item.openedAt,
      item.reviewDueAt,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="interlocks-cases.csv"',
      },
    });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interlocks-export.json"',
    },
  });
}
