"use client";

export default function EquipmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="foundation-page"><h1>Equipment register unavailable</h1><p className="foundation-muted">Could not load equipment data. Retry the request.</p><button className="button-secondary" onClick={reset}>Try again</button></section>;
}
