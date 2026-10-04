import { markConsultationHandled } from "@/app/actions/consultations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { getDb } from "@/lib/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function ConsultationRequestsPanel({ firmId, canHandle }: { firmId: string; canHandle: boolean }) {
  const requests = await getDb().consultationRequest.findMany({
    where: { firmId, status: "New" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  if (!requests.length) return null;
  return (
    <section className="foundation-panel">
      <h2>Consultation requests</h2>
      <p className="foundation-muted">People who asked for a consultation from your portal page. They have no portal access.</p>
      {requests.map((request) => (
        <article className="dashboard-task" key={request.id}>
          <div>
            <strong>{request.name}</strong>
            <p>{request.contact}</p>
            <p>{request.description}</p>
            <small>Received {request.createdAt.toISOString().slice(0, 10)}</small>
          </div>
          {EMAIL.test(request.contact.trim()) ? (
            <p className="work-actions">
              <a className="button-secondary" href={`mailto:${encodeURIComponent(request.contact.trim())}?subject=${encodeURIComponent("Your consultation request")}`}>Reply in my email</a>
              <a className="button-secondary" href={`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(request.contact.trim())}&subject=${encodeURIComponent("Your consultation request")}`} target="_blank" rel="noopener noreferrer">Reply in Outlook (new tab)</a>
            </p>
          ) : null}
          {canHandle ? (
            <ActionForm action={markConsultationHandled}>
              <input type="hidden" name="id" value={request.id} />
              <SubmitButton className="button-secondary">Mark as handled</SubmitButton>
            </ActionForm>
          ) : null}
        </article>
      ))}
    </section>
  );
}
