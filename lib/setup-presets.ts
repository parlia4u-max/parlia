// Ready-made South African law firm settings used by the guided set-up.
// Pure functions only: they build a Setup Centre draft that the owner can still
// fine-tune section by section afterwards.
import { MODULES, type ModuleKey } from "./permissions.ts";
import { TASK_CATEGORIES, type SetupConfig } from "./setup-config.ts";

type Kind = "A" | "W" | "C" | "X";
type StageTask = { title: string; category: string; dueInDays?: number };
type Stage = { name: string; kind: Kind; tasks: StageTask[] };
export type PracticePack = { key: string; name: string; summary: string; stages: Stage[] };

const s = (name: string, kind: Kind = "A", tasks: StageTask[] = []): Stage => ({ name, kind, tasks });
const t = (title: string, category: string, dueInDays?: number): StageTask => dueInDays === undefined ? { title, category } : { title, category, dueInDays };

/** Task categories offered to every firm. The first six are the ones Parlia's workflows rely on. */
export const WIZARD_TASK_CATEGORIES = [...TASK_CATEGORIES, "Messages and calls", "Filing"] as const;

export const PRACTICE_PACKS: PracticePack[] = [
  {
    key: "civil", name: "Civil litigation", summary: "Letter of demand to judgment, taxation and execution",
    stages: [
      s("Instructions received", "A", [t("Open file and confirm mandate", "Tasks", 1)]),
      s("Letter of demand", "W", [t("Draft letter of demand", "Drafting", 3)]),
      s("Summons", "A", [t("Draft summons and particulars of claim", "Drafting", 5), t("Issue and serve summons", "Court runs", 7)]),
      s("Pleadings", "A"),
      s("Discovery", "A", [t("Draft discovery affidavit", "Drafting", 10)]),
      s("Pre-trial", "A"),
      s("Trial preparation", "A", [t("Index and paginate trial bundle", "Drafting", 10)]),
      s("Trial", "A"),
      s("Judgment", "W"),
      s("Taxation of costs", "A", [t("Draft bill of costs", "Drafting", 10)]),
      s("Execution", "A", [t("Issue warrant of execution", "Court runs", 5)]),
      s("Closed", "C"),
      s("Settled or withdrawn", "X"),
    ],
  },
  {
    key: "labour", name: "Labour", summary: "CCMA and bargaining council referrals through to the Labour Court",
    stages: [
      s("Book consultation"),
      s("Instructions received", "A", [t("Open file and confirm mandate", "Tasks", 1)]),
      s("Pre-litigation or internal process"),
      s("Referral to CCMA or bargaining council", "A", [t("Draft referral (LRA 7.11)", "Drafting", 2), t("Serve referral on the other party", "Court runs", 3)]),
      s("Conciliation preparation"),
      s("Conciliation", "W"),
      s("Certificate of outcome"),
      s("Arbitration referral", "A", [t("Draft referral to arbitration (LRA 7.13)", "Drafting", 2)]),
      s("Pre-arbitration"),
      s("Arbitration preparation"),
      s("Arbitration"),
      s("Award or outcome received", "W"),
      s("Settlement or award enforcement"),
      s("Labour Court referral", "A", [t("Draft statement of claim", "Drafting", 10)]),
      s("Labour Court pleadings"),
      s("Labour Court discovery"),
      s("Labour Court pre-trial"),
      s("Labour Court trial"),
      s("Judgment or order", "W"),
      s("Review, appeal or variation"),
      s("Matter finalised", "C"),
    ],
  },
  {
    key: "collections", name: "Debt collection", summary: "Demand, judgment, warrant, section 65 and emoluments",
    stages: [
      s("Instructions received", "A", [t("Confirm debtor details and amount", "Tasks", 1)]),
      s("Letter of demand", "W", [t("Send letter of demand (s129 / s56)", "Drafting", 2)]),
      s("Summons", "A", [t("Draft and issue summons", "Drafting", 5)]),
      s("Default judgment", "A", [t("Apply for default judgment", "Drafting", 5)]),
      s("Warrant of execution", "A", [t("Issue warrant and instruct sheriff", "Court runs", 5)]),
      s("Section 65 financial enquiry", "A"),
      s("Emoluments attachment or garnishee", "A"),
      s("Payment arrangement", "W"),
      s("Paid up", "C"),
      s("Uncollectable", "X"),
    ],
  },
  {
    key: "divorce", name: "Divorce and family", summary: "Divorce, maintenance and care and contact",
    stages: [
      s("Consultation"),
      s("Summons", "A", [t("Draft divorce summons", "Drafting", 5)]),
      s("Summons served", "W"),
      s("Plea and counterclaim"),
      s("Family Advocate", "W"),
      s("Settlement negotiations", "A", [t("Draft settlement agreement / parenting plan", "Drafting", 7)]),
      s("Hearing"),
      s("Decree or order granted"),
      s("Closed", "C"),
      s("Withdrawn", "X"),
    ],
  },
  {
    key: "anc", name: "Antenuptial contracts", summary: "Drafting, signing before a notary and registration",
    stages: [
      s("Instructions received"),
      s("ANC drafted", "A", [t("Draft antenuptial contract", "Drafting", 2)]),
      s("Signing before notary", "A", [t("Book signing with notary", "Tasks", 3)]),
      s("Lodged at Deeds Office", "W"),
      s("Registered", "C"),
    ],
  },
  {
    key: "criminal", name: "Criminal", summary: "Bail, trial, sentencing and appeal",
    stages: [
      s("Instructions received"),
      s("Bail application", "A", [t("Prepare bail application", "Drafting", 1)]),
      s("Remand", "W"),
      s("Trial preparation"),
      s("Trial"),
      s("Sentencing"),
      s("Appeal"),
      s("Closed", "C"),
      s("Charges withdrawn", "X"),
    ],
  },
  {
    key: "protection", name: "Protection orders", summary: "Domestic violence and harassment applications",
    stages: [
      s("Instructions received"),
      s("Application drafted", "A", [t("Draft protection order application", "Drafting", 1)]),
      s("Interim order", "W"),
      s("Return date"),
      s("Final order"),
      s("Closed", "C"),
    ],
  },
  {
    key: "eviction", name: "Eviction (PIE)", summary: "Breach notice to sheriff eviction",
    stages: [
      s("Instructions received", "A", [t("Collect lease, title deed and arrears schedule", "Tasks", 2)]),
      s("Notice to remedy breach", "W", [t("Send notice to remedy breach", "Drafting", 2)]),
      s("Lease cancelled"),
      s("Section 4(1) application", "A", [t("Draft eviction application", "Drafting", 7)]),
      s("Section 4(2) notice served", "W", [t("Serve section 4(2) notice", "Court runs", 5)]),
      s("Hearing"),
      s("Eviction order"),
      s("Sheriff eviction", "A", [t("Instruct sheriff to evict", "Court runs", 3)]),
      s("Closed", "C"),
    ],
  },
  {
    key: "conveyancing", name: "Conveyancing", summary: "Transfers and bonds through to registration",
    stages: [
      s("Instructions received"),
      s("FICA and documents", "A", [t("Request FICA documents", "Tasks", 2)]),
      s("Transfer documents drafted", "A", [t("Draft transfer documents", "Drafting", 5)]),
      s("Signing"),
      s("Rates and levy clearance", "W"),
      s("Transfer duty (SARS)", "W"),
      s("Lodgement", "W"),
      s("Registration"),
      s("Closed", "C"),
    ],
  },
  {
    key: "estates", name: "Deceased estates and wills", summary: "Reporting to the Master through distribution",
    stages: [
      s("Instructions received"),
      s("Estate reported to Master", "A", [t("Report estate to the Master", "Drafting", 5)]),
      s("Letters of executorship", "W"),
      s("Advertise for creditors", "W"),
      s("Inventory and valuation"),
      s("Liquidation and distribution account", "A", [t("Draft L&D account", "Drafting", 10)]),
      s("Account lying for inspection", "W"),
      s("Distribution"),
      s("Closed", "C"),
    ],
  },
  {
    key: "raf", name: "Road Accident Fund", summary: "Claim lodgement to payment",
    stages: [
      s("Instructions received"),
      s("Medical and accident records", "A", [t("Request hospital records and accident report", "Tasks", 5)]),
      s("Claim lodged", "W"),
      s("Summons"),
      s("Pleadings"),
      s("Settlement or trial"),
      s("Payment received"),
      s("Closed", "C"),
    ],
  },
  {
    key: "insurance", name: "Insurance recoveries (motor)", summary: "Recovering an insurer's loss from the other driver",
    stages: [
      s("Instructions received"),
      s("Letter of demand", "W", [t("Send letter of demand to third party", "Drafting", 2)]),
      s("Summons", "A", [t("Draft and issue summons", "Drafting", 5)]),
      s("Default judgment or defended"),
      s("Trial"),
      s("Recovery and payment"),
      s("Closed", "C"),
      s("Abandoned", "X"),
    ],
  },
  {
    key: "advice", name: "Legal opinions and advice", summary: "Short advice and opinion work",
    stages: [
      s("Instructions received"),
      s("Research"),
      s("Opinion drafted", "A", [t("Draft opinion", "Drafting", 5)]),
      s("Delivered", "C"),
    ],
  },
];

