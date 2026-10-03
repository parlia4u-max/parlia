import assert from "node:assert/strict";
import test from "node:test";
import { canInviteStaff } from "../lib/staff-seats.ts";

test("staff seats reserve active staff and unexpired pending invitations", () => {
  assert.equal(canInviteStaff(2, 1, 4), true);
  assert.equal(canInviteStaff(2, 2, 4), false);
  assert.equal(canInviteStaff(0, 1, 1), false);
  assert.equal(canInviteStaff(200, 100, null), true);
});
