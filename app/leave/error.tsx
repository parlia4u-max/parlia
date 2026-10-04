"use client";

export default function LeaveError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="foundation-page"><h1>Leave records are unavailable</h1><p className="foundation-muted">The leave view could not be loaded. Retry without changing any saved requests.</p><button className="button-secondary" onClick={reset}>Try again</button></section>;
}
