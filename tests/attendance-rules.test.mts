import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceStatus,
  canRecordDailyEvent,
  canRecordDutyEvent,
  checkGeofence,
  csvField,
  haversineDistanceMeters,
  MAX_GPS_ACCURACY_METERS,
  MIN_GEOFENCE_RADIUS_METERS,
  validateGeoSample,
  workDateFor,
} from "../lib/attendance-rules.ts";
import { hasPermission, permissionScope } from "../lib/permissions.ts";

const now = new Date("2026-10-04T07:00:00.000Z");
const sample = { latitude: -26.2041, longitude: 28.0473, accuracyMeters: 8, measuredAt: now.getTime() };
const johannesburg = { latitude: -26.2041, longitude: 28.0473, radiusMeters: 100 };

test("GPS validation rejects invalid coordinates, poor accuracy and stale or future readings", () => {
  assert.equal(validateGeoSample(sample, now.getTime()), null);
  assert.match(validateGeoSample({ ...sample, latitude: 91 }, now.getTime())!, /valid range/);
  assert.match(validateGeoSample({ ...sample, accuracyMeters: MAX_GPS_ACCURACY_METERS + 1 }, now.getTime())!, /accuracy/);
  assert.match(validateGeoSample({ ...sample, measuredAt: now.getTime() - 121_000 }, now.getTime())!, /expired/);
  assert.match(validateGeoSample({ ...sample, measuredAt: now.getTime() + 31_000 }, now.getTime())!, /expired/);
  assert.match(validateGeoSample({ ...sample, longitude: Number.NaN }, now.getTime())!, /finite/);
});

test("geofence accepts only when the reported uncertainty circle fits within approved radius", () => {
  assert.deepEqual(checkGeofence(sample, johannesburg, now.getTime()), { ok: true, distanceMeters: 0 });
  assert.equal(haversineDistanceMeters(0, 0, 0, 1) > 111_000, true);
  assert.equal(checkGeofence({ ...sample, latitude: -26.205 }, johannesburg, now.getTime()).ok, false);
  assert.equal(checkGeofence(sample, { ...johannesburg, radiusMeters: MIN_GEOFENCE_RADIUS_METERS - 1 }, now.getTime()).ok, false);
});

test("clock and lunch transitions reject duplicates and invalid ordering", () => {
  assert.equal(canRecordDailyEvent([], "ClockIn"), true);
  assert.equal(canRecordDailyEvent([], "ClockOut"), false);
  assert.equal(canRecordDailyEvent(["ClockIn"], "LunchStart"), true);
  assert.equal(canRecordDailyEvent(["ClockIn", "LunchStart"], "LunchEnd"), true);
  assert.equal(canRecordDailyEvent(["ClockIn", "LunchStart"], "ClockOut"), false);
  assert.equal(canRecordDailyEvent(["ClockIn", "LunchStart", "LunchEnd"], "ClockOut"), true);
  assert.equal(canRecordDailyEvent(["ClockIn", "ClockOut"], "LunchStart"), false);
  assert.equal(attendanceStatus(["ClockIn", "LunchStart", "LunchEnd"]), "On duty");
  assert.equal(attendanceStatus(["ClockIn", "LunchStart"]), "On lunch");
});

test("duty check-ins and check-outs remain paired to their assigned duty", () => {
  assert.equal(canRecordDutyEvent([], "duty-1", "DutyCheckIn"), true);
  assert.equal(canRecordDutyEvent([{ type: "DutyCheckIn", dutyId: "duty-1" }], "duty-1", "DutyCheckOut"), true);
  assert.equal(canRecordDutyEvent([], "duty-1", "DutyCheckOut"), false);
  assert.equal(canRecordDutyEvent([{ type: "DutyCheckOut", dutyId: "duty-1" }], "duty-1", "DutyCheckOut"), false);
  assert.equal(canRecordDutyEvent([{ type: "DutyCheckIn", dutyId: "duty-2" }], "duty-1", "DutyCheckOut"), false);
});

test("workday grouping uses firm timezone and CSV protects spreadsheet formula cells", () => {
  assert.equal(workDateFor(new Date("2026-10-03T23:00:00.000Z"), "Africa/Johannesburg").toISOString().slice(0, 10), "2026-10-04");
  assert.equal(workDateFor(new Date("2026-10-03T23:00:00.000Z"), "UTC").toISOString().slice(0, 10), "2026-10-03");
  assert.equal(csvField("=1+1"), "\"'=1+1\"");
  assert.equal(csvField("Court, \"Main\""), "\"Court, \"\"Main\"\"\"");
});

test("attendance role permissions gate viewing, editing and report scope", () => {
  const ownEditor = { isOwner: false, role: { permissions: [{ module: "attendance", level: "Edit", scope: "Own" }] } };
  const firmViewer = { isOwner: false, role: { permissions: [{ module: "attendance", level: "View", scope: "Firm" }] } };
  assert.equal(hasPermission(ownEditor, "attendance", "Edit"), true);
  assert.equal(permissionScope(ownEditor, "attendance"), "Own");
  assert.equal(hasPermission(firmViewer, "attendance", "View"), true);
  assert.equal(hasPermission(firmViewer, "attendance", "Edit"), false);
  assert.equal(permissionScope(firmViewer, "attendance"), "Firm");
  assert.equal(hasPermission({ isOwner: false, role: { permissions: [] } }, "attendance"), false);
});