export const FIRM_TYPES = [
  { key: "general", label: "General practice", packs: ["civil", "labour", "divorce", "criminal", "advice"] },
  { key: "funded", label: "Litigation for LegalWise / Santam members", packs: ["civil", "labour", "criminal", "divorce", "protection", "eviction", "anc", "advice"] },
  { key: "labour", label: "Labour law", packs: ["labour", "advice"] },
  { key: "property", label: "Conveyancing and estates", packs: ["conveyancing", "estates", "anc"] },
  { key: "family", label: "Family law", packs: ["divorce", "anc", "protection"] },
  { key: "collections", label: "Debt collection and insurance recoveries", packs: ["collections", "insurance", "civil"] },
] as const;

type Access = { level: "None" | "View" | "Edit"; scope: "Own" | "Team" | "Firm" };
const role = (name: string, rule: (module: ModuleKey) => Access) => ({ name, permissions: Object.fromEntries(MODULES.map((module) => [module, rule(module)])) });

export const ROLE_PRESETS = [
  { key: "director", label: "Director / partner", description: "Sees and edits everything except firm set-up",
    build: () => role("Director", (m) => ({ level: m === "settings" ? "View" : "Edit", scope: "Firm" })) },
  { key: "lawyer", label: "Attorney", description: "Runs matters, tasks and calendar; views reports",
    build: () => role("Lawyer", (m) => ({ level: ["matters", "tasks", "calendar", "attendance"].includes(m) ? "Edit" : ["people", "reports"].includes(m) ? "View" : "None", scope: m === "matters" || m === "calendar" ? "Firm" : m === "attendance" ? "Team" : "Own" })) },
  { key: "candidate", label: "Candidate attorney", description: "Works on the matters and tasks given to them",
    build: () => role("Candidate attorney", (m) => ({ level: ["matters", "tasks", "attendance"].includes(m) ? "Edit" : ["calendar", "people"].includes(m) ? "View" : "None", scope: m === "matters" ? "Team" : "Own" })) },
  { key: "admin", label: "Secretary / admin", description: "Opens matters, manages the diary, files and staff records",
    build: () => role("Admin", (m) => ({ level: ["settings", "people", "matters", "calendar", "tasks"].includes(m) ? "Edit" : m === "accounts" ? "None" : "View", scope: "Firm" })) },
  { key: "accounts", label: "Accounts / bookkeeper", description: "Billing, payments and accounts; views matters",
    build: () => role("Accounts", (m) => ({ level: m === "accounts" ? "Edit" : ["matters", "reports"].includes(m) ? "View" : m === "tasks" || m === "attendance" ? "Edit" : "None", scope: m === "accounts" || m === "matters" || m === "reports" ? "Firm" : "Own" })) },
  { key: "runner", label: "Messenger / court runner", description: "Sees own court runs, tasks and clock-in only",
    build: () => role("Court runner", (m) => ({ level: ["tasks", "attendance"].includes(m) ? "Edit" : m === "calendar" ? "View" : "None", scope: "Own" })) },
] as const;

