import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSetupConfig, SETUP_SECTIONS, validateSetupValue } from "../lib/setup-config.ts";
import { applyQuickSetup, defaultAnswers, parseAnswers, PRACTICE_PACKS, ROLE_PRESETS, FIRM_TYPES, SA_PUBLIC_HOLIDAYS } from "../lib/setup-presets.ts";

const everything = (base = createInitialSetupConfig("Example firm")) => applyQuickSetup(base, {
  ...defaultAnswers(base),
  firm: { name: "Example Inc", legalName: "Example Incorporated", email: "info@example.co.za", phone: "011 000 0000", address: "1 Main Road", website: "https://example.co.za", brandColour: "#336699" },
  province: "Gauteng",
  packs: PRACTICE_PACKS.map((pack) => pack.key),
  roles: ROLE_PRESETS.map((preset) => preset.key),
  urgency: "detailed",
});

test("a draft built from every pack and role passes all setup validation", () => {
  const draft = everything();
  for (const section of SETUP_SECTIONS) assert.doesNotThrow(() => validateSetupValue(section.key, draft[section.key]), section.key);
});

test("every stage task uses an active task category and waiting stages can create follow-ups", () => {
  const draft = everything();
  const categories = new Set((draft.taskTypes as { categories: string[] }[]).flatMap((type) => type.categories));
  assert.ok(categories.has("Follow up"));
  for (const type of draft.matterTypes as { name: string; stages: { name: string; tasks: { category: string }[] }[] }[]) {
    for (const stage of type.stages) for (const task of stage.tasks) assert.ok(categories.has(task.category), `${type.name}/${stage.name}`);
  }
});

test("every pack ends in at least one closing stage", () => {
  for (const pack of PRACTICE_PACKS) assert.ok(pack.stages.some((stage) => stage.kind === "C"), pack.key);
  for (const type of FIRM_TYPES) for (const key of type.packs) assert.ok(PRACTICE_PACKS.some((pack) => pack.key === key), key);
});

test("existing matter types and roles that were not picked are kept", () => {
  const draft = applyQuickSetup(createInitialSetupConfig("Example"), { ...defaultAnswers(createInitialSetupConfig("Example")), packs: ["labour"], roles: ["runner"] });
  const types = (draft.matterTypes as { name: string }[]).map((type) => type.name);
  assert.deepEqual(types, ["Litigation", "Conveyancing", "Labour"]);
  const roles = (draft.permissions as { roles: { name: string }[] }).roles.map((item) => item.name);
  assert.ok(roles.includes("Lawyer") && roles.includes("Court runner"));
});

test("holidays are merged without duplicates and cover 2027", () => {
  const draft = everything();
  const holidays = (draft.countryHolidays as { publicHolidays: { date: string }[] }).publicHolidays;
  assert.equal(new Set(holidays.map((holiday) => holiday.date)).size, holidays.length);
  assert.ok(holidays.some((holiday) => holiday.date === "2027-03-26"));
  assert.equal(SA_PUBLIC_HOLIDAYS.find((holiday) => holiday.name === "Day of Goodwill observed")?.date, "2027-12-27");
});

test("answers from the browser are cleaned before use", () => {
  const parsed = parseAnswers(JSON.stringify({ packs: ["labour", "made-up"], roles: ["admin", "hacker"], urgency: "weird", province: "Atlantis", leave: { annualLeaveDays: -4 }, firm: { brandColour: "red" } }));
  assert.deepEqual(parsed.packs, ["labour"]);
  assert.deepEqual(parsed.roles, ["admin"]);
  assert.equal(parsed.urgency, "simple");
  assert.equal(parsed.province, "");
  assert.equal(parsed.leave.annualLeaveDays, 15);
  assert.equal(parsed.firm.brandColour, "#B8913F");
});

test("a firm's own stages on a picked type are kept before the closing stages", () => {
  const base = createInitialSetupConfig("Example");
  base.matterTypes = [{ name: "Labour", stages: [{ name: "Our special step", kind: "A", tasks: [] }, { name: "Conciliation", kind: "A", tasks: [] }] }];
  const draft = applyQuickSetup(base, { ...defaultAnswers(base), packs: ["labour"] });
  const stages = (draft.matterTypes as { name: string; stages: { name: string }[] }[])[0].stages.map((stage) => stage.name);
  assert.equal(stages.filter((name) => name === "Conciliation").length, 1);
  assert.ok(stages.indexOf("Our special step") < stages.indexOf("Matter finalised"));
  assert.doesNotThrow(() => validateSetupValue("matterTypes", draft.matterTypes));
});

test("unused seeded types and roles are dropped, used ones are kept", () => {
  const base = createInitialSetupConfig("Example");
  const draft = applyQuickSetup(base, { ...defaultAnswers(base), packs: ["labour"], roles: ["lawyer"] }, { matterTypes: ["Conveyancing"], roles: ["Accounts"] });
  assert.deepEqual((draft.matterTypes as { name: string }[]).map((type) => type.name), ["Conveyancing", "Labour"]);
  assert.deepEqual((draft.permissions as { roles: { name: string }[] }).roles.map((item) => item.name).sort(), ["Accounts", "Custom", "Lawyer"]);
});
