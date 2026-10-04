import test from "node:test";
import assert from "node:assert/strict";
import { employeeVotePeriod, meetingVisibleInPeopleScope, parseMeetingActionItems } from "../lib/team-rules.ts";

test("employee vote period is a stable UTC year-month key", () => {
  assert.equal(employeeVotePeriod(new Date("2026-10-01T00:30:00.000Z")), "2026-10");
  assert.equal(employeeVotePeriod(new Date("2027-01-01T00:00:00.000Z")), "2027-01");
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