export const URGENCY_PRESETS = {
  simple: [
    { name: "Routine", days: 14, colour: "#bfd3c1" },
    { name: "Soon", days: 7, colour: "#f1d794" },
    { name: "Urgent", days: 2, colour: "#ebc7c0" },
  ],
  detailed: [
    { name: "Immediate attention", days: 0, colour: "#e2a397" },
    { name: "Extremely urgent", days: 1, colour: "#ebc7c0" },
    { name: "Urgent", days: 3, colour: "#f1d794" },
    { name: "Moderately urgent", days: 7, colour: "#c3d6e6" },
    { name: "Not too urgent", days: 14, colour: "#bfd3c1" },
  ],
} as const;

export const SA_PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"] as const;

/** South African public holidays, including Monday holidays when a holiday falls on a Sunday (Public Holidays Act). */
export const SA_PUBLIC_HOLIDAYS = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-03-21", name: "Human Rights Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Family Day" },
  { date: "2026-04-27", name: "Freedom Day" },
  { date: "2026-05-01", name: "Workers' Day" },
  { date: "2026-06-16", name: "Youth Day" },
  { date: "2026-08-09", name: "National Women's Day" },
  { date: "2026-08-10", name: "National Women's Day observed" },
  { date: "2026-09-24", name: "Heritage Day" },
  { date: "2026-12-16", name: "Day of Reconciliation" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Day of Goodwill" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-03-21", name: "Human Rights Day" },
  { date: "2027-03-22", name: "Human Rights Day observed" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-29", name: "Family Day" },
  { date: "2027-04-27", name: "Freedom Day" },
  { date: "2027-05-01", name: "Workers' Day" },
  { date: "2027-06-16", name: "Youth Day" },
  { date: "2027-08-09", name: "National Women's Day" },
  { date: "2027-09-24", name: "Heritage Day" },
  { date: "2027-12-16", name: "Day of Reconciliation" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "Day of Goodwill" },
  { date: "2027-12-27", name: "Day of Goodwill observed" },
];

