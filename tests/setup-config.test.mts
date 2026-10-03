import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSetupConfig, SETUP_SECTIONS, validateSetupValue } from "../lib/setup-config.ts";

test("all seeded setup sections pass server-side validation", () => {
  const config = createInitialSetupConfig("Example firm");
  for (const section of SETUP_SECTIONS) {
    assert.doesNotThrow(() => validateSetupValue(section.key, config[section.key]), section.key);
  }
});

test("South African holiday seeds are explicitly limited to 2026 and factually dated", () => {
  const config = createInitialSetupConfig("Example firm");
  const holidays = config.countryHolidays.publicHolidays as { date: string; name: string }[];
  assert.equal(holidays.find((holiday) => holiday.name === "Good Friday")?.date, "2026-04-03");
  assert.equal(holidays.find((holiday) => holiday.name === "Family Day")?.date, "2026-04-06");
  assert.equal(holidays.find((holiday) => holiday.name === "National Women's Day observed")?.date, "2026-08-10");
  assert.ok(holidays.every((holiday) => holiday.date.startsWith("2026-")));
});

test("firm branding only accepts credential-free HTTPS URLs", () => {
  const profile = createInitialSetupConfig("Example firm").firmProfile;
  assert.doesNotThrow(() => validateSetupValue("firmProfile", { ...profile, logoUrl: "https://images.example.test/logo.png" }));
  assert.throws(() => validateSetupValue("firmProfile", { ...profile, logoUrl: "data:image/png;base64,abc" }), /HTTPS image URL/);
  assert.throws(() => validateSetupValue("firmProfile", { ...profile, logoUrl: "http://images.example.test/logo.png" }), /HTTPS image URL/);
  assert.throws(() => validateSetupValue("firmProfile", { ...profile, logoUrl: "https://user:secret@images.example.test/logo.png" }), /HTTPS image URL/);
});

test("setup list validation rejects impossible dates and duplicate role names", () => {
  const config = createInitialSetupConfig("Example firm");
  const holidays = config.countryHolidays as { country: string; province: string; publicHolidays: { date: string; name: string }[]; courtRecesses: unknown[] };
  assert.throws(() => validateSetupValue("countryHolidays", {
    ...holidays,
    publicHolidays: [{ date: "2026-02-30", name: "Invalid date" }],
  }), /valid date/);

  const permissions = config.permissions as { roles: { name: string; permissions: unknown }[] };
  assert.throws(() => validateSetupValue("permissions", {
    roles: [permissions.roles[0], { ...permissions.roles[0], name: "  lawyer " }],
  }), /unique/);
});
