"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkGeofence, canRecordDailyEvent, canRecordDutyEvent, attendanceStatus, workDateFor, MIN_GEOFENCE_RADIUS_METERS, MAX_GEOFENCE_RADIUS_METERS, type AttendanceType } from "@/lib/attendance-rules";

async function currentAttendanceUser(level: "View" | "Edit" = "View") {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  const permission = user.role?.permissions.find((item) => item.module === "attendance");
  const rank = permission?.level === "Edit" ? 2 : permission?.level === "View" ? 1 : 0;
  if (!user.isOwner && rank < (level === "Edit" ? 2 : 1)) {
    throw new ActionError(`You do not have ${level.toLowerCase()} access to clock-in & attendance.`);
  }
  return user;
}

function text(formData: FormData, key: string, label: string, max = 160) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

function numeric(formData: FormData, key: string, label: string) {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw.trim()) throw new ActionError(`${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ActionError(`${label} must be a valid number.`);
  return value;
}

function validEventType(value: string): value is AttendanceType {
  return ["ClockIn", "LunchStart", "LunchEnd", "ClockOut", "DutyCheckIn", "DutyCheckOut"].includes(value);
}

async function todayForFirm(firmId: string, now: Date) {
  const configuration = await getDb().setupConfiguration.findFirst({ where: { firmId }, select: { published: true } });
  const published = configuration?.published && typeof configuration.published === "object"
    ? configuration.published as { countryHolidays?: { country?: string } }
    : {};
  const timeZone = published.countryHolidays?.country === "South Africa" ? "Africa/Johannesburg" : "UTC";
  return workDateFor(now, timeZone);
}

export async function recordAttendanceEvent(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await currentAttendanceUser("Edit");
    const rawType = text(formData, "type", "Attendance event", 40);
    if (!validEventType(rawType)) throw new ActionError("Choose a valid attendance event.");
    const type = rawType;
    const locationId = text(formData, "locationId", "Approved location", 80);
    const dutyId = formData.get("dutyId") === null || formData.get("dutyId") === "" ? null : text(formData, "dutyId", "Assigned duty", 80);
    const isDutyEvent = type === "DutyCheckIn" || type === "DutyCheckOut";
    if (isDutyEvent !== Boolean(dutyId)) throw new ActionError("Select an assigned duty only for duty check-in or check-out.");
    const sample = {
      latitude: numeric(formData, "latitude", "Latitude"),
      longitude: numeric(formData, "longitude", "Longitude"),
      accuracyMeters: numeric(formData, "accuracyMeters", "GPS accuracy"),
      measuredAt: numeric(formData, "measuredAt", "GPS reading time"),
    };
    const now = new Date();
    const db = getDb();
    const workDate = await todayForFirm(user.firmId, now);
    let acceptedLocationName = "";

    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AttendanceLocation" WHERE "id" = ${locationId} AND "firmId" = ${user.firmId} AND "active" = true FOR SHARE`;
      const location = await tx.attendanceLocation.findFirst({
        where: { id: locationId, firmId: user.firmId, active: true },
        select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
      });
      if (!location) throw new ActionError("That location is no longer an active location approved by the owner.");
      const geofence = checkGeofence(sample, location, now.getTime());
      if (!geofence.ok) throw new ActionError(geofence.reason);
      acceptedLocationName = location.name;
      const day = await tx.attendanceDay.upsert({
        where: { firmId_userId_workDate: { firmId: user.firmId, userId: user.id, workDate } },
        create: { firmId: user.firmId, userId: user.id, workDate },
        update: {},
        select: { id: true },
      });
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AttendanceDay" WHERE "id" = ${day.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const dailyEvents = await tx.attendanceEvent.findMany({
        where: { firmId: user.firmId, dayId: day.id },
        select: { type: true, dutyId: true },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      });
      const previousTypes = dailyEvents.map((event) => event.type as AttendanceType);
      const state = attendanceStatus(previousTypes);
      if (isDutyEvent && state !== "On duty") {
        throw new ActionError("Duty check-in and check-out are only available while you are clocked in and not on lunch.");
      }
      if (!isDutyEvent && !canRecordDailyEvent(previousTypes, type)) {
        throw new ActionError("That clock or lunch action is not valid for your current attendance state.");
      }

      let duty: { id: string; title: string } | null = null;
      if (dutyId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "DutyRecord" WHERE "id" = ${dutyId} AND "firmId" = ${user.firmId} FOR UPDATE`;
        duty = await tx.dutyRecord.findFirst({
          where: { id: dutyId, firmId: user.firmId, assignedToId: user.id },
          select: { id: true, title: true },
        });
        if (!duty) throw new ActionError("That duty is not assigned to you in this firm.");
        const currentDutyId = duty.id;
        if (type === "DutyCheckIn") {
          const scheduled = await tx.dutyRecord.findFirst({ where: { id: currentDutyId, firmId: user.firmId, status: { in: ["Scheduled", "Assigned"] } }, select: { id: true } });
          if (!scheduled) throw new ActionError("Only an active scheduled duty can be checked in.");
        }
        const dutyHistory = await tx.attendanceEvent.findMany({
          where: { firmId: user.firmId, dutyId: currentDutyId, day: { userId: user.id } },
          select: { type: true, dutyId: true },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        });
        if (!canRecordDutyEvent(dutyHistory.map((event) => ({ type: event.type as AttendanceType, dutyId: event.dutyId })), currentDutyId, type)) {
          throw new ActionError(type === "DutyCheckIn"
            ? "This duty is already checked in. Check it out before starting another duty shift."
            : "This duty does not have an open check-in to close.");
        }
        if (type === "DutyCheckIn") {
          const allDutyEvents = await tx.attendanceEvent.findMany({
            where: { firmId: user.firmId, day: { userId: user.id }, type: { in: ["DutyCheckIn", "DutyCheckOut"] } },
            select: { type: true, dutyId: true },
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
          });
          const openDuties = new Map<string, AttendanceType>();
          for (const event of allDutyEvents) if (event.dutyId) openDuties.set(event.dutyId, event.type as AttendanceType);
          if ([...openDuties.entries()].some(([openDutyId, eventType]) => openDutyId !== currentDutyId && eventType === "DutyCheckIn")) {
            throw new ActionError("Check out of the current duty before checking in to another duty.");
          }
        }
      }

      if (type === "ClockOut" || type === "LunchStart") {
        const dutyHistory = await tx.attendanceEvent.findMany({
          where: { firmId: user.firmId, day: { userId: user.id }, type: { in: ["DutyCheckIn", "DutyCheckOut"] } },
          select: { type: true, dutyId: true },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        });
        const dutyStates = new Map<string, AttendanceType>();
        for (const event of dutyHistory) if (event.dutyId) dutyStates.set(event.dutyId, event.type as AttendanceType);
        if ([...dutyStates.values()].includes("DutyCheckIn")) {
          throw new ActionError(type === "ClockOut"
            ? "Check out of each active duty before clocking out."
            : "Check out of the active duty before starting lunch.");
        }
      }

      const created = await tx.attendanceEvent.create({
        data: {
          firmId: user.firmId,
          dayId: day.id,
          type,
          occurredAt: now,
          locationId: location.id,
          locationName: location.name,
          siteLatitude: location.latitude,
          siteLongitude: location.longitude,
          radiusMeters: location.radiusMeters,
          dutyId: duty?.id ?? null,
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracyMeters: sample.accuracyMeters,
          distanceMeters: geofence.distanceMeters,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          firmId: user.firmId,
          actorId: user.id,
          action: "attendance.event_recorded",
          entityType: "attendance_event",
          entityId: created.id,
          details: {
            type,
            locationId: location.id,
            locationName: location.name,
            accuracyMeters: sample.accuracyMeters,
            distanceMeters: geofence.distanceMeters,
            dutyId: duty?.id ?? null,
          },
        },
      });
    });

    revalidatePath("/attendance");
    return `success:${type.replaceAll(/([A-Z])/g, " $1").trim()} recorded at ${acceptedLocationName}. This record supports attendance accountability only; it is not payroll data.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function saveAttendanceLocation(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await currentAttendanceUser();
    if (!user.isOwner) throw new ActionError("Only the firm owner can manage approved attendance locations.");
    const name = text(formData, "name", "Location name", 120);
    const latitude = numeric(formData, "latitude", "Latitude");
    const longitude = numeric(formData, "longitude", "Longitude");
    const radiusMeters = numeric(formData, "radiusMeters", "Radius");
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new ActionError("Enter a valid latitude and longitude.");
    }
    if (!Number.isInteger(radiusMeters) || radiusMeters < MIN_GEOFENCE_RADIUS_METERS || radiusMeters > MAX_GEOFENCE_RADIUS_METERS) {
      throw new ActionError(`The geofence radius must be between ${MIN_GEOFENCE_RADIUS_METERS} and ${MAX_GEOFENCE_RADIUS_METERS} metres.`);
    }
    const rawId = formData.get("locationId");
    const locationId = typeof rawId === "string" && rawId.trim() ? rawId.trim() : null;
    const active = formData.get("active") !== "false";
    const db = getDb();
    await db.$transaction(async (tx) => {
      if (locationId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AttendanceLocation" WHERE "id" = ${locationId} AND "firmId" = ${user.firmId} FOR UPDATE`;
        const current = await tx.attendanceLocation.findFirst({
          where: { id: locationId, firmId: user.firmId },
          select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true, active: true },
        });
        if (!current) throw new ActionError("Attendance location not found in this firm.");
        const updated = await tx.attendanceLocation.updateMany({
          where: { id: locationId, firmId: user.firmId },
          data: { name, latitude, longitude, radiusMeters, active },
        });
        if (updated.count !== 1) throw new ActionError("Attendance location changed. Reload and try again.");
        await tx.auditLog.create({
          data: {
            firmId: user.firmId,
            actorId: user.id,
            action: active ? "attendance.location_updated" : "attendance.location_deactivated",
            entityType: "attendance_location",
            entityId: locationId,
            details: {
              previous: { name: current.name, latitude: current.latitude, longitude: current.longitude, radiusMeters: current.radiusMeters, active: current.active },
              updated: { name, latitude, longitude, radiusMeters, active },
            },
          },
        });
      } else {
        const location = await tx.attendanceLocation.create({
          data: { firmId: user.firmId, name, latitude, longitude, radiusMeters },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: { firmId: user.firmId, actorId: user.id, action: "attendance.location_created", entityType: "attendance_location", entityId: location.id, details: { name, latitude, longitude, radiusMeters, active: true } },
        });
      }
    });
    revalidatePath("/attendance");
    return "success:Approved attendance location saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
