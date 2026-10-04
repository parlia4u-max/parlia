"use client";

import { useState, useTransition } from "react";
import { prepareClientEmailDraft, prepareInvitationDraft, sendClientEmail, type EmailDraft } from "@/app/actions/email-drafts";
import { ActionForm, SubmitButton } from "@/components/action-form";

function DraftLinks({ draft }: { draft: { to: string; subject: string; body: string } }) {
  const [copied, setCopied] = useState(false);
  const query = `subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const mailto = `mailto:${encodeURIComponent(draft.to)}?${query}`;
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(draft.to)}&${query}`;
  return (
    <div className="work-actions" role="status">
      <p>Ready to send to {draft.to}.</p>
      <a className="button-secondary" href={mailto}>Open in my email</a>
      <a className="button-secondary" href={outlook} target="_blank" rel="noopener noreferrer">Open in Outlook (new tab)</a>
      <button className="button-secondary" type="button" onClick={async () => {
        await navigator.clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
        setCopied(true);
      }}>{copied ? "Copied" : "Copy text"}</button>
    </div>
  );
}

export function InvitationEmailButtons({ matterId }: { matterId: string }) {
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button className="button-secondary" type="button" disabled={pending} onClick={() => start(async () => setDraft(await prepareInvitationDraft(matterId)))}>
        {pending ? "Please wait…" : "Prepare invitation to send from my own email"}
      </button>
      <p className="foundation-muted">This creates a new single-use link (earlier links stop working). Nothing is sent until you send it yourself.</p>
      {draft && "error" in draft ? <p className="foundation-error" role="alert">{draft.error}</p> : null}
      {draft && !("error" in draft) ? <DraftLinks draft={draft} /> : null}
    </div>
  );
}

export function ClientEmailForm({ matterId, defaultSubject = "" }: { matterId: string; defaultSubject?: string }) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="foundation-form">
      <p className="foundation-muted">Do not put sensitive matter details in an email unless the firm's policy allows it.</p>
      <label className="foundation-field"><span>Subject</span><input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="foundation-field"><span>Message</span><textarea value={body} maxLength={5000} onChange={(event) => setBody(event.target.value)} /></label>
      <ActionForm action={sendClientEmail}>
        <input type="hidden" name="matterId" value={matterId} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="body" value={body} />
        <SubmitButton>Send from Parlia</SubmitButton>
      </ActionForm>
      <button className="button-secondary" type="button" disabled={pending} onClick={() => start(async () => setDraft(await prepareClientEmailDraft(matterId, subject, body)))}>
        Prepare to send from my own email
      </button>
      {draft && "error" in draft ? <p className="foundation-error" role="alert">{draft.error}</p> : null}
      {draft && !("error" in draft) ? <DraftLinks draft={draft} /> : null}
    </div>
  );
}