export const DEFAULT_FOLDERS = ["Correspondence", "Pleadings", "Court orders", "Accounts and invoices", "Client documents and FICA", "Notes and reports"];

export type QuickSetupAnswers = {
  firm: { name: string; legalName: string; email: string; phone: string; address: string; website: string; brandColour: string };
  province: string;
  packs: string[];
  roles: string[];
  urgency: keyof typeof URGENCY_PRESETS;
  leave: { annualLeaveDays: number; sickLeaveDaysPerCycle: number; familyResponsibilityDays: number | null; carryOverDays: number };
  followUpAfterDays: number;
  folders: string[];
};

export function defaultAnswers(current: SetupConfig): QuickSetupAnswers {
  const profile = (current.firmProfile ?? {}) as Record<string, string>;
  const holidays = (current.countryHolidays ?? {}) as Record<string, string>;
  const leave = (current.leaveRules ?? {}) as Record<string, number | null>;
  const followUp = (current.followUpRules ?? {}) as Record<string, number>;
  const existingTypes = Array.isArray(current.matterTypes) ? (current.matterTypes as { name: string }[]).map((type) => type.name) : [];
  const roles = ((current.permissions as { roles?: { name: string }[] })?.roles ?? []).map((item) => item.name);
  const filing = (current.filingStructure ?? {}) as { folders?: string[] };
  return {
    firm: {
      name: profile.name ?? "", legalName: profile.legalName ?? "", email: profile.email ?? "", phone: profile.phone ?? "",
      address: profile.address ?? "", website: profile.website ?? "", brandColour: profile.brandColour || "#B8913F",
    },
    province: holidays.province ?? "",
    packs: PRACTICE_PACKS.filter((pack) => existingTypes.some((name) => name.toLowerCase() === pack.name.toLowerCase())).map((pack) => pack.key),
    roles: ROLE_PRESETS.filter((preset) => roles.includes(preset.build().name)).map((preset) => preset.key),
    urgency: Array.isArray(current.urgencyBands) && (current.urgencyBands as unknown[]).length > 3 ? "detailed" : "simple",
    leave: {
      annualLeaveDays: typeof leave.annualLeaveDays === "number" ? leave.annualLeaveDays : 15,
      sickLeaveDaysPerCycle: typeof leave.sickLeaveDaysPerCycle === "number" ? leave.sickLeaveDaysPerCycle : 30,
      familyResponsibilityDays: typeof leave.familyResponsibilityDays === "number" ? leave.familyResponsibilityDays : 3,
      carryOverDays: typeof leave.carryOverDays === "number" ? leave.carryOverDays : 5,
    },
    followUpAfterDays: typeof followUp.followUpAfterDays === "number" ? followUp.followUpAfterDays : 7,
    folders: filing.folders?.length ? filing.folders : DEFAULT_FOLDERS,
  };
}

