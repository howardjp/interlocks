import { getRepository } from "@/lib/persistence/index.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request) {
  const data = getRepository().exportData();
  const format = new URL(request.url).searchParams.get("format") || "json";
  if (format === "csv") {
    const headers = ["Reference", "Title", "Person", "Matter", "Organization", "Risk", "Score", "Status", "Assignee", "Opened", "Review due"];
    const rows = data.cases.map((item) => [
      item.reference,
      item.title,
      item.personName,
      `${item.matterCode} — ${item.matterTitle}`,
      item.organizationName,
      item.riskLevel,
      item.riskScore,
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
