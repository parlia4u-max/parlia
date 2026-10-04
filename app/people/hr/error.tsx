"use client";

export default function HrError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="foundation-page"><h1>HR records are unavailable</h1><p className="foundation-muted">The secure staff view could not be loaded. Retry the request.</p><button className="button-secondary" onClick={reset}>Try again</button></section>;
}
