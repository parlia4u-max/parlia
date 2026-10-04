import type { TrackerStep } from "@/lib/client-tracker";

export type TrackerUpdate = { id: string; title: string; body: string; sharedAt: Date | null; author: string };

export function ClientTracker({ steps, updates }: { steps: TrackerStep[]; updates: TrackerUpdate[] }) {
  const [latest, ...earlier] = updates;
  return (
    <section className="foundation-panel" aria-labelledby="tracker-heading">
      <h2 id="tracker-heading">Where is my matter?</h2>
      <ol className="client-tracker">
        {steps.map((step) => (
          <li key={step.name} className={`tracker-step tracker-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="tracker-dot" aria-hidden="true">{step.state === "done" ? "✓" : ""}</span>
            <div>
              <h3>
                {step.name}
                {step.state === "done" ? <span className="tracker-tag"> (completed)</span> : null}
                {step.state === "current" ? <span className="tracker-tag"> You are here</span> : null}
              </h3>
              <p>{step.explanation}</p>
              {step.estimate ? <p className="foundation-muted">Estimated around {new Date(`${step.estimate}T12:00:00`).toLocaleDateString()}. This is an estimate and may change.</p> : null}
              {step.state === "current" && latest ? (
                <blockquote className="tracker-note">
                  <strong>{latest.title}</strong>
                  <p>{latest.body}</p>
                  <small>{latest.sharedAt?.toLocaleDateString()} · {latest.author}</small>
                </blockquote>
              ) : null}
              {step.state === "current" && earlier.length ? (
                <details>
                  <summary>Earlier updates</summary>
                  {earlier.map((update) => (
                    <article key={update.id}><h4>{update.title}</h4><p>{update.body}</p><small>{update.sharedAt?.toLocaleDateString()} · {update.author}</small></article>
                  ))}
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
