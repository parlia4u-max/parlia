"use client";

export default function VaultError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="foundation-page"><h1>Password vault unavailable</h1><p className="foundation-muted">The encrypted vault could not be loaded. Retry the request.</p><button className="button-secondary" onClick={reset}>Try again</button></section>;
}
