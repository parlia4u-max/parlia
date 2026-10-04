import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission, permissionScope } from "@/lib/permissions";
import { csvField } from "@/lib/attendance-rules";

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

const eventLabels: Record<string, string> = {
  ClockIn: "Clock in",
  LunchStart: "Lunch started",
  LunchEnd: "Lunch ended",
  ClockOut: "Clock out",
  DutyCheckIn: "Duty check-in",
  DutyCheckOut: "Duty check-out",
};

export async function GET(request: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !hasPermission(user, "attendance")) return NextResponse.json({ error: "Attendance report access is not permitted." }, { status: 404 });

  const url = new URL(request.url);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  if (!from || !to || to < from || to.getTime() - from.getTime() > 30 * 86_400_000) {
    return NextResponse.json({ error: "Choose a valid date range of up to 31 days." }, { status: 400 });
  }
  const scope = permissionScope(user, "attendance");
  const directReports = !user.isOwner && scope === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const selectedUsers = user.isOwner || scope === "Firm"
    ? undefined
    : scope === "Team"
      ? [user.id, ...directReports.map((report) => report.userId)]
      : [user.id];
  const events = await db.attendanceEvent.findMany({
    where: {
      firmId: user.firmId,
      day: { firmId: user.firmId, workDate: { gte: from, lte: to }, ...(selectedUsers ? { userId: { in: selectedUsers } } : {}) },
    },
    include: {
      day: { include: { user: { select: { name: true } } } },
      duty: { select: { title: true } },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    take: 100_001,
  });
  if (events.length > 100_000) {
    return NextResponse.json({ error: "This export is larger than 100,000 events. Narrow the date range and export again." }, { status: 413 });
  }
  await db.auditLog.create({
    data: {
      firmId: user.firmId,
      actorId: user.id,
      action: "attendance.report_exported",
      entityType: "attendance_report",
      details: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), scope: user.isOwner ? "Firm" : scope, rows: events.length },
    },
  });

  const header = ["Work date", "Staff member", "Event", "Recorded at (UTC)", "Approved location", "Assigned duty", "GPS accuracy (m)", "Distance to site (m)", "Geofence radius (m)"];
  const rows = events.map((event) => [
    event.day.workDate.toISOString().slice(0, 10),
    event.day.user.name,
    eventLabels[event.type] ?? event.type,
    event.occurredAt,
    event.locationName,
    event.duty?.title ?? "",
    event.accuracyMeters.toFixed(1),
    event.distanceMeters.toFixed(1),
    event.radiusMeters,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parlia-attendance-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
