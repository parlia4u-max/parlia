import Link from "next/link";
import { AttendanceEventControl } from "@/components/attendance-controls";
import { AttendanceLocationForm } from "@/components/attendance-location-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { attendanceStatus, workDateFor, type AttendanceType } from "@/lib/attendance-rules";

type Search = { from?: string; to?: string };
const eventNames: Record<AttendanceType, string> = {
  ClockIn: "Clock in",
  LunchStart: "Lunch started",
  LunchEnd: "Lunch ended",
  ClockOut: "Clock out",
  DutyCheckIn: "Duty check-in",
  DutyCheckOut: "Duty check-out",
};

function parseDate(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function timeLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("attendance");
  const query = await searchParams;
  const db = getDb();
  const configuration = await db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } });
  const published = configuration?.published && typeof configuration.published === "object"
    ? configuration.published as { countryHolidays?: { country?: string } }
    : {};
  const timeZone = published.countryHolidays?.country === "South Africa" ? "Africa/Johannesburg" : "UTC";
  const today = workDateFor(new Date(), timeZone);
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const requestedFrom = parseDate(query.from, defaultFrom);
  const requestedTo = parseDate(query.to, today);
  const to = requestedTo > today ? today : requestedTo;
  const earliestFrom = new Date(to);
  earliestFrom.setUTCDate(earliestFrom.getUTCDate() - 30);
  const boundedFrom = requestedFrom > to || to.getTime() - requestedFrom.getTime() > 30 * 86_400_000
    ? earliestFrom
    : requestedFrom;
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
  const [days, locations, assignedDuties, todayDay] = await Promise.all([
    db.attendanceDay.findMany({
      where: {
        firmId: user.firmId,
        workDate: { gte: boundedFrom, lte: to },
        ...(selectedUsers ? { userId: { in: selectedUsers } } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        events: {
          where: { firmId: user.firmId },
          include: { duty: { select: { title: true } } },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ workDate: "desc" }, { user: { name: "asc" } }],
      take: 20_000,
    }),
    user.isOwner || hasPermission(user, "attendance", "Edit")
      ? db.attendanceLocation.findMany({
        where: { firmId: user.firmId, ...(user.isOwner ? {} : { active: true }) },
        select: { id: true, name: true, active: true, ...(user.isOwner ? { latitude: true, longitude: true, radiusMeters: true } : {}) },
        orderBy: { name: "asc" },
      })
      : Promise.resolve([]),
    hasPermission(user, "attendance", "Edit") ? db.dutyRecord.findMany({
      where: {
        firmId: user.firmId,
        assignedToId: user.id,
        OR: [
          { status: { in: ["Scheduled", "Assigned"] } },
          { attendanceEvents: { some: { firmId: user.firmId, day: { userId: user.id }, type: "DutyCheckIn" } } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        attendanceEvents: {
          where: { firmId: user.firmId, day: { userId: user.id }, type: { in: ["DutyCheckIn", "DutyCheckOut"] } },
          select: { type: true, occurredAt: true },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    }) : Promise.resolve([]),
    hasPermission(user, "attendance", "Edit")
      ? db.attendanceDay.findFirst({
        where: { firmId: user.firmId, userId: user.id, workDate: today },
        include: { events: { where: { firmId: user.firmId }, select: { type: true, dutyId: true }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] } },
      })
      : Promise.resolve(null),
  ]);
  const todayTypes = (todayDay?.events ?? []).map((event) => event.type as AttendanceType);
  const status = attendanceStatus(todayTypes);
  const dailyTypes = todayTypes.filter((type) => type !== "DutyCheckIn" && type !== "DutyCheckOut");
  const hasOpenDuty = assignedDuties.some((duty) => duty.attendanceEvents.at(-1)?.type === "DutyCheckIn");
  const clockActions: AttendanceType[] = dailyTypes.length === 0
    ? ["ClockIn"]
    : dailyTypes.at(-1) === "LunchStart"
      ? ["LunchEnd"]
      : dailyTypes.at(-1) === "ClockIn" || dailyTypes.at(-1) === "LunchEnd"
        ? hasOpenDuty ? [] : ["LunchStart", "ClockOut"]
        : [];
  const dutyActions: { type: "DutyCheckIn" | "DutyCheckOut"; duty: (typeof assignedDuties)[number] }[] = [];
  for (const duty of (status === "On duty" ? assignedDuties : []).filter((item) => item.status === "Scheduled" || item.status === "Assigned" || item.attendanceEvents.at(-1)?.type === "DutyCheckIn")) {
    const last = duty.attendanceEvents.at(-1)?.type;
    if (last === "DutyCheckIn") dutyActions.push({ type: "DutyCheckOut", duty });
    else if (!hasOpenDuty) dutyActions.push({ type: "DutyCheckIn", duty });
  }
  const canEdit = hasPermission(user, "attendance", "Edit");
  const activeLocations = locations.filter((location) => location.active);
  const ownerLocations = user.isOwner ? locations as { id: string; name: string; active: boolean; latitude: number; longitude: number; radiusMeters: number }[] : [];

  return (
    <section className="foundation-page">
      <FoundationHeader title="Clock-in & attendance" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Attendance records support operational accountability only. They are not payroll, pay calculations, time sheets, or legal advice. Location is requested only when you choose an attendance action.</p>

      {canEdit ? <section className="foundation-panel">
        <div className="attendance-current">
          <div>
            <p className="eyebrow">Today · {dateLabel(today)}</p>
            <h2>{status}</h2>
            <p className="foundation-muted">Use a fresh browser GPS reading at an owner-approved location. Your exact coordinates are retained only as evidence for this attendance record.</p>
          </div>
        </div>
        {activeLocations.length ? <div className="attendance-controls-grid">
          {clockActions.map((type) => <AttendanceEventControl key={type} type={type} locations={activeLocations} />)}
          {dutyActions.map(({ type, duty }) => <AttendanceEventControl key={`${type}:${duty.id}`} type={type} dutyId={duty.id} dutyTitle={duty.title} locations={activeLocations} />)}
        </div> : <p className="foundation-notice">The firm owner has not approved an active attendance location yet.</p>}
        <p className="foundation-muted">GPS access requires a secure browser context and your permission. Location accuracy must be 100 metres or better, and the full accuracy radius must fall within the approved geofence.</p>
      </section> : null}

      {user.isOwner ? <section className="foundation-panel">
        <h2>Owner-managed approved locations</h2>
        <p className="foundation-muted">Use the coordinates for the firm site, not an employee. Radius is limited to 25–2,000 metres. Deactivated locations remain on historical records.</p>
        <AttendanceLocationForm />
        <div className="attendance-location-list">
          {ownerLocations.map((location) => <article className="todo-card" key={location.id}>
            <p className="eyebrow">{location.radiusMeters} m geofence</p>
            <h3>{location.name}{location.active ? "" : " · Deactivated"}</h3>
            <p className="foundation-muted">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
            <AttendanceLocationForm location={location} />
          </article>)}
          {!ownerLocations.length ? <p className="foundation-muted">No approved locations. Add one above to enable clock-in.</p> : null}
        </div>
      </section> : null}

      <section className="foundation-panel">
        <div className="attendance-report-heading">
          <div>
            <h2>Attendance report</h2>
            <p className="foundation-muted">Report scope: {user.isOwner ? "Firm" : scope}. Only the attendance permission scope controls which staff records appear.</p>
          </div>
          <a className="button-secondary" href={`/api/attendance/export?from=${dateKey(boundedFrom)}&to=${dateKey(to)}`}>Export CSV</a>
        </div>
        <form className="attendance-date-filter" method="get">
          <label className="foundation-field"><span>From</span><input name="from" type="date" defaultValue={dateKey(boundedFrom)} /></label>
          <label className="foundation-field"><span>To</span><input name="to" type="date" defaultValue={dateKey(to)} /></label>
          <button className="button-secondary" type="submit">Apply dates</button>
        </form>
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead><tr><th>Date</th><th>Staff member</th><th>Event</th><th>Time</th><th>Location / duty</th><th>GPS accuracy</th><th>Distance to site</th></tr></thead>
            <tbody>
              {days.flatMap((day) => day.events.map((event) => (
                <tr key={event.id}>
                  <td>{dateLabel(day.workDate)}</td>
                  <td>{day.user.name}</td>
                  <td>{eventNames[event.type as AttendanceType]}</td>
                  <td>{timeLabel(event.occurredAt, timeZone)}</td>
                  <td>{event.locationName}{event.duty ? ` · ${event.duty.title}` : ""}</td>
                  <td>{event.accuracyMeters.toFixed(0)} m</td>
                  <td>{event.distanceMeters.toFixed(0)} m / {event.radiusMeters} m</td>
                </tr>
              )))}
              {!days.some((day) => day.events.length) ? <tr><td colSpan={7}>No attendance records in this date range.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {days.length >= 20_000 ? <p className="foundation-muted">Showing the most recent 20,000 staff workdays in this scope. Narrow the report dates for older records.</p> : null}
        <p className="foundation-muted">Times are shown in South African time for South African firms and otherwise UTC. Exact coordinates are not displayed in the report.</p>
      </section>

      <p className="foundation-muted">
        {hasPermission(user, "calendar") ? <Link href="/calendar">Calendar</Link> : null}
        {hasPermission(user, "calendar") && hasPermission(user, "people") ? " · " : null}
        {hasPermission(user, "people") ? <Link href="/people/hr">People and HR</Link> : null}
      </p>
    </section>
  );
}
