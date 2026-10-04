import assert from "node:assert/strict";
import test from "node:test";
import { configuredLeaveAllowance, leaveBalance, leaveCycleStart, leaveDaysBetween } from "../lib/leave-rules.ts";
import { renderLeavePdf } from "../lib/leave-pdf.ts";
import { decryptSensitive, encryptSensitive, fingerprintSensitive } from "../lib/sensitive-data.ts";
import { createInitialSetupConfig, validateSetupValue } from "../lib/setup-config.ts";
import { matchesHRDocumentMagic } from "../lib/hr-rules.ts";

test("working leave days exclude weekends and configured country holidays", () => {
  assert.equal(leaveDaysBetween(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-05T00:00:00.000Z"), new Set(["2026-01-01"])), 2);
});

test("cycle anchor follows configured employment date and handles month ends", () => {
  assert.equal(leaveCycleStart(new Date("2024-01-31T00:00:00.000Z"), new Date("2026-06-15T00:00:00.000Z"), 12).toISOString(), "2026-01-31T00:00:00.000Z");
});

test("leave balances apply firm rules, carry-over and future reservations", () => {
  const result = leaveBalance({
    type: "Annual",
    rules: { annualLeaveDays: 15, sickLeaveDaysPerCycle: 30, cycleMonths: 12, carryOverDays: 5, studyLeaveDays: null, familyResponsibilityDays: null },
    employedAt: new Date("2024-01-01T00:00:00.000Z"),
    today: new Date("2026-06-15T00:00:00.000Z"),
    requests: [
      { type: "Annual", requestedDays: 12, startDate: new Date("2025-06-01T00:00:00.000Z"), status: "Approved" },
      { type: "Annual", requestedDays: 4, startDate: new Date("2026-03-02T00:00:00.000Z"), status: "Approved" },
      { type: "Annual", requestedDays: 3, startDate: new Date("2026-09-01T00:00:00.000Z"), status: "Pending" },
      { type: "Annual", requestedDays: 8, startDate: new Date("2026-05-01T00:00:00.000Z"), status: "Declined" },
    ],
  });
  assert.deepEqual(result, { configured: true, allowance: 18, used: 7, balance: 11 });
  assert.equal(configuredLeaveAllowance("Study", { studyLeaveDays: null }), null);
  assert.equal(leaveBalance({
    type: "Study", rules: { studyLeaveDays: null }, employedAt: new Date("2026-01-01T00:00:00.000Z"), requests: [], today: new Date("2026-06-01T00:00:00.000Z"),
  }).configured, false);
});

test("study allowance starts unset and A/B/C leave forms are configurable, not statutory defaults", () => {
  const rules = createInitialSetupConfig("Example Firm").leaveRules as {
    studyLeaveDays: number | null;
    familyResponsibilityDays: number | null;
    leaveForms: { id: string; title: string; accentColor: string; footer: string }[];
  };
  assert.equal(rules.studyLeaveDays, null);
  assert.equal(rules.familyResponsibilityDays, null);
  assert.deepEqual(rules.leaveForms.map((form) => form.id), ["A", "B", "C"]);
  assert.doesNotThrow(() => validateSetupValue("leaveRules", rules));
  assert.throws(() => validateSetupValue("leaveRules", { ...rules, leaveForms: [{ ...rules.leaveForms[0], id: "D" }, ...rules.leaveForms.slice(1)] }), /A, B and C/);
});

test("sensitive payload encryption authenticates ciphertext and fingerprints are scoped", () => {
  process.env.SENSITIVE_DATA_ENCRYPTION_KEY = "11".repeat(32);
  const secret = JSON.stringify({ name: "Private" });
  const sealed = encryptSensitive(secret);
  assert.equal(decryptSensitive(sealed.ciphertext, sealed.iv, sealed.authTag), secret);
  assert.notEqual(fingerprintSensitive("Identity document", "firm-a"), fingerprintSensitive("Identity document", "firm-b"));
  assert.throws(() => decryptSensitive(sealed.ciphertext, sealed.iv, "AA=="));
  delete process.env.SENSITIVE_DATA_ENCRYPTION_KEY;
  assert.throws(() => encryptSensitive(secret), /SENSITIVE_DATA_ENCRYPTION_KEY/);
});

test("HR document magic checks reject MIME spoofing and unknown types", () => {
  assert.equal(matchesHRDocumentMagic("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(matchesHRDocumentMagic("image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(matchesHRDocumentMagic("image/jpeg", Buffer.from([0xff, 0xd8, 0xff])), true);
  assert.equal(matchesHRDocumentMagic("image/png", Buffer.from("%PDF-1.7")), false);
  assert.equal(matchesHRDocumentMagic("application/zip", Buffer.from("PK\u0003\u0004")), false);
});

test("approved leave PDF has a valid PDF structure and saved, configured form content", () => {
  const pdf = renderLeavePdf({
    firmName: "Parlia Test Firm", firmAddress: "1 Main Road",
    employee: "A Staff Member", leaveType: "Annual", startDate: "2026-10-05", endDate: "2026-10-06",
    workingDays: 2, reason: "Annual leave request", coverName: "Cover Person", status: "Approved",
    submittedAt: "2026-10-01T10:00:00.000Z", approvedBy: "Firm Owner",
    template: { title: "Firm Leave Form A", accentColor: "#325c4b", footer: "Private staff record" },
  }).toString("ascii");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.includes("(Firm Leave Form A) Tj"));
  assert.ok(pdf.includes("(Firm: Parlia Test Firm) Tj"));
  const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(pdf.slice(xref, xref + 4), "xref");
  assert.ok(pdf.endsWith("%%EOF\n"));
});
