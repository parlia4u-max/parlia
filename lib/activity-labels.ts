// Turns audit-log actions into short, readable lines for the dashboard "Recent changes" feed (like Staff Hub's activity list).

type Details = Record<string, unknown> | null;
export type ActivityLine = { text: string; href: string | null; group: "Matters" | "Tasks" | "Court runs" | "Calendar" | "People" | "Money" | "Clients" | "Set-up" };

const LABELS: Record<string, [string, ActivityLine["group"], string | null]> = {
  "matter.created": ["opened a matter", "Matters", "/matters"],
  "matter.imported": ["imported matters", "Matters", "/matters"],
  "matter.status_changed": ["changed a matter's status", "Matters", "/matters"],
  "matter.stage_changed": ["moved a matter to a new stage", "Matters", "/matters"],
  "matter.note_added": ["added a matter note", "Matters", "/matters"],
  "matter.document_reference_added": ["added a document to a matter", "Matters", "/matters"],
  "matter.client_email_sent": ["emailed a client", "Matters", "/matters"],
  "task.created": ["added a task", "Tasks", "/tasks"],
  "task.completed": ["completed a task", "Tasks", "/tasks"],
  "task.nudged": ["sent a task reminder", "Tasks", "/tasks"],
  "court_run.created": ["signed out a court run", "Court runs", "/duties?tab=all"],
  "court_run.changed": ["changed a court run", "Court runs", "/duties?tab=all"],
  "court_run.removed": ["removed a court run", "Court runs", "/duties?tab=all"],
  "court_run.updated": ["gave a court run update", "Court runs", "/duties?tab=all"],
  "court_run.completed": ["ticked off a court run", "Court runs", "/duties?tab=all"],
  "court_run.returned": ["confirmed court run documents are back", "Court runs", "/duties?tab=all"],
  "physical_file.created": ["recorded a physical file", "Matters", "/physical-files"],
  "calendar.created": ["created a shared calendar", "Calendar", "/calendar"],
  "calendar.updated": ["changed a shared calendar", "Calendar", "/calendar"],
  "calendar.deleted": ["deleted a shared calendar", "Calendar", "/calendar"],
  "calendar.event.created": ["added a calendar event", "Calendar", "/calendar"],
  "calendar.event.updated": ["changed a calendar event", "Calendar", "/calendar"],
  "calendar.event.deleted": ["deleted a calendar event", "Calendar", "/calendar"],
  "leave.request.submitted": ["applied for leave", "People", "/leave"],
  "leave.returned": ["returned from leave", "People", "/leave"],
  "invitation.accepted": ["joined the firm", "People", "/staff"],
  "team.meeting.created": ["scheduled a team meeting", "People", "/team/meetings"],
  "team.message.created": ["posted a team message", "People", "/team"],
  "team.suggestion.submitted": ["made a suggestion", "People", "/team"],
  "hr.equipment.assigned": ["assigned equipment", "People", "/people"],
  "hr.equipment.returned": ["recorded returned equipment", "People", "/people"],
  "invoice.drafted": ["drafted an invoice", "Money", null],
  "invoice.published": ["issued an invoice", "Money", null],
  "invoice.credit_note_issued": ["issued a credit note", "Money", null],
  "invoice.proof_submitted": ["received proof of payment", "Money", null],
  "client_portal.account_activated": ["activated a client portal account", "Clients", null],
  "client_portal.consultation_requested": ["(client) requested a consultation", "Clients", null],
  "client_portal.meeting_booked": ["(client) booked a meeting", "Clients", null],
  "client_portal.document_reference_submitted": ["(client) sent a document", "Clients", null],
  "setup.published": ["published firm set-up changes", "Set-up", "/settings"],
  "setup.guided_saved": ["saved the guided set-up", "Set-up", "/setup/start"],
};

/** Actions worth showing on the dashboard. Sign-in codes, downloads and failures stay in the audit log only. */
export const FEED_ACTIONS = Object.keys(LABELS);

export function describeActivity(action: string, details: Details): ActivityLine | null {
  const label = LABELS[action];
  if (!label) return null;
  const title = details && typeof details.title === "string" ? details.title : details && typeof details.name === "string" ? details.name : "";
  return { text: title ? `${label[0]}: ${title.slice(0, 80)}` : label[0], group: label[1], href: label[2] };
}

export function timeAgo(date: Date, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
