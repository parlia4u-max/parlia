import assert from "node:assert/strict";
import test from "node:test";
import { reminderDue } from "../lib/client-notify-rules.ts";

const base = { createdAt: new Date("2026-01-01T00:00:00Z"), reminderDays: [3, 7], reminderMax: 2 };
const at = (days: number) => new Date(new Date("2026-01-01T00:00:00Z").getTime() + days * 86400000);

test("first reminder after 3 days, second after 7, then stops at the maximum", () => {
  assert.equal(reminderDue({ ...base, emailCount: 1, now: at(2) }), false);
  assert.equal(reminderDue({ ...base, emailCount: 1, now: at(3) }), true);
  assert.equal(reminderDue({ ...base, emailCount: 2, now: at(6) }), false);
  assert.equal(reminderDue({ ...base, emailCount: 2, now: at(7) }), true);
  assert.equal(reminderDue({ ...base, emailCount: 3, now: at(30) }), false);
});

test("no reminder when the first email never went out", () => {
  assert.equal(reminderDue({ ...base, emailCount: 0, now: at(30) }), false);
});