"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { FormAction } from "@/components/action-form";

type Section = { heading: string; body: string };

export function TeamSuggestionForm({ action }: { action: FormAction }) {
  const [heading, setHeading] = useState("");
  const [sections, setSections] = useState<Section[]>([{ heading: "", body: "" }]);
  return <ActionForm action={action} className="foundation-form">
    <label className="foundation-field"><span>Suggestion heading</span><input value={heading} onChange={(event) => setHeading(event.target.value)} maxLength={120} required /></label>
    <input type="hidden" name="suggestionData" value={JSON.stringify(sections)} />
    {sections.map((section, index) => <fieldset className="team-suggestion-section" key={`suggestion-section-${index}`}>
      <legend>Section {index + 1}</legend>
      <label className="foundation-field"><span>Section heading</span><input value={section.heading} onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, heading: event.target.value } : item))} maxLength={120} required /></label>
      <label className="foundation-field"><span>Details</span><textarea value={section.body} onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, body: event.target.value } : item))} maxLength={2000} rows={3} required /></label>
      {sections.length > 1 ? <button className="button-secondary" type="button" onClick={() => setSections((current) => current.filter((_, i) => i !== index))}>Remove section</button> : null}
    </fieldset>)}
    {sections.length < 8 ? <button className="button-secondary" type="button" onClick={() => setSections((current) => [...current, { heading: "", body: "" }])}>Add section</button> : null}
    <label className="team-checkbox"><input type="checkbox" name="anonymous" /> Submit anonymously</label>
    <SubmitButton>Submit suggestion</SubmitButton>
  </ActionForm>;
}