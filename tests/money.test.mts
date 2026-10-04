import assert from "node:assert/strict";
import test from "node:test";
import { formatRand, statusLabel } from "../lib/money.ts";

test("formats rand amounts including credit notes", () => {
  assert.equal(formatRand(125050).replace(/\s| /g, ","), "R1,250.50");
  assert.equal(formatRand(-500), "-R5.00");
  assert.equal(statusLabel("PartPaid"), "Part paid");
});