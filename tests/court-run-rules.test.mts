import assert from "node:assert/strict";
import test from "node:test";
import { canChangeCourtRun, canConfirmReturn, canUpdateCourtRun, courtRunState, parseCourtRunRows } from "../lib/court-run-rules.ts";

const run = { createdById: "signer", assignedToId: "runner", status: "Assigned", completedAt: null, returnedAt: null, dueAt: new Date("2026-10-20T00:00:00Z") };

test("only the person who signed the run out can change it, and only before it is done", () => {
  assert.ok(canChangeCourtRun(run, "signer"));
  assert.ok(!canChangeCourtRun(run, "runner"));
  assert.ok(!canChangeCourtRun(run, "owner"));
  assert.ok(!canChangeCourtRun({ ...run, status: "Completed", completedAt: new Date() }, "signer"));
});

test("only the assigned person ticks it off", () => {
  assert.ok(canUpdateCourtRun(run, "runner"));
  assert.ok(!canUpdateCourtRun(run, "signer"));
});

test("documents can be confirmed back once, by signer, runner or firm owner", () => {
  assert.ok(canConfirmReturn(run, "signer", false) && canConfirmReturn(run, "runner", false) && canConfirmReturn(run, "someone", true));
  assert.ok(!canConfirmReturn(run, "someone", false));
  assert.ok(!canConfirmReturn({ ...run, returnedAt: new Date() }, "signer", false));
});

test("state shows overdue, done and returned", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  assert.equal(courtRunState(run, now), "Overdue");
  assert.equal(courtRunState({ ...run, dueAt: new Date("2026-10-26T00:00:00Z") }, now), "To do");
  assert.equal(courtRunState({ ...run, completedAt: new Date() }, now), "Done");
  assert.equal(courtRunState({ ...run, completedAt: new Date(), returnedAt: new Date() }, now), "Returned");
});

test("batch rows skip blanks and explain what is missing", () => {
  const { rows, errors } = parseCourtRunRows([
    { dueAt: "2026-10-27", title: "Issue summons", assignedToId: "runner", method: "Fax" },
    { dueAt: "", title: "", assignedToId: "" },
    { dueAt: "2026-10-27", title: "", assignedToId: "runner" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].method, "In person");
  assert.deepEqual(errors, ['Row 3: say what must be done (e.g. "Issue summons").']);
  assert.deepEqual(parseCourtRunRows([]).errors, ["Fill in at least one court run."]);
});
