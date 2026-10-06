import test from "node:test";
import assert from "node:assert/strict";
import { employeeVoteDeadline, employeeVotePeriod, meetingVisibleInPeopleScope, parseMeetingActionItems } from "../lib/team-rules.ts";

test("employee vote period is a stable UTC year-month key", () => {
  assert.equal(employeeVotePeriod(new Date("2026-10-01T00:30:00.000Z")), "2026-10");
  assert.equal(employeeVotePeriod(new Date("2027-01-01T00:00:00.000Z")), "2027-01");
});

test("employee vote deadlines validate settings and clamp to the month's last day", () => {
  assert.equal(employeeVoteDeadline("2026-02", 31, "17:30").toISOString(), "2026-02-28T17:30:00.000Z");
  assert.equal(employeeVoteDeadline("2028-02", 29, "09:00").toISOString(), "2028-02-29T09:00:00.000Z");
  assert.throws(() => employeeVoteDeadline("2026-13", 25, "17:00"), /period/);
  assert.throws(() => employeeVoteDeadline("2026-10", 0, "17:00"), /deadline settings/);
  assert.throws(() => employeeVoteDeadline("2026-10", 25, "25:00"), /deadline settings/);
});

test("meeting visibility obeys own, team and firm people scopes", () => {
  const meeting = {
    userId: "staff-a",
    createdById: "staff-c",
    participantIds: ["staff-b"],
    directReportIds: ["staff-c"],
  };
  assert.equal(meetingVisibleInPeopleScope({ ...meeting, scope: "Own" }), false);
  assert.equal(meetingVisibleInPeopleScope({ ...meeting, scope: "Team" }), true);
  assert.equal(meetingVisibleInPeopleScope({ ...meeting, scope: "Firm", directReportIds: [] }), true);
  assert.equal(meetingVisibleInPeopleScope({ ...meeting, scope: "Team", directReportIds: ["staff-d"] }), false);
  assert.equal(meetingVisibleInPeopleScope({ ...meeting, scope: "Own", participantIds: ["staff-a"] }), true);
});

test("meeting action items are trimmed and empty rows discarded", () => {
  assert.deepEqual(parseMeetingActionItems("  Draft advice  \n\n File papers "), ["Draft advice", "File papers"]);
  assert.deepEqual(parseMeetingActionItems(null), []);
});

test("meeting action item count and title lengths are bounded", () => {
  assert.throws(() => parseMeetingActionItems(Array.from({ length: 21 }, (_, index) => `Action ${index}`).join("\n")), /up to 20/);
  assert.throws(() => parseMeetingActionItems("x".repeat(241)), /240 characters/);
});
