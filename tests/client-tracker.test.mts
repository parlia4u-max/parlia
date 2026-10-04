import assert from "node:assert/strict";
import test from "node:test";
import { computeTracker, defaultClientSteps, validateClientSteps } from "../lib/client-tracker.ts";

const stages = [{ name: "Intake", kind: "A" }, { name: "Drafting", kind: "A" }, { name: "Closed", kind: "C" }];

test("default steps group closing stages", () => {
  const steps = defaultClientSteps(stages);
  assert.deepEqual(steps.map((s) => s.name), ["Intake", "Drafting", "Finished"]);
});

test("tracker marks done, current and upcoming", () => {
  const steps = defaultClientSteps(stages);
  const result = computeTracker({ steps, currentStage: "Drafting" });
  assert.deepEqual(result?.map((s) => s.state), ["done", "current", "upcoming"]);
});

test("override wins and estimates only show when enabled and not past", () => {
  const steps = defaultClientSteps(stages);
  const est = { Intake: "2030-01-01", Drafting: "2030-02-01" };
  const on = computeTracker({ steps, currentStage: "Intake", override: "Drafting", estimates: est, showEstimates: true });
  assert.deepEqual(on?.map((s) => s.state), ["done", "current", "upcoming"]);
  assert.deepEqual(on?.map((s) => s.estimate), [null, "2030-02-01", null]);
  assert.equal(computeTracker({ steps, currentStage: "Intake", estimates: est })?.[0].estimate, null);
});

test("validation rejects duplicate stage use", () => {
  const fail = (m: string): never => { throw new Error(m); };
  assert.throws(() => validateClientSteps([
    { name: "A", explanation: "x", stages: ["Intake"] },
    { name: "B", explanation: "y", stages: ["Intake"] },
  ], ["Intake"], fail), /more than one/);
});
