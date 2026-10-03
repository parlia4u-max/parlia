"use client";

import { useState } from "react";

export function ModuleELoading({ title }: { title: string }) {
  return <section className="foundation-page" aria-busy="true"><p className="foundation-muted" role="status">Loading {title}…</p></section>;
}

export function ModuleEError({ reset }: { reset: () => void }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <section className="foundation-page" role="alert">
      <h1>We couldn’t load this page</h1>
      <p className="foundation-error">Your records have not been changed. Try again, or return to the page later.</p>
      <button className="button-primary" type="button" disabled={retrying} onClick={() => { setRetrying(true); reset(); }}>
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </section>
  );
}
