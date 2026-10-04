import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { decideLeave, returnFromLeave, submitLeave } from "@/app/actions/hr";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { configuredLeaveAllowance, leaveBalance, type LeaveKind, type LeavePolicy } from "@/lib/leave-rules";
import type { Prisma } from "@prisma/client";

type Search = { q?: string };
const LEAVE_TYPES: { id: LeaveKind; label: string }[] = [
  { id: "Annual", label: "Annual" },
  { id: "Sick", label: "Sick" },
  { id: "Study", label: "Study" },
  { id: "FamilyResponsibility", label: "Family responsibility" },
];
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

export default async function LeavePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("people");
  const { q: rawQuery } = await searchParams;
  const q = rawQuery?.trim().slice(0, 120) ?? "";
  const db = getDb();
  const [configuration, reports, coverPeople, profile] = await Promise.all([
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
    user.isOwner ? Promise.resolve([]) : db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } }),
    db.user.findMany({
      where: { firmId: user.firmId, active: true, id: { not: user.id } },
      include: { role: { include: { permissions: true } } },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.staffProfile.findFirst({ where: { firmId: user.firmId, userId: user.id }, select: { employmentStartDate: true } }),
  ]);
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, any> : {};
  const rules = (published.leaveRules ?? {}) as Partial<LeavePolicy> & { leaveForms?: { id: string; title: string }[] };
  const approvalReports = user.isOwner || permissionScope(user, "people") !== "Own" ? reports : [];
  const allowedApprovals = user.isOwner ? undefined : approvalReports.map((row) => row.userId);
  const eligibleCoverPeople = coverPeople.filter((person) => hasPermission(person, "tasks", "Edit"));
  const clauses: Prisma.LeaveRequestWhereInput[] = [];
  if (!user.isOwner) clauses.push({ OR: [{ requesterId: user.id }, ...(allowedApprovals?.length ? [{ requesterId: { in: allowedApprovals }, status: "Pending" as const }] : [])] });
  if (q) {
    const typeTerm = LEAVE_TYPES.find((type) => type.id.toLocaleLowerCase().includes(q.toLocaleLowerCase()))?.id;
    clauses.push({ OR: [
      ...(typeTerm ? [{ type: typeTerm }] : []),
      { requester: { name: { contains: q, mode: "insensitive" } } },
      { cover: { is: { name: { contains: q, mode: "insensitive" } } } },
    ] });
  }
  const requests = await db.leaveRequest.findMany({
    where: { firmId: user.firmId, AND: clauses },
    include: {
      requester: { select: { id: true, name: true } },
      cover: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      handovers: { select: { id: true } },
    },
    orderBy: [{ submittedAt: "desc" }],
    take: 300,
  });
  const balanceSource = await db.leaveRequest.findMany({
    where: { firmId: user.firmId, requesterId: user.id, status: { in: ["Pending", "Approved"] } },
    select: { type: true, requestedDays: true, startDate: true, status: true },
  });
  const balances = LEAVE_TYPES.map((type) => ({
    ...type,
    result: leaveBalance({ type: type.id, rules, employedAt: profile?.employmentStartDate ?? user.createdAt, requests: balanceSource as never, today: new Date() }),
  }));
  const canApprove = user.isOwner || hasPermission(user, "people", "Edit") && permissionScope(user, "people") !== "Own" && approvalReports.length > 0;
  const templates = rules.leaveForms?.length ? rules.leaveForms : [{ id: "A", title: "Leave request" }, { id: "B", title: "Leave request and approval" }, { id: "C", title: "Leave record" }];

  return (
    <section className="foundation-page">
      <FoundationHeader title="Leave and HR" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Leave balances follow this firm’s published setup rules, configured country holidays, workdays and carry-over policy. Allowances are firm policy, not legal advice; an unset leave type is unavailable.</p>
      <section className="foundation-panel">
        <h2>Your available leave</h2>
        <div className="setup-field-grid">
          {balances.map(({ id, label, result }) => <article className="todo-card" key={id}>
            <p className="eyebrow">{label}</p>
            <strong>{result.configured ? `${result.balance} day(s)` : "Not configured"}</strong>
            <p className="foundation-muted">{result.configured ? `${result.used} requested or approved · ${result.allowance} available this cycle` : "Owner must set and publish an allowance in Setup."}</p>
          </article>)}
        </div>
      </section>
      <section className="foundation-panel">
        <h2>Request leave</h2>
        <ActionForm action={submitLeave} className="foundation-form">
          <div className="setup-field-grid">
            <label className="foundation-field"><span>Leave type</span><select name="type" required defaultValue="">
              <option value="" disabled>Select leave type</option>
              {LEAVE_TYPES.map((type) => <option key={type.id} value={type.id} disabled={configuredLeaveAllowance(type.id, rules) === null}>{type.label}{configuredLeaveAllowance(type.id, rules) === null ? " — not configured" : ""}</option>)}
            </select></label>
            <label className="foundation-field"><span>Covering colleague</span><select name="coverId" required defaultValue=""><option value="" disabled>Select active colleague</option>            {eligibleCoverPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>Start date</span><input name="startDate" type="date" required /></label>
            <label className="foundation-field"><span>End date</span><input name="endDate" type="date" required /></label>
            <label className="foundation-field"><span>PDF form template</span><select name="formTemplate" defaultValue="A">{templates.map((template) => <option key={template.id} value={template.id}>Template {template.id} · {template.title}</option>)}</select></label>
          </div>
          <label className="foundation-field"><span>Reason</span><textarea name="reason" maxLength={500} required /></label>
          <SubmitButton>Submit leave request</SubmitButton>
        </ActionForm>
        <p className="foundation-muted">Sick, study and family-responsibility requests automatically create a private submit-proof task. Do not upload client documents here.</p>
      </section>
      <form action="/leave" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search leave requests</span><input name="q" defaultValue={q} maxLength={120} placeholder="Staff member or leave type" /></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <section aria-label="Leave requests" className="todo-list">
        {requests.length ? requests.map((request) => {
          const mayDecide = canApprove && request.requesterId !== user.id && request.status === "Pending" && (user.isOwner || approvalReports.some((row) => row.userId === request.requesterId));
          const mayReturn = request.status === "Approved" && !request.returnedAt && request.endDate < new Date(new Date().toISOString().slice(0, 10));
          return <article className="todo-card" key={request.id}>
            <div className="todo-card-heading"><div><p className="eyebrow">{request.type === "FamilyResponsibility" ? "Family responsibility" : request.type} · {request.status}</p><h2>{request.requesterId === user.id ? "Your request" : request.requester.name}</h2></div><span>{request.requestedDays} working day(s)</span></div>
            <p>{dateOnly(request.startDate)} – {dateOnly(request.endDate)} · Cover: {request.cover?.name ?? "Not set"}</p>
            {request.status === "Approved" ? <p><Link href={`/api/leave/${request.id}/pdf`}>Download approved leave form (PDF)</Link></p> : null}
            {request.returnedAt ? <p className="foundation-muted">Return recorded {request.returnedAt.toLocaleDateString()} · {request.handovers.length} task(s) handed over</p> : null}
            {mayDecide ? <details><summary>Review request</summary><ActionForm action={decideLeave} className="foundation-form">
              <input type="hidden" name="requestId" value={request.id} />
              <p>{request.reason}</p>
              <label className="foundation-field"><span>Decision note (optional)</span><textarea name="decisionNote" maxLength={500} /></label>
              <div className="action-button-row"><button className="button-primary" name="decision" value="approve">Approve and hand over open tasks</button><button className="button-secondary" name="decision" value="decline">Decline</button></div>
            </ActionForm></details> : null}
            {mayReturn && (user.isOwner || request.requesterId === user.id) ? <ActionForm action={returnFromLeave} className="foundation-form">
              <input type="hidden" name="requestId" value={request.id} />
              <p className="foundation-muted">Return from leave restores only task assignments still held by the named cover person.</p>
              <SubmitButton>Return from leave</SubmitButton>
            </ActionForm> : null}
            <details><summary>More request details</summary><p>{request.reason}</p><p>Submitted {request.submittedAt.toLocaleString()} · Approved by {request.approvedBy?.name ?? "—"} · PDF template {request.formTemplate}</p></details>
          </article>;
        }) : <section className="foundation-panel"><h2>No leave requests found</h2><p>{q ? "Try another search." : "Submit a request above to start the approval workflow."}</p></section>}
      </section>
    </section>
  );
}
