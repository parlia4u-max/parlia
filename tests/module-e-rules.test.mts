import assert from "node:assert/strict";
import test from "node:test";
import { DUTY_METHODS, isDutyMethod, tracingPolicy } from "../lib/module-e-rules.ts";

test("tracing policy allows the configured max but never one more attempt", () => {
  const now = new Date("2026-10-03T00:00:00.000Z");
  assert.deepEqual(tracingPolicy({
    attemptCount: 2, maxAttempts: 3, waitDays: 14, lastAttemptAt: new Date("2026-09-19T00:00:00.000Z"), startedAt: now,
  }, now), { allowed: true });
  assert.deepEqual(tracingPolicy({
    attemptCount: 3, maxAttempts: 3, waitDays: 0, lastAttemptAt: now, startedAt: now,
  }, now), { allowed: false, reason: "maximum-attempts" });
});

test("tracing policy enforces wait interval from the latest attempt or service start", () => {
  const startedAt = new Date("2026-09-20T00:00:00.000Z");
  const now = new Date("2026-10-03T00:00:00.000Z");
  const waiting = tracingPolicy({ attemptCount: 0, maxAttempts: 3, waitDays: 14, lastAttemptAt: null, startedAt }, now);
  assert.equal(waiting.allowed, false);
  assert.equal(waiting.reason, "wait-period");
  assert.equal(waiting.nextAllowedAt?.toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(tracingPolicy({ attemptCount: 1, maxAttempts: 2, waitDays: 14, lastAttemptAt: new Date("2026-09-19T00:00:00.000Z"), startedAt }, now).allowed, true);
});

test("duty method allowlist accepts only specified methods", () => {
  assert.deepEqual(DUTY_METHODS, ["In person", "E-filing", "Courier", "Post", "Email"]);
  assert.equal(isDutyMethod("Courier"), true);
  assert.equal(isDutyMethod("Fax"), false);
});
