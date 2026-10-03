import { TASK_CATEGORIES, type SetupConfig } from "@/lib/setup-config";

export type StageTaskDefinition = { title: string; category: string; dueInDays?: number };
export type MatterStageDefinition = { name: string; kind: "A" | "W" | "C" | "X"; tasks: StageTaskDefinition[] };
export type MatterTypeDefinition = { name: string; stages: MatterStageDefinition[] };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function matterTypesFromConfig(published: unknown): MatterTypeDefinition[] {
  const setup = record(published);
  const configuredTypes = setup.matterTypes;
  if (!Array.isArray(configuredTypes)) return [];
  return configuredTypes.flatMap((rawType): MatterTypeDefinition[] => {
    const matterType = record(rawType);
    if (typeof matterType.name !== "string" || !matterType.name.trim() || !Array.isArray(matterType.stages)) return [];
    const stages = matterType.stages.flatMap((rawStage): MatterStageDefinition[] => {
      const stage = typeof rawStage === "string" ? { name: rawStage, kind: rawStage.toLowerCase() === "closed" ? "C" : "A" } : record(rawStage);
      if (typeof stage.name !== "string" || !stage.name.trim()) return [];
      const kind = ["A", "W", "C", "X"].includes(String(stage.kind)) ? stage.kind as MatterStageDefinition["kind"] : "A";
      const tasks = Array.isArray(stage.tasks) ? stage.tasks.flatMap((rawTask): StageTaskDefinition[] => {
        const task = record(rawTask);
        if (typeof task.title !== "string" || !task.title.trim() || typeof task.category !== "string" || !TASK_CATEGORIES.includes(task.category as typeof TASK_CATEGORIES[number])) return [];
        return [{ title: task.title.trim(), category: task.category, ...(Number.isInteger(task.dueInDays) && Number(task.dueInDays) >= 0 ? { dueInDays: Number(task.dueInDays) } : {}) }];
      }) : [];
      return [{ name: stage.name.trim(), kind, tasks }];
    });
    return [{ name: matterType.name.trim(), stages }];
  });
}

export function taskCategoriesFromConfig(published: unknown) {
  const taskTypes = record(published).taskTypes;
  if (!Array.isArray(taskTypes)) return [...TASK_CATEGORIES];
  const categories = taskTypes.flatMap((rawType) => {
    const taskType = record(rawType);
    return Array.isArray(taskType.categories) ? taskType.categories : [];
  }).filter((category): category is typeof TASK_CATEGORIES[number] =>
    typeof category === "string" && TASK_CATEGORIES.includes(category as typeof TASK_CATEGORIES[number]));
  return [...new Set(categories)];
}

export function setupSectionFromConfig(published: unknown, key: string) {
  return record(published)[key] as unknown;
}

export function addCalendarDays(from: Date, days: number) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
}
