import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findQuietMatters } from "@/lib/report-data";
import { reportCsvField } from "@/lib/report-rules";

export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const user = await getDb().user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !hasPermission(user, "reports") || !hasPermission(user, "matters")) {
    return NextResponse.json({ error: "Matter report access is not permitted." }, { status: 404 });
  }
  const settings = await getDb().firmReportSettings.findUnique({ where: { firmId: user.firmId }, select: { quietMatterDays: true } });
  const threshold = settings?.quietMatterDays ?? 30;
  const { scope, matters } = await findQuietMatters(user, threshold);
  if (!scope) return NextResponse.json({ error: "Matter report access is not permitted." }, { status: 404 });
  await getDb().auditLog.create({
    data: { firmId: user.firmId, actorId: user.id, action: "reports.quiet_exported", entityType: "quiet-matter-report", details: { scope, thresholdDays: threshold, rowCount: matters.length } },
  });
  const header = ["Matter number", "Client", "Matter type", "Stage", "Last activity (UTC)", "Responsible person", "Responsible email"];
  const rows = matters.map((matter) => [
    matter.matterNumber,
    `${matter.clientName} ${matter.clientSurname}`,
    matter.matterType,
    matter.stage,
    matter.lastActivityAt,
    matter.responsible.name,
    matter.responsible.email,
  ]);
  const csv = [header, ...rows].map((row) => row.map(reportCsvField).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="parlia-quiet-matters.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
