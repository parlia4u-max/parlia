import assert from "node:assert/strict";
import test from "node:test";
import { calendarRight, canAddToCalendar, canManageCalendar, canViewCalendar, cleanColour, parseShares } from "../lib/calendar-access.ts";

const calendar = { createdById: "creator", firmAccess: null, shares: [{ userId: "viewer", access: "View" as const }, { userId: "editor", access: "Edit" as const }] };

test("the creator manages the calendar; others get exactly what they were given", () => {
  assert.equal(calendarRight(calendar, "creator"), "Manage");
  assert.equal(calendarRight(calendar, "editor"), "Edit");
  assert.equal(calendarRight(calendar, "viewer"), "View");
  assert.equal(calendarRight(calendar, "stranger"), null);
  assert.ok(canManageCalendar(calendar, "creator") && !canManageCalendar(calendar, "editor"));
  assert.ok(canAddToCalendar(calendar, "editor") && !canAddToCalendar(calendar, "viewer"));
});

test("firm-wide access applies to everyone, and the better of two grants wins", () => {
  const firmView = { ...calendar, firmAccess: "View" as const };
  assert.equal(calendarRight(firmView, "stranger"), "View");
  assert.equal(calendarRight(firmView, "editor"), "Edit");
  assert.equal(calendarRight({ ...calendar, firmAccess: "Edit" as const }, "viewer"), "Edit");
});

test("the firm owner can see every calendar but cannot add to it unless given access", () => {
  assert.ok(canViewCalendar(calendar, "owner", true));
  assert.ok(!canAddToCalendar(calendar, "owner", true));
});

test("sharing lists ignore the creator, strangers, duplicates and bad access levels", () => {
  const shares = parseShares([
    { userId: "a", access: "Edit" }, { userId: "a", access: "View" }, { userId: "creator", access: "View" },
    { userId: "outsider", access: "Edit" }, { userId: "b", access: "Admin" }, { userId: "c", access: "View" },
  ], ["a", "b", "c", "creator"], "creator");
  assert.deepEqual(shares, [{ userId: "a", access: "Edit" }, { userId: "c", access: "View" }]);
  assert.equal(cleanColour("red"), "#B8913F");
  assert.equal(cleanColour("#123abc"), "#123abc");
});
