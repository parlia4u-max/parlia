import { bookClientMeeting, cancelClientMeeting } from "@/app/actions/client-booking";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatSlot } from "@/lib/availability";

type Meeting = { id: string; title: string; startAt: Date; meetingUrl: string | null; cancellable: boolean };

export function ClientBooking({ matterId, enabled, slots, meetings }: { matterId: string; enabled: boolean; slots: string[]; meetings: Meeting[] }) {
  if (!enabled && !meetings.length) return null;
  return (
    <section className="foundation-panel">
      <h2>Meetings</h2>
      {meetings.length ? (
        <ul className="todo-list">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <strong>{formatSlot(meeting.startAt)}</strong> (South African time)
              {meeting.meetingUrl ? <> &middot; <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">Join the meeting (opens in a new tab)</a></> : null}
              {meeting.cancellable ? (
                <ActionForm action={cancelClientMeeting}>
                  <input type="hidden" name="eventId" value={meeting.id} />
                  <SubmitButton className="button-secondary">Cancel this meeting</SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p>You have no upcoming meetings.</p>}
      {enabled ? (
        slots.length ? (
          <ActionForm action={bookClientMeeting} className="foundation-form">
            <input type="hidden" name="matterId" value={matterId} />
            <label className="foundation-field">
              <span>Book a meeting with the firm</span>
              <select name="slot" required defaultValue="">
                <option value="" disabled>Choose a time</option>
                {slots.map((slot) => <option key={slot} value={slot}>{formatSlot(new Date(slot))}</option>)}
              </select>
            </label>
            <SubmitButton>Book this time</SubmitButton>
          </ActionForm>
        ) : <p>There are no free times right now. Please contact the firm.</p>
      ) : null}
    </section>
  );
}