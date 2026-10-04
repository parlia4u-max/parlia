"use client";

export default function TeamError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="foundation-page" role="alert">
      <section className="foundation-panel">
        <h1>Team workspace unavailable</h1>
        <p>We could not load this team page. Your access and firm data have not been changed.</p>
        <button className="button-primary" onClick={reset} type="button">Try again</button>
      </section>
    </section>
  );
}