/**
 * Builds a full draft from the owner's answers. Anything the wizard does not ask
 * about (portal, availability, minutes templates, HR checklist...) is kept as is.
 * Matter types and roles the owner did not pick are dropped only when nothing uses
 * them (pass `inUse`); without it they are all kept. Open matters and staff never
 * lose their type or role.
 */
export function applyQuickSetup(current: SetupConfig, answers: QuickSetupAnswers, inUse?: { matterTypes: string[]; roles: string[] }): SetupConfig {
  const typeInUse = (name: string) => !inUse || inUse.matterTypes.some((used) => used.toLowerCase() === name.toLowerCase());
  const roleInUse = (name: string) => !inUse || name === "Custom" || inUse.roles.some((used) => used.toLowerCase() === name.toLowerCase());
  const next = structuredClone(current) as Record<string, unknown>;
  const profile = (next.firmProfile ?? {}) as Record<string, unknown>;
  const firm = answers.firm;
  next.firmProfile = {
    ...profile,
    name: firm.name.trim(), legalName: firm.legalName.trim(), email: firm.email.trim(), phone: firm.phone.trim(),
    address: firm.address.trim(), website: firm.website.trim(), brandColour: firm.brandColour || "#B8913F",
  };

  const holidays = (next.countryHolidays ?? {}) as Record<string, unknown>;
  const existingHolidays = Array.isArray(holidays.publicHolidays) ? holidays.publicHolidays as { date: string; name: string }[] : [];
  const mergedHolidays = [...new Map([...SA_PUBLIC_HOLIDAYS, ...existingHolidays].map((item) => [item.date, item])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  next.countryHolidays = { ...holidays, country: "South Africa", province: answers.province, publicHolidays: mergedHolidays, courtRecesses: holidays.courtRecesses ?? [] };

  const chosenPacks = PRACTICE_PACKS.filter((pack) => answers.packs.includes(pack.key));
  const existingTypes = Array.isArray(next.matterTypes) ? next.matterTypes as { name: string }[] : [];
  const chosenNames = new Set(chosenPacks.map((pack) => pack.name.toLowerCase()));
  next.matterTypes = [
    ...existingTypes.filter((type) => !chosenNames.has(type.name.toLowerCase()) && typeInUse(type.name)),
    ...chosenPacks.map((pack) => {
      const previous = existingTypes.find((type) => type.name.toLowerCase() === pack.name.toLowerCase()) as Record<string, unknown> | undefined;
      // Keep any client-facing steps the firm already wrote for this type.
      // Keep the firm's own extra stages too, so open matters never lose their stage.
      const packNames = new Set(pack.stages.map((stage) => stage.name.toLowerCase()));
      const extra = (Array.isArray(previous?.stages) ? previous.stages as (Stage | string)[] : [])
        .map((stage) => typeof stage === "string" ? s(stage, stage.toLowerCase() === "closed" ? "C" : "A") : stage)
        .filter((stage) => !packNames.has(stage.name.toLowerCase()));
      const stages = structuredClone(pack.stages);
      const firstClosing = stages.findIndex((stage) => stage.kind === "C" || stage.kind === "X");
      stages.splice(firstClosing === -1 ? stages.length : firstClosing, 0, ...extra);
      return { ...(previous?.clientSteps ? { clientSteps: previous.clientSteps } : {}), name: pack.name, stages };
    }),
  ];

  const taskTypes = Array.isArray(next.taskTypes) ? next.taskTypes as { name: string; categories: string[] }[] : [];
  const work = taskTypes[0] ?? { name: "Work", categories: [] };
  const categories = [...new Set([...WIZARD_TASK_CATEGORIES, ...work.categories])];
  next.taskTypes = [{ ...work, categories }, ...taskTypes.slice(1)];

  next.urgencyBands = structuredClone(URGENCY_PRESETS[answers.urgency] ?? URGENCY_PRESETS.simple);
  next.followUpRules = { ...(next.followUpRules as object ?? {}), followUpAfterDays: answers.followUpAfterDays };

  const permissions = (next.permissions ?? { roles: [] }) as { roles: { name: string }[] };
  const picked = ROLE_PRESETS.filter((preset) => answers.roles.includes(preset.key)).map((preset) => preset.build());
  const pickedNames = new Set(picked.map((item) => item.name.toLowerCase()));
  next.permissions = { ...permissions, roles: [...permissions.roles.filter((item) => !pickedNames.has(item.name.toLowerCase()) && roleInUse(item.name)), ...picked] };

  const leave = (next.leaveRules ?? {}) as Record<string, unknown>;
  next.leaveRules = { ...leave, ...answers.leave };

  const filing = (next.filingStructure ?? {}) as Record<string, unknown>;
  const folders = answers.folders.map((folder) => folder.trim()).filter(Boolean);
  next.filingStructure = { ...filing, folders: folders.length ? [...new Set(folders)] : DEFAULT_FOLDERS };
  return next as SetupConfig;
}

export function parseAnswers(raw: string): QuickSetupAnswers {
  const data = JSON.parse(raw) as Partial<QuickSetupAnswers>;
  const firm = (data.firm ?? {}) as Partial<QuickSetupAnswers["firm"]>;
  const str = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
  const int = (value: unknown, fallback: number, max = 1000) => {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isInteger(number) && number >= 0 && number <= max ? number : fallback;
  };
  const leave = (data.leave ?? {}) as Partial<QuickSetupAnswers["leave"]>;
  return {
    firm: {
      name: str(firm.name, 120), legalName: str(firm.legalName, 254), email: str(firm.email, 254), phone: str(firm.phone, 254),
      address: str(firm.address, 500), website: str(firm.website, 2048), brandColour: /^#[0-9a-f]{6}$/i.test(String(firm.brandColour)) ? String(firm.brandColour) : "#B8913F",
    },
    province: SA_PROVINCES.includes(data.province as typeof SA_PROVINCES[number]) ? String(data.province) : "",
    packs: Array.isArray(data.packs) ? data.packs.filter((key) => PRACTICE_PACKS.some((pack) => pack.key === key)) : [],
    roles: Array.isArray(data.roles) ? data.roles.filter((key) => ROLE_PRESETS.some((preset) => preset.key === key)) : [],
    urgency: data.urgency === "detailed" ? "detailed" : "simple",
    leave: {
      annualLeaveDays: int(leave.annualLeaveDays, 15),
      sickLeaveDaysPerCycle: int(leave.sickLeaveDaysPerCycle, 30),
      familyResponsibilityDays: leave.familyResponsibilityDays === null ? null : int(leave.familyResponsibilityDays, 3),
      carryOverDays: int(leave.carryOverDays, 5),
    },
    followUpAfterDays: int(data.followUpAfterDays, 7, 365),
    folders: Array.isArray(data.folders) ? data.folders.map((folder) => str(folder, 120)).slice(0, 100) : DEFAULT_FOLDERS,
  };
}
