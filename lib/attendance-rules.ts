export const MIN_GEOFENCE_RADIUS_METERS = 25;
export const MAX_GEOFENCE_RADIUS_METERS = 2_000;
export const MAX_GPS_ACCURACY_METERS = 100;
export const MAX_GPS_SAMPLE_AGE_MILLISECONDS = 2 * 60 * 1000;

export type GeoSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  measuredAt: number;
};

export type GeofenceResult =
  | { ok: true; distanceMeters: number }
  | { ok: false; reason: string };

export function validateGeoSample(input: GeoSample, now = Date.now()): string | null {
  const values = [input.latitude, input.longitude, input.accuracyMeters, input.measuredAt];
  if (values.some((value) => !Number.isFinite(value))) return "Location data must contain finite numbers.";
  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
    return "The GPS coordinates are outside the valid range.";
  }
  if (input.accuracyMeters <= 0 || input.accuracyMeters > MAX_GPS_ACCURACY_METERS) {
    return `GPS accuracy must be better than ${MAX_GPS_ACCURACY_METERS} metres. Move to an area with a clearer signal and retry.`;
  }
  if (input.measuredAt > now + 30_000 || now - input.measuredAt > MAX_GPS_SAMPLE_AGE_MILLISECONDS) {
    return "The GPS reading has expired. Request a fresh location and retry.";
  }
  return null;
}

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

export function haversineDistanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function checkGeofence(
  sample: GeoSample,
  location: { latitude: number; longitude: number; radiusMeters: number },
  now = Date.now(),
): GeofenceResult {
  const invalid = validateGeoSample(sample, now);
  if (invalid) return { ok: false, reason: invalid };
  if (!Number.isInteger(location.radiusMeters) || location.radiusMeters < MIN_GEOFENCE_RADIUS_METERS ||
      location.radiusMeters > MAX_GEOFENCE_RADIUS_METERS ||
      !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
      location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) {
    return { ok: false, reason: "This approved location has invalid geofence settings. Contact the firm owner." };
  }
  const distanceMeters = haversineDistanceMeters(sample.latitude, sample.longitude, location.latitude, location.longitude);
  if (distanceMeters + sample.accuracyMeters > location.radiusMeters) {
    return { ok: false, reason: "Your verified GPS accuracy range is outside the approved geofence. Move closer to the location and retry." };
  }
  return { ok: true, distanceMeters };
}

export type AttendanceType = "ClockIn" | "LunchStart" | "LunchEnd" | "ClockOut" | "DutyCheckIn" | "DutyCheckOut";

export function canRecordDailyEvent(previous: AttendanceType[], next: AttendanceType): boolean {
  const dailyEvents = previous.filter((event) => event !== "DutyCheckIn" && event !== "DutyCheckOut");
  if (next === "ClockIn") return dailyEvents.length === 0;
  if (dailyEvents.length === 0 || dailyEvents[0] !== "ClockIn" || dailyEvents.includes("ClockOut")) return false;
  const last = dailyEvents[dailyEvents.length - 1];
  if (next === "LunchStart") return last === "ClockIn" || last === "LunchEnd";
  if (next === "LunchEnd") return last === "LunchStart";
  if (next === "ClockOut") return last === "ClockIn" || last === "LunchEnd";
  return true;
}

export function canRecordDutyEvent(
  previous: { type: AttendanceType; dutyId: string | null }[],
  dutyId: string,
  next: AttendanceType,
) {
  if (next !== "DutyCheckIn" && next !== "DutyCheckOut") return false;
  const dutyEvents = previous.filter((event) => event.dutyId === dutyId).map((event) => event.type);
  if (next === "DutyCheckIn") return dutyEvents.length === 0 || dutyEvents.at(-1) === "DutyCheckOut";
  return dutyEvents.at(-1) === "DutyCheckIn";
}

export function workDateFor(now: Date, timeZone = "Africa/Johannesburg") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

export function attendanceStatus(types: AttendanceType[]) {
  const last = types.filter((type) => type !== "DutyCheckIn" && type !== "DutyCheckOut").at(-1);
  if (last === "ClockOut") return "Clocked out";
  if (last === "LunchStart") return "On lunch";
  if (last === "ClockIn" || last === "LunchEnd") return "On duty";
  return "Not clocked in";
}

export function csvField(value: string | number | Date | null | undefined) {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
