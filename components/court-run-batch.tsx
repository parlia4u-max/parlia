"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signOutCourtRuns } from "@/app/actions/court-runs";

type Option = { id: string; label: string };
type Row = { key: number; dueAt: string; matterId: string; title: string; jurisdiction: string; location: string; reason: string; department: string; method: string; assignedToId: string };

const blank = (key: number, dueAt: string, previous?: Row): Row => ({
  key, dueAt: previous?.dueAt ?? dueAt, matterId: "", title: "", jurisdiction: previous?.jurisdiction ?? "", location: previous?.location ?? "",
  reason: "", department: previous?.department ?? "", method: previous?.method ?? "In person", assignedToId: previous?.assignedToId ?? "",
});

function Save({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <button className="button-primary" type="submit" disabled={pending}>{pending ? "Signing out…" : `Sign out ${count} court run${count === 1 ? "" : "s"}`}</button>;
}

/** Sign out several court runs in one go – each row copies the date, place and person from the row above. */
export function CourtRunBatch({ today, matters, people, departments, methods }: { today: string; matters: Option[]; people: Option[]; departments: readonly string[]; methods: readonly string[] }) {
  const [rows, setRows] = useState<Row[]>([blank(1, today)]);
  const [message, action] = useActionState(async (state: string | null, formData: FormData) => {
    const result = await signOutCourtRuns(state, formData);
    if (result?.startsWith("success:")) setRows([blank(Date.now(), today)]);
    return result;
  }, null);
  const set = (key: number, field: keyof Row, value: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const filled = rows.filter((row) => row.title.trim() || row.assignedToId).length;
  const success = message?.startsWith("success:") ?? false;

  return (
    <form action={action} className="court-run-batch">
      <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ key: _key, ...row }) => row))} />
      <div className="court-run-table-scroll"><table className="court-run-table court-run-batch-table">
        <thead><tr><th>Date</th><th>Ref nr</th><th>What must be done</th><th>Jurisdiction / court</th><th>Location</th><th>Reason</th><th>Department</th><th>Method</th><th>Assigned to</th><th aria-label="Remove row" /></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.key}>
          <td><input type="date" aria-label={`Row ${index + 1} date`} value={row.dueAt} onChange={(e) => set(row.key, "dueAt", e.target.value)} required /></td>
          <td><select aria-label={`Row ${index + 1} matter`} value={row.matterId} onChange={(e) => set(row.key, "matterId", e.target.value)}>
            <option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.label}</option>)}
          </select></td>
          <td><input aria-label={`Row ${index + 1} what must be done`} value={row.title} maxLength={240} placeholder="e.g. Issue summons" onChange={(e) => set(row.key, "title", e.target.value)} /></td>
          <td><input aria-label={`Row ${index + 1} jurisdiction`} value={row.jurisdiction} maxLength={160} placeholder="e.g. Pretoria Magistrate" onChange={(e) => set(row.key, "jurisdiction", e.target.value)} /></td>
          <td><input aria-label={`Row ${index + 1} location`} value={row.location} maxLength={160} placeholder="e.g. Room 12" onChange={(e) => set(row.key, "location", e.target.value)} /></td>
          <td><input aria-label={`Row ${index + 1} reason`} value={row.reason} maxLength={500} onChange={(e) => set(row.key, "reason", e.target.value)} /></td>
          <td><select aria-label={`Row ${index + 1} department`} value={row.department} onChange={(e) => set(row.key, "department", e.target.value)}><option value="">—</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></td>
          <td><select aria-label={`Row ${index + 1} method`} value={row.method} onChange={(e) => set(row.key, "method", e.target.value)}>{methods.map((name) => <option key={name}>{name}</option>)}</select></td>
          <td><select aria-label={`Row ${index + 1} assigned to`} value={row.assignedToId} onChange={(e) => set(row.key, "assignedToId", e.target.value)}><option value="">Choose…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></td>
          <td>{rows.length > 1 ? <button type="button" className="button-link" aria-label={`Remove row ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>✕</button> : null}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="court-run-batch-actions">
        <button type="button" className="button-secondary" disabled={rows.length >= 50} onClick={() => setRows((current) => [...current, blank(Date.now(), today, current[current.length - 1])])}>+ Add another row</button>
        <Save count={Math.max(filled, 1)} />
      </div>
      <p className="foundation-muted">New rows copy the date, court, department, method and person from the row above. Only you can change or remove these runs later.</p>
      {message ? <p className={success ? "foundation-notice" : "foundation-error"} role={success ? "status" : "alert"}>{success ? message.slice(8) : message}</p> : null}
    </form>
  );
}
