import type { PermissionScope } from "@/lib/permissions";

export type CsvMatterRow = {
  line: number;
  matterNumber: string;
  clientName: string;
  clientSurname: string;
  clientEmail: string;
  matterType: string;
  stage: string;
  responsibleEmail: string;
  clientNumber: string;
  otherReferences: string;
  caseNumber: string;
};

export type CsvMatterResult = { line: number; value?: CsvMatterRow; error?: string };

const requiredCsvHeaders = [
  "matternumber",
  "clientname",
  "clientsurname",
  "mattertype",
  "stage",
  "responsibleemail",
];

export function parseMatterCsv(input: string): CsvMatterResult[] {
  const rows: string[][] = [];
  const rowLines: number[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteClosed = false;
  let line = 1;
  let rowLine = 1;
  for (let index = input.charCodeAt(0) === 0xfeff ? 1 : 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += char;
        if (char === "\n") line += 1;
        else if (char === "\r" && input[index + 1] !== "\n") line += 1;
      }
    } else if (quoteClosed && char !== "," && char !== "\n" && char !== "\r") {
      return [{ line: rowLine, error: "Unexpected content after a quoted CSV field." }];
    } else if (char === '"') {
      if (cell.length !== 0) return [{ line: rowLine, error: "A quoted CSV field must begin with a quote at the start of its column." }];
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
      quoteClosed = false;
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      if (row.some((part) => part.trim() !== "")) {
        rows.push(row);
        rowLines.push(rowLine);
      }
      row = [];
      cell = "";
      quoteClosed = false;
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (quoted) return [{ line: rowLine, error: "CSV contains an unclosed quoted field." }];
  row.push(cell);
  if (row.some((part) => part.trim() !== "")) {
    rows.push(row);
    rowLines.push(rowLine);
  }
  if (rows.length === 0) return [{ line: 1, error: "CSV file is empty." }];

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const columnIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header && !columnIndexes.has(header)) columnIndexes.set(header, index);
  });
  const missing = requiredCsvHeaders.filter((header) => !columnIndexes.has(header));
  if (missing.length) return [{ line: 1, error: `Missing required CSV column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.` }];

  return rows.slice(1).map((cells, index): CsvMatterResult => {
    const sourceLine = rowLines[index + 1];
    if (cells.length !== headers.length) return { line: sourceLine, error: `Expected ${headers.length} columns but found ${cells.length}.` };
    const field = (name: string) => {
      const column = columnIndexes.get(name);
      return column === undefined ? "" : cells[column].trim();
    };
    const value: CsvMatterRow = {
      line: sourceLine,
      matterNumber: field("matternumber"),
      clientName: field("clientname"),
      clientSurname: field("clientsurname"),
      clientEmail: field("clientemail"),
      matterType: field("mattertype"),
      stage: field("stage"),
      responsibleEmail: field("responsibleemail").toLowerCase(),
      clientNumber: field("clientnumber"),
      otherReferences: field("otherreferences"),
      caseNumber: field("casenumber"),
    };
    for (const [key, label] of [["matterNumber", "matter number"], ["clientName", "client name"], ["clientSurname", "client surname"], ["matterType", "matter type"], ["stage", "stage"], ["responsibleEmail", "responsible person email"]] as const) {
      if (!value[key]) return { line: sourceLine, error: `${label} is required.` };
    }
    if (value.matterNumber.length > 80 || value.clientName.length > 120 || value.clientSurname.length > 120 ||
      value.clientEmail.length > 254 || value.matterType.length > 120 || value.stage.length > 120 ||
      value.responsibleEmail.length > 254 || value.clientNumber.length > 120 ||
      value.otherReferences.length > 500 || value.caseNumber.length > 120) {
      return { line: sourceLine, error: "One or more fields exceed the permitted length." };
    }
    if (value.clientEmail && !isEmail(value.clientEmail)) return { line: sourceLine, error: "Client email is not valid." };
    if (!isEmail(value.responsibleEmail)) return { line: sourceLine, error: "Responsible person email is not valid." };
    return { line: sourceLine, value };
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function canAccessRecord({
  userId,
  owner,
  scope,
  assignedUserId,
  directReportIds = [],
}: {
  userId: string;
  owner: boolean;
  scope: PermissionScope;
  assignedUserId: string;
  directReportIds?: string[];
}) {
  if (owner || scope === "Firm") return true;
  if (assignedUserId === userId) return true;
  return scope === "Team" && directReportIds.includes(assignedUserId);
}

export function canAccessTask({
  userId,
  owner,
  scope,
  assignedUserId,
  directReportIds = [],
}: {
  userId: string;
  owner: boolean;
  scope: PermissionScope;
  assignedUserId: string;
  directReportIds?: string[];
}) {
  return owner || scope === "Firm" || assignedUserId === userId || directReportIds.includes(assignedUserId);
}

export type UrgencyBand = { name: string; days: number; colour: string };
export type TaskUrgency = { label: string; colour: string; daysUntilDue: number | null };

export function taskUrgency(dueAt: Date | null, bands: UrgencyBand[], now = new Date()): TaskUrgency {
  if (!dueAt) return { label: "No due date", colour: "#808080", daysUntilDue: null };
  const daysUntilDue = Math.ceil((dateOnly(dueAt).getTime() - dateOnly(now).getTime()) / 86_400_000);
  const ordered = [...bands].filter((band) => Number.isFinite(band.days) && band.days >= 0).sort((a, b) => a.days - b.days);
  const matching = ordered.find((band) => daysUntilDue <= band.days) ?? ordered.at(-1);
  if (daysUntilDue < 0) return { label: "Overdue", colour: ordered[0]?.colour ?? "#b42318", daysUntilDue };
  return { label: matching?.name ?? "Due soon", colour: matching?.colour ?? "#808080", daysUntilDue };
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function accessScopeFilter<T extends { responsibleId?: string; assignedToId?: string }>(
  userId: string,
  scope: PermissionScope,
  directReportIds: string[],
  key: "responsibleId" | "assignedToId",
): Partial<Record<typeof key, string | { in: string[] }>> {
  if (scope === "Firm") return {};
  const allowedIds = scope === "Team" ? [userId, ...directReportIds] : [userId];
  return { [key]: allowedIds.length === 1 ? userId : { in: allowedIds } };
}
