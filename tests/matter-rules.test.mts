import assert from "node:assert/strict";
import test from "node:test";
import { canAccessRecord, canAccessTask, parseMatterCsv, taskUrgency } from "../lib/matter-rules.ts";

test("CSV parser handles escaped commas, quoted line breaks and optional columns", () => {
  const result = parseMatterCsv(
    'matterNumber,clientName,clientSurname,matterType,stage,responsibleEmail,clientEmail\n' +
    'M-1,"Sam, Ann",Smith,Litigation,Instruction,staff@example.test,\n' +
    'M-2,"Jo\nLee",Jones,Conveyancing,Transfer,staff@example.test,',
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].value?.clientName, "Sam, Ann");
  assert.equal(result[1].value?.clientName, "Jo\nLee");
  assert.equal(result[0].value?.clientNumber, "");
});

test("CSV parser returns helpful errors for malformed rows and untrusted input shape", () => {
  assert.match(parseMatterCsv("matterNumber,clientName\n1,A")[0].error ?? "", /Missing required CSV columns/);
  assert.match(parseMatterCsv("matterNumber,clientName,clientSurname,matterType,stage,responsibleEmail\n1,A")[0].error ?? "", /Expected 6 columns/);
  assert.match(parseMatterCsv('matterNumber,clientName,clientSurname,matterType,stage,responsibleEmail\n1,"A,B,Smith,Litigation,Trial,user@example.test')[0].error ?? "", /unclosed quoted/);
  assert.match(parseMatterCsv('matterNumber,clientName,clientSurname,matterType,stage,responsibleEmail\n1,ab"cd,Smith,Litigation,Trial,user@example.test')[0].error ?? "", /must begin with a quote/);
});

test("CSV rows require the responsible staff address and validate supplied email addresses", () => {
  const parsed = parseMatterCsv(
    "matterNumber,clientName,clientSurname,matterType,stage,responsibleEmail,clientEmail\n" +
    "M-1,A,B,Litigation,Trial,,\n" +
    "M-2,A,B,Litigation,Trial,staff@example.test,not-an-email",
  );
  assert.match(parsed[0].error ?? "", /responsible person email is required/);
  assert.match(parsed[1].error ?? "", /Client email is not valid/);
});

test("urgency follows active bands, places overdue first and treats missing dates as unplanned", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const bands = [
    { name: "Routine", days: 14, colour: "#aaaaaa" },
    { name: "Soon", days: 7, colour: "#bbbbbb" },
    { name: "Urgent", days: 2, colour: "#cccccc" },
  ];
  assert.equal(taskUrgency(new Date("2026-10-05T00:00:00Z"), bands, now).label, "Urgent");
  assert.equal(taskUrgency(new Date("2026-10-10T00:00:00Z"), bands, now).label, "Soon");
  assert.equal(taskUrgency(new Date("2026-09-30T00:00:00Z"), bands, now).label, "Overdue");
  assert.equal(taskUrgency(null, bands, now).label, "No due date");
});

test("record access respects own, team and firm scopes and cannot cross into another team", () => {
  const base = { userId: "manager", owner: false, assignedUserId: "report-1", directReportIds: ["report-1"] };
  assert.equal(canAccessRecord({ ...base, scope: "Own" }), false);
  assert.equal(canAccessRecord({ ...base, scope: "Team" }), true);
  assert.equal(canAccessRecord({ ...base, scope: "Firm" }), true);
  assert.equal(canAccessRecord({ ...base, assignedUserId: "other", scope: "Team" }), false);
  assert.equal(canAccessRecord({ ...base, assignedUserId: "other", scope: "Own", owner: true }), true);
});

test("supervisors retain task access to direct reports even with personal task scope", () => {
  assert.equal(canAccessTask({ userId: "manager", owner: false, scope: "Own", assignedUserId: "report", directReportIds: ["report"] }), true);
  assert.equal(canAccessTask({ userId: "manager", owner: false, scope: "Own", assignedUserId: "other", directReportIds: ["report"] }), false);
});
