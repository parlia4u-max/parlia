export type ReportScope = "Own" | "Team" | "Firm";

export function narrowerReportScope(reportScope: ReportScope, matterScope: ReportScope): ReportScope {
  const rank: Record<ReportScope, number> = { Own: 0, Team: 1, Firm: 2 };
  return rank[reportScope] <= rank[matterScope] ? reportScope : matterScope;
}

export function quietMatterCutoff(now: Date, days: number) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

export function reportCsvField(value: string | number | Date | null | undefined) {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
