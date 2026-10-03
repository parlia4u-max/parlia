import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, calendarRange, dateKey, effectiveCalendarVisibility, parseCalendarDate, validCalendarView } from "../lib/calendar.ts";

test("calendar date parser rejects invalid dates and normalizes to UTC day", () => {
  assert.equal(dateKey(parseCalendarDate("2026-10-03")), "2026-10-03");
  assert.equal(dateKey(parseCalendarDate("2026-02-30")), dateKey(startOfToday()));
});

test("calendar ranges use Monday-first weeks and full month rows", () => {
  const week = calendarRange(parseCalendarDate("2026-10-03"), "week");
  assert.equal(dateKey(week.start), "2026-09-28");
  assert.equal(dateKey(week.end), "2026-10-05");
  const month = calendarRange(parseCalendarDate("2026-10-03"), "month");
  assert.equal(dateKey(month.start), "2026-09-28");
  assert.equal((month.end.getTime() - month.start.getTime()) / 86400000 % 7, 0);
});

test("calendar view lengths are exact and unknown views safely use month", () => {
  const date = parseCalendarDate("2026-10-03");
  assert.equal((calendarRange(date, "day").end.getTime() - date.getTime()) / 86400000, 1);
  assert.equal((calendarRange(date, "three-day").end.getTime() - date.getTime()) / 86400000, 3);
  assert.equal((calendarRange(date, "agenda").end.getTime() - date.getTime()) / 86400000, 31);
  assert.equal(validCalendarView("unknown"), "month");
  assert.equal(dateKey(addCalendarDays(date, 1)), "2026-10-04");
});

test("calendar visibility never exceeds either the role permission scope or owner setting", () => {
  assert.equal(effectiveCalendarVisibility("Firm", "Own", false), "Own");
  assert.equal(effectiveCalendarVisibility("Team", "Firm", false), "Team");
  assert.equal(effectiveCalendarVisibility("Firm", "Firm", false), "Firm");
  assert.equal(effectiveCalendarVisibility("Own", "Firm", true), "Firm");
});

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
