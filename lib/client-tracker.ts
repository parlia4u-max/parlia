export type ClientStep = { name: string; explanation: string; stages: string[] };
export type TrackerStep = { name: string; explanation: string; state: "done" | "current" | "upcoming"; estimate: string | null };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const CLOSING_KINDS = new Set(["C", "X"]);

// Default wording when the owner has not grouped stages yet: one step per open stage, and one closing step.
export function defaultClientSteps(stages: { name: string; kind: string }[]): ClientStep[] {
  const open = stages.filter((stage) => !CLOSING_KINDS.has(stage.kind));
  const closing = stages.filter((stage) => CLOSING_KINDS.has(stage.kind));
  const steps: ClientStep[] = open.map((stage) => ({
    name: stage.name,
    explanation: `We are working on the ${stage.name.toLowerCase()} part of your matter.`,
    stages: [stage.name],
  }));
  if (closing.length) steps.push({ name: "Finished", explanation: "Your matter is complete. We will confirm any final steps with you.", stages: closing.map((stage) => stage.name) });
  return steps;
}

export function clientStepsForType(matterType: unknown, stages: { name: string; kind: string }[]): ClientStep[] {
  const configured = record(matterType).clientSteps;
  if (Array.isArray(configured) && configured.length) {
    return configured.flatMap((raw): ClientStep[] => {
      const step = record(raw);
      if (typeof step.name !== "string" || !step.name.trim()) return [];
      return [{
        name: step.name.trim(),
        explanation: typeof step.explanation === "string" ? step.explanation : "",
        stages: Array.isArray(step.stages) ? step.stages.filter((item): item is string => typeof item === "string") : [],
      }];
    });
  }
  return defaultClientSteps(stages);
}

export function computeTracker(input: {
  steps: ClientStep[];
  currentStage: string;
  override?: string | null;
  estimates?: unknown;
  showEstimates?: boolean;
}): TrackerStep[] | null {
  const { steps } = input;
  if (!steps.length) return null;
  const overrideIndex = input.override ? steps.findIndex((step) => step.name === input.override) : -1;
  const stageIndex = steps.findIndex((step) => step.stages.includes(input.currentStage));
  const current = overrideIndex >= 0 ? overrideIndex : stageIndex;
  if (current < 0) return null;
  const estimates = record(input.estimates);
  return steps.map((step, index) => {
    const raw = estimates[step.name];
    return {
      name: step.name,
      explanation: step.explanation,
      state: index < current ? "done" : index === current ? "current" : "upcoming",
      estimate: input.showEstimates && typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && index >= current ? raw : null,
    };
  });
}

export function validateClientSteps(value: unknown, stageNames: string[], fail: (message: string) => never) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 20) fail("Client steps must be a list of no more than 20 steps.");
  const used = new Set<string>();
  const names = new Set<string>();
  for (const raw of value as unknown[]) {
    const step = record(raw);
    if (typeof step.name !== "string" || !step.name.trim() || step.name.length > 80) fail("Each client step needs a name of 80 characters or fewer.");
    if (typeof step.explanation !== "string" || !step.explanation.trim() || step.explanation.length > 300) fail("Each client step needs a one-sentence explanation of 300 characters or fewer.");
    if (names.has(String(step.name).trim().toLowerCase())) fail("Client step names must be unique.");
    names.add(String(step.name).trim().toLowerCase());
    if (!Array.isArray(step.stages) || !step.stages.length) fail(`Client step ${String(step.name)} must include at least one internal stage.`);
    for (const stage of step.stages as unknown[]) {
      if (typeof stage !== "string" || !stageNames.includes(stage)) fail(`Client step ${String(step.name)} refers to a stage that does not exist.`);
      if (used.has(stage as string)) fail(`Stage ${String(stage)} is in more than one client step.`);
      used.add(stage as string);
    }
  }
}
