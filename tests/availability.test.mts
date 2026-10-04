import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVAILABILITY, computeSlots, minutesBetween, validateAvailability } from "../lib/availability.ts";

const on = { ...DEFAULT_AVAILABILITY, enabled: true, noticeHours: 0 };

test("no slots when booking is off", () => {
  assert.deepEqual(computeSlots(DEFAULT_AVAILABILITY, [], new Date("2026-03-02T00:00:00Z")), []);
});

test("slots respect hours, weekdays and busy times", () => {
  const now = new Date("2026-03-01T22:00:00Z"); // Monday 00:00 SAST
  const slots = computeSlots(on, [{ startAt: new Date("2026-03-02T07:00:00Z"), endAt: new Date("2026-03-02T07:30:00Z") }], now, 100);
  assert.ok(!slots.some((slot) => slot.toISOString() === "2026-03-02T07:00:00.000Z"));
  assert.ok(slots.some((slot) => slot.toISOString() === "2026-03-02T07:30:00.000Z"));
  assert.ok(slots.every((slot) => { const day = new Date(slot.getTime() + 7_200_000).getUTCDay(); return day >= 1 && day <= 5; }));
});

test("minimum notice hides near slots", () => {
  const now = new Date("2026-03-02T06:00:00Z");
  const slots = computeSlots({ ...on, noticeHours: 24 }, [], now, 5);
  assert.ok(slots[0].getTime() >= now.getTime() + 86_400_000);
});

test("validation and minutes", () => {
  assert.throws(() => validateAvailability({ ...on, startTime: "17:00", endTime: "09:00" }));
  assert.equal(validateAvailability(on).slotMinutes, 30);
  assert.equal(minutesBetween(new Date("2026-03-02T10:00:00Z"), new Date("2026-03-02T10:00:20Z")), 1);
  assert.equal(minutesBetween(new Date("2026-03-02T10:00:00Z"), new Date("2026-03-02T11:15:00Z")), 75);
});
