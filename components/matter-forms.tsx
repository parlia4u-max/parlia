"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { FormAction } from "@/components/action-form";
import type { MatterTypeDefinition } from "@/lib/matter-config";
import type { TASK_CATEGORIES } from "@/lib/setup-config";

export type ActivePerson = { id: string; name: string; email: string };

export function NewMatterForm({
  action,
  matterTypes,
  people,
}: {
  action: FormAction;
  matterTypes: MatterTypeDefinition[];
  people: ActivePerson[];
}) {
  const [matterType, setMatterType] = useState(matterTypes[0]?.name ?? "");
  const stages = matterTypes.find((type) => type.name === matterType)?.stages ?? [];
  return (
    <ActionForm action={action} className="foundation-form">
      <div className="matter-form-grid">
        <label className="foundation-field"><span>Matter number</span><input name="matterNumber" maxLength={80} required /></label>
        <label className="foundation-field"><span>Client first name</span><input name="clientName" maxLength={120} required /></label>
        <label className="foundation-field"><span>Client surname</span><input name="clientSurname" maxLength={120} required /></label>
        <label className="foundation-field"><span>Matter type</span><select name="matterType" value={matterType} onChange={(event) => setMatterType(event.target.value)} required>{matterTypes.map((type) => <option key={type.name}>{type.name}</option>)}</select></label>
        <label className="foundation-field"><span>Stage</span><select name="stage" required>{stages.map((stage) => <option key={stage.name} value={stage.name}>{stage.name}</option>)}</select></label>
        <label className="foundation-field"><span>Responsible person</span><select name="responsibleId" required>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </div>
      <details className="matter-more-fields">
        <summary>More matter details</summary>
        <div className="matter-form-grid">
          <label className="foundation-field"><span>Client email</span><input name="clientEmail" type="email" maxLength={254} /></label>
          <label className="foundation-field"><span>Client number</span><input name="clientNumber" maxLength={120} /></label>
          <label className="foundation-field"><span>Case number</span><input name="caseNumber" maxLength={120} /></label>
          <label className="foundation-field"><span>Other references</span><input name="otherReferences" maxLength={500} /></label>
        </div>
      </details>
      <SubmitButton>Create matter</SubmitButton>
    </ActionForm>
  );
}

export function TaskCompleteForm({ action, taskId }: { action: FormAction; taskId: string }) {
  return (
    <ActionForm action={action} className="task-complete-form">
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton className="task-complete-button">Complete task <span aria-hidden="true" className="owl-tick">🦉✓</span></SubmitButton>
    </ActionForm>
  );
}

export function MatterStageForm({
  action,
  matterId,
  stages,
  currentStage,
}: {
  action: FormAction;
  matterId: string;
  stages: MatterTypeDefinition["stages"];
  currentStage: string;
}) {
  return (
    <ActionForm action={action} className="foundation-inline-form matter-stage-form">
      <input type="hidden" name="matterId" value={matterId} />
      <label className="foundation-field"><span>Move to stage</span><select name="stage" defaultValue={currentStage}>{stages.map((stage) => <option key={stage.name} value={stage.name}>{stage.name} ({stage.kind})</option>)}</select></label>
      <SubmitButton>Change stage</SubmitButton>
    </ActionForm>
  );
}

export function MatterFieldForm({
  action,
  matterId,
  children,
  className = "foundation-form",
}: {
  action: FormAction;
  matterId: string;
  children: ReactNode;
  className?: string;
}) {
  return <ActionForm action={action} className={className}><input type="hidden" name="matterId" value={matterId} />{children}<SubmitButton>Save</SubmitButton></ActionForm>;
}

export function TaskCategories({ categories }: { categories: typeof TASK_CATEGORIES[number][] }) {
  return <label className="foundation-field"><span>Category</span><select name="category" required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>;
}
