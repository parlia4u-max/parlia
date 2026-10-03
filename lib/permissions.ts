export const MODULES = [
  "matters",
  "tasks",
  "calendar",
  "people",
  "reports",
  "settings",
  "accounts",
] as const;

export type ModuleKey = (typeof MODULES)[number];
export type PermissionLevel = "None" | "View" | "Edit";
export type PermissionScope = "Own" | "Team" | "Firm";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  matters: "Matters",
  tasks: "Tasks",
  calendar: "Calendar",
  people: "People",
  reports: "Reports",
  settings: "Settings",
  accounts: "Accounts",
};

export type PermissionBearingUser = {
  isOwner: boolean;
  role?: { permissions: { module: string; level: string; scope: string }[] } | null;
};

export function hasPermission(user: PermissionBearingUser, module: ModuleKey, level: PermissionLevel = "View") {
  if (!MODULES.includes(module)) return false;
  if (user.isOwner) return true;
  const permission = user.role?.permissions.find((item) => item.module === module);
  const requiredRank = level === "Edit" ? 2 : 1;
  const currentRank = permission?.level === "Edit" ? 2 : permission?.level === "View" ? 1 : 0;
  return currentRank >= requiredRank;
}

export function permissionScope(user: PermissionBearingUser, module: ModuleKey): PermissionScope {
  if (user.isOwner) return "Firm";
  const permission = user.role?.permissions.find((item) => item.module === module);
  if (!permission || !MODULES.includes(module)) return "Own";
  return permission.scope === "Team" || permission.scope === "Firm" ? permission.scope : "Own";
}
