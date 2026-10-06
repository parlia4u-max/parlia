import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSetupConfig, SETUP_SECTIONS, validateSetupValue } from "../lib/setup-config.ts";
import { matterTypesFromConfig, taskCategoriesFromConfig } from "../lib/matter-config.ts";

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

test("matter stages preserve A/W/C/X kinds and allow configured custom task categories", () => {
  const config = createInitialSetupConfig("Example firm");
  const matterTypes = structuredClone(config.matterTypes) as { name: string; stages: { name: string; kind: string; tasks: { title: string; category: string; dueInDays?: number }[] }[] }[];
  matterTypes[0].stages[0] = {
    name: "Awaiting response",
    kind: "W",
    tasks: [{ title: "Follow up", category: "Follow up", dueInDays: 0 }],
  };
  assert.doesNotThrow(() => validateSetupValue("matterTypes", matterTypes));
  assert.throws(() => validateSetupValue("matterTypes", [{ name: "Test", stages: [{ name: "Broken", kind: "Waiting", tasks: [] }] }]), /A, W, C or X/);
  assert.doesNotThrow(() => validateSetupValue("matterTypes", [{ name: "Test", stages: [{ name: "Broken", kind: "A", tasks: [{ title: "Task", category: "Research" }] }] }]));
  assert.throws(() => validateSetupValue("matterTypes", [{ name: "Test", stages: [{ name: "Broken", kind: "A", tasks: [{ title: "Task", category: " " }] }] }]), /cannot be blank/);
});

test("task setup accepts custom categories and validates their subcategories", () => {
  assert.doesNotThrow(() => validateSetupValue("taskTypes", [{ name: "Work", categories: [" Research ", "Drafting"], subcategories: { Research: ["Case law", "Interviews"] } }]));
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["Research", " research "] }]), /unique/);
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["  "] }]), /cannot be blank/);
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["Research"], subcategories: { Other: ["Case law"] } }]), /belong to an existing/);
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["Research"], subcategories: { Research: ["Case law", " case law "] } }]), /unique/);
  assert.throws(() => validateSetupValue("taskTypes", [{ name: "Work", categories: ["Research"], subcategories: { Research: [""] } }]), /cannot be blank/);
});

test("task config readers retain custom categories and normalize category names", () => {
  assert.deepEqual(taskCategoriesFromConfig({ taskTypes: [{ categories: [" Research ", "Drafting", "research", ""] }] }), ["Research", "Drafting"]);
  assert.deepEqual(taskCategoriesFromConfig({ taskTypes: [{ categories: [] }] }), []);
  assert.deepEqual(taskCategoriesFromConfig({}), ["Drafting", "Court runs", "Tasks", "Follow up", "Updates internal", "Updates external"]);
  assert.deepEqual(matterTypesFromConfig({ matterTypes: [{ name: " Litigation ", stages: [{ name: " Review ", tasks: [{ title: " Research ", category: " Custom ", dueInDays: 2 }] }] }] }), [
    { name: "Litigation", stages: [{ name: "Review", kind: "A", tasks: [{ title: "Research", category: "Custom", dueInDays: 2 }] }] },
  ]);
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
