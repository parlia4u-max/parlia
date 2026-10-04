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

test("matter stages preserve A/W/C/X kinds and validate configured stage tasks", () => {
  const config = createInitialSetupConfig("Example firm");
  const matterTypes = structuredClone(config.matterTypes) as { name: string; stages: { name: string; kind: string; tasks: { title: string; category: string; dueInDays?: number }[] }[] }[];
  matterTypes[0].stages[0] = {
    name: "Awaiting response",
    kind: "W",
    tasks: [{ title: "Follow up", category: "Follow up", dueInDays: 0 }],
  };
  assert.doesNotThrow(() => validateSetupValue("matterTypes", matterTypes));
  assert.throws(() => validateSetupValue("matterTypes", [{ name: "Test", stages: [{ name: "Broken", kind: "Waiting", tasks: [] }] }]), /A, W, C or X/);
  assert.throws(() => validateSetupValue("matterTypes", [{ name: "Test", stages: [{ name: "Broken", kind: "A", tasks: [{ title: "Task", category: "Research" }] }] }]), /supported task category/);
});

test("task setup contains only the six supported Module C categories", () => {
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["Research"] }]), /configured categories/);
});

test("initial minutes setup includes the three meeting templates used by Team", () => {
  const templates = createInitialSetupConfig("Example firm").minutesTemplates as { name: string; sections: string[] }[];
  assert.deepEqual(templates.map((template) => template.name), ["Template A", "Template B", "Template C"]);
  assert.ok(templates.every((template) => template.sections.length > 0));
  assert.doesNotThrow(() => validateSetupValue("minutesTemplates", templates));
});

test("attendance role templates grant only operationally appropriate access by default", () => {
  const templates = createInitialSetupConfig("Example firm").permissions as {
    roles: { name: string; permissions: Record<string, { level: string; scope: string }> }[];
  };
  const permission = (name: string) => templates.roles.find((role) => role.name === name)!.permissions.attendance;
  assert.deepEqual(permission("Lawyer"), { level: "Edit", scope: "Team" });
  assert.deepEqual(permission("Candidate attorney"), { level: "Edit", scope: "Own" });
  assert.deepEqual(permission("Admin"), { level: "View", scope: "Firm" });
  assert.equal(permission("Accounts").level, "None");
  assert.deepEqual(permission("Custom"), { level: "None", scope: "Own" });
});
