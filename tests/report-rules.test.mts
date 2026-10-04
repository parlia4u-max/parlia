import assert from "node:assert/strict";
import test from "node:test";
import { narrowerReportScope, quietMatterCutoff, reportCsvField } from "../lib/report-rules.ts";

test("report access is the narrower of report and matter permissions", () => {
  assert.equal(narrowerReportScope("Firm", "Team"), "Team");
  assert.equal(narrowerReportScope("Team", "Own"), "Own");
  assert.equal(narrowerReportScope("Firm", "Firm"), "Firm");
});

test("quiet matter cutoff uses a fixed number of UTC days", () => {
  assert.equal(quietMatterCutoff(new Date("2026-10-04T09:00:00Z"), 30).toISOString(), "2026-09-04T09:00:00.000Z");
});

test("report CSV escapes quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(reportCsvField("=2+2"), "\"'=2+2\"");
  assert.equal(reportCsvField("Smith, \"Leandra\""), "\"Smith, \"\"Leandra\"\"\"");
});
