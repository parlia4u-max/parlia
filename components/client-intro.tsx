import { markIntroSeen } from "@/app/actions/client-portal";

export const TOUR_STEPS = [
  { title: "1. Log in", body: "Use your email and password, or ask for a sign-in code. Only you can see your matters." },
  { title: "2. Where is my matter?", body: "Open a matter to see a simple line showing the steps and where you are now." },
  { title: "3. Upload documents", body: "Share a secure link to a document in your own storage. The firm will review it." },
  { title: "4. Join a meeting", body: "When a meeting is booked, the details appear on your matter page." },
];

export function ClientTour({ videoUrl }: { videoUrl: string }) {
  return (
    <>
      {videoUrl ? <p><a className="button-secondary link-button" href={videoUrl} target="_blank" rel="noopener noreferrer">Watch the short intro video (opens in a new tab)</a></p> : null}
      <ol className="foundation-form">
        {TOUR_STEPS.map((step) => <li key={step.title}><h3>{step.title}</h3><p>{step.body}</p></li>)}
      </ol>
    </>
  );
}

export function ClientIntro({ videoUrl }: { videoUrl: string }) {
  return (
    <section className="foundation-panel" aria-labelledby="intro-heading">
      <h2 id="intro-heading">Welcome. Here is how this portal works</h2>
      <ClientTour videoUrl={videoUrl} />
      <form action={markIntroSeen}><button type="submit">Got it, take me to my matters</button></form>
    </section>
  );
}