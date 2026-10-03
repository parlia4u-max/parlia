import { sendSupportRequest } from "@/app/actions/support";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requireUser } from "@/lib/auth";

export default async function HelpCenterPage() {
  const user = await requireUser();

  return (
    <section className="foundation-page">
      <FoundationHeader title="Help Center" firm={user.firm.name} />
      <div className="foundation-panel">
        <h2>Contact Parlia support</h2>
        <p>Tell us what you need help with. Your message will be emailed to Parlia support, and we’ll reply to your account email.</p>
        <p>Please do not include client documents, passwords, or other confidential client information.</p>
        <ActionForm action={sendSupportRequest} className="foundation-form">
          <label className="foundation-field">
            <span>What do you need help with?</span>
            <select name="category" required defaultValue="">
              <option value="" disabled>Choose a topic</option>
              <option>Account access</option>
              <option>Using Parlia</option>
              <option>Something is not working</option>
              <option>Other</option>
            </select>
          </label>
          <label className="foundation-field">
            <span>Message</span>
            <textarea name="message" required maxLength={4000} rows={7} />
          </label>
          <SubmitButton>Send to support</SubmitButton>
        </ActionForm>
      </div>
    </section>
  );
}
