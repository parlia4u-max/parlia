"use client";

import { useState } from "react";
import { saveSetupDraft } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MODULES, MODULE_LABELS } from "@/lib/permissions";
import type { SetupSectionKey } from "@/lib/setup-config";

type SetupValue = Record<string, any>;
type Supervisor = { id: string; name: string; email: string };

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" ? value : 0;
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];

function TextField({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="foundation-field">
      <span>{label}</span>
      <input type={type} value={text(value)} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 10000,
}: {
  label: string;
  value: unknown;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="foundation-field">
      <span>{label}</span>
      <input type="number" min={0} max={max} step={1} value={number(value)} onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))} />
    </label>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button aria-label={label} className="button-secondary setup-remove-button" onClick={onClick} type="button">Remove</button>;
}

export function SetupSectionEditor({
  section,
  initialValue,
  supervisors,
}: {
  section: SetupSectionKey;
  initialValue: unknown;
  supervisors: Supervisor[];
}) {
  const [value, setValue] = useState<SetupValue>(initialValue ?? {});
  const setField = (key: string, next: unknown) => setValue((current) => Array.isArray(current) ? next : ({ ...current, [key]: next }));
  const updateRow = (key: string, index: number, row: SetupValue) => {
    const rows = [...list(Array.isArray(value) ? value : value[key])];
    rows[index] = row;
    setField(key, rows);
  };
  const removeRow = (key: string, index: number) => setField(key, list(Array.isArray(value) ? value : value[key]).filter((_, itemIndex) => itemIndex !== index));

  let fields;
  switch (section) {
    case "firmProfile":
      fields = (
        <>
          <TextField label="Firm name" value={value.name} maxLength={254} onChange={(next) => setField("name", next)} />
          <TextField label="Legal name" value={value.legalName} maxLength={254} onChange={(next) => setField("legalName", next)} />
          <TextField label="Contact email" type="email" value={value.email} maxLength={254} onChange={(next) => setField("email", next)} />
          <TextField label="Contact phone" type="tel" value={value.phone} maxLength={254} onChange={(next) => setField("phone", next)} />
          <label className="foundation-field"><span>Address</span><textarea maxLength={500} value={text(value.address)} onChange={(event) => setField("address", event.target.value)} /></label>
          <TextField label="Website (HTTPS)" type="url" value={value.website} maxLength={254} onChange={(next) => setField("website", next)} />
          <TextField label="Logo image URL (HTTPS only)" type="url" value={value.logoUrl} maxLength={2048} onChange={(next) => setField("logoUrl", next)} />
          <p className="foundation-muted">Use a public HTTPS image URL. File uploads and embedded image data are not accepted.</p>
        </>
      );
      break;
    case "countryHolidays":
      fields = (
        <>
          <div className="setup-field-grid">
            <TextField label="Country" value={value.country} maxLength={100} onChange={(next) => setField("country", next)} />
            <TextField label="Province" value={value.province} maxLength={100} onChange={(next) => setField("province", next)} />
          </div>
          <p className="foundation-muted">The seeded South African public holidays below are for 2026 only. Add or edit dates for other years as needed; no future years are inferred.</p>
          <div className="setup-list-editor">
            <h3>Public holidays</h3>
            {list(value.publicHolidays).map((row, index) => (
              <div className="setup-edit-row setup-holiday-row" key={`holiday-${index}`}>
                <TextField label={`Holiday ${index + 1} date`} type="date" value={row.date} onChange={(next) => updateRow("publicHolidays", index, { ...row, date: next })} />
                <TextField label={`Holiday ${index + 1} name`} value={row.name} maxLength={120} onChange={(next) => updateRow("publicHolidays", index, { ...row, name: next })} />
                <RemoveButton label={`Remove holiday ${index + 1}`} onClick={() => removeRow("publicHolidays", index)} />
              </div>
            ))}
            <button className="button-secondary" onClick={() => setField("publicHolidays", [...list(value.publicHolidays), { date: "", name: "" }])} type="button">Add public holiday</button>
          </div>
          <div className="setup-list-editor">
            <h3>Court recesses</h3>
            <p className="foundation-muted">Court recess dates vary by court and are not pre-filled. Add your firm’s confirmed dates.</p>
            {list(value.courtRecesses).map((row, index) => (
              <div className="setup-edit-row setup-holiday-row" key={`recess-${index}`}>
                <TextField label={`Recess ${index + 1} name`} value={row.name} maxLength={120} onChange={(next) => updateRow("courtRecesses", index, { ...row, name: next })} />
                <TextField label={`Recess ${index + 1} start`} type="date" value={row.start} onChange={(next) => updateRow("courtRecesses", index, { ...row, start: next })} />
                <TextField label={`Recess ${index + 1} end`} type="date" value={row.end} onChange={(next) => updateRow("courtRecesses", index, { ...row, end: next })} />
                <RemoveButton label={`Remove court recess ${index + 1}`} onClick={() => removeRow("courtRecesses", index)} />
              </div>
            ))}
            <button className="button-secondary" onClick={() => setField("courtRecesses", [...list(value.courtRecesses), { name: "", start: "", end: "" }])} type="button">Add court recess</button>
          </div>
        </>
      );
      break;
    case "matterTypes":
    case "taskTypes":
    case "minutesTemplates": {
      const isMatter = section === "matterTypes";
      const isTask = section === "taskTypes";
      const key = isMatter || isTask ? section : "minutesTemplates";
      const nested = isMatter ? "stages" : isTask ? "categories" : "sections";
      const label = isMatter ? "Matter types" : isTask ? "Task types" : "Minutes templates";
      fields = (
        <div className="setup-list-editor">
          <h3>{label}</h3>
          {list(value).map((row, index) => (
            <fieldset className="setup-edit-card" key={`${key}-${index}`}>
              <legend>{label.slice(0, -1)} {index + 1}</legend>
              <div className="setup-edit-row">
                <TextField label="Name" value={row.name} maxLength={120} onChange={(next) => updateRow(key, index, { ...row, name: next })} />
                <RemoveButton label={`Remove ${label.slice(0, -1).toLowerCase()} ${index + 1}`} onClick={() => removeRow(key, index)} />
              </div>
              <div className="setup-nested-list">
                <h4>{nested === "stages" ? "Stages" : nested === "categories" ? "Categories" : "Template sections"}</h4>
                {list(row[nested]).map((entry, childIndex) => (
                  <div className="setup-edit-row" key={`${nested}-${childIndex}`}>
                    <TextField label={`${nested.slice(0, -1)} ${childIndex + 1}`} value={entry} maxLength={120} onChange={(next) => {
                      const children = [...list(row[nested])];
                      children[childIndex] = next;
                      updateRow(key, index, { ...row, [nested]: children });
                    }} />
                    <RemoveButton label={`Remove ${nested.slice(0, -1)} ${childIndex + 1}`} onClick={() => updateRow(key, index, { ...row, [nested]: list(row[nested]).filter((_, child) => child !== childIndex) })} />
                  </div>
                ))}
                <button className="button-secondary" onClick={() => updateRow(key, index, { ...row, [nested]: [...list(row[nested]), ""] })} type="button">Add {nested.slice(0, -1)}</button>
              </div>
            </fieldset>
          ))}
          <button className="button-secondary" onClick={() => setField(key, [...list(value), { name: "", [nested]: [] }])} type="button">Add {label.slice(0, -1).toLowerCase()}</button>
        </div>
      );
      break;
    }
    case "urgencyBands":
      fields = (
        <div className="setup-list-editor">
          <h3>Urgency bands</h3>
          {list(value).map((row, index) => (
            <div className="setup-edit-card" key={`urgency-${index}`}>
              <div className="setup-field-grid">
                <TextField label={`Band ${index + 1} name`} value={row.name} maxLength={120} onChange={(next) => updateRow("urgencyBands", index, { ...row, name: next })} />
                <NumberField label="Due in (days)" value={row.days} max={3650} onChange={(next) => updateRow("urgencyBands", index, { ...row, days: next })} />
                <label className="foundation-field"><span>Colour</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(text(row.colour)) ? row.colour : "#808080"} onChange={(event) => updateRow("urgencyBands", index, { ...row, colour: event.target.value })} /></label>
                <RemoveButton label={`Remove urgency band ${index + 1}`} onClick={() => removeRow("urgencyBands", index)} />
              </div>
            </div>
          ))}
          <button className="button-secondary" onClick={() => setField("urgencyBands", [...list(value), { name: "", days: 0, colour: "#808080" }])} type="button">Add urgency band</button>
        </div>
      );
      break;
    case "followUpRules":
      fields = (
        <div className="setup-field-grid">
          <NumberField label="Follow up after (days)" value={value.followUpAfterDays} max={3650} onChange={(next) => setField("followUpAfterDays", next)} />
          <NumberField label="Start tracing after (days)" value={value.tracingAfterDays} max={3650} onChange={(next) => setField("tracingAfterDays", next)} />
          <NumberField label="Maximum tracing attempts" value={value.maxTracingAttempts} max={3650} onChange={(next) => setField("maxTracingAttempts", next)} />
        </div>
      );
      break;
    case "permissions":
      fields = (
        <div className="setup-list-editor">
          <p className="foundation-muted">These role templates publish to the firm’s existing role permission records. Owner access is immutable.</p>
          {list(value.roles).map((role, roleIndex) => (
            <fieldset className="setup-edit-card" key={`role-${roleIndex}`}>
              <legend>Role template {roleIndex + 1}</legend>
              <TextField label="Role name" value={role.name} maxLength={80} onChange={(next) => updateRow("roles", roleIndex, { ...role, name: next })} />
              {MODULES.map((module) => {
                const permission = role.permissions?.[module] ?? { level: "None", scope: "Own" };
                return (
                  <div className="foundation-permission-row" key={module}>
                    <strong>{MODULE_LABELS[module]}</strong>
                    <label className="foundation-field"><span>Access</span><select aria-label={`${role.name || `Role ${roleIndex + 1}`} ${MODULE_LABELS[module]} access`} value={permission.level} onChange={(event) => updateRow("roles", roleIndex, { ...role, permissions: { ...role.permissions, [module]: { ...permission, level: event.target.value } } })}><option>None</option><option>View</option><option>Edit</option></select></label>
                    <label className="foundation-field"><span>Scope</span><select aria-label={`${role.name || `Role ${roleIndex + 1}`} ${MODULE_LABELS[module]} scope`} value={permission.scope} onChange={(event) => updateRow("roles", roleIndex, { ...role, permissions: { ...role.permissions, [module]: { ...permission, scope: event.target.value } } })}><option>Own</option><option>Team</option><option>Firm</option></select></label>
                  </div>
                );
              })}
              <RemoveButton label={`Remove role template ${roleIndex + 1}`} onClick={() => removeRow("roles", roleIndex)} />
            </fieldset>
          ))}
          <button className="button-secondary" onClick={() => setField("roles", [...list(value.roles), { name: "", permissions: Object.fromEntries(MODULES.map((module) => [module, { level: "None", scope: "Own" }])) }])} type="button">Add role template</button>
        </div>
      );
      break;
    case "calendarVisibility":
      fields = (
        <div className="setup-list-editor">
          <h3>Calendar visibility by role</h3>
          {list(value.roles).map((row, index) => (
            <div className="setup-edit-row" key={`calendar-role-${index}`}>
              <TextField label={`Role ${index + 1}`} value={row.role} maxLength={80} onChange={(next) => updateRow("roles", index, { ...row, role: next })} />
              <label className="foundation-field"><span>Visibility</span><select value={row.visibility} onChange={(event) => updateRow("roles", index, { ...row, visibility: event.target.value })}><option>Own</option><option>Team</option><option>Firm</option></select></label>
              <RemoveButton label={`Remove calendar visibility for role ${index + 1}`} onClick={() => removeRow("roles", index)} />
            </div>
          ))}
          <button className="button-secondary" onClick={() => setField("roles", [...list(value.roles), { role: "", visibility: "Own" }])} type="button">Add role visibility</button>
        </div>
      );
      break;
    case "leaveRules":
      fields = (
        <>
          <div className="setup-field-grid">
            <NumberField label="Annual leave days" value={value.annualLeaveDays} max={1000} onChange={(next) => setField("annualLeaveDays", next)} />
            <NumberField label="Sick leave days per cycle" value={value.sickLeaveDaysPerCycle} max={1000} onChange={(next) => setField("sickLeaveDaysPerCycle", next)} />
            <NumberField label="Leave cycle length (months)" value={value.cycleMonths} max={1000} onChange={(next) => setField("cycleMonths", next)} />
            <NumberField label="Carry-over days" value={value.carryOverDays} max={1000} onChange={(next) => setField("carryOverDays", next)} />
          </div>
          <div className="setup-list-editor">
            <h3>Leave form fields</h3>
            {list(value.formFields).map((entry, index) => (
              <div className="setup-edit-row" key={`leave-field-${index}`}>
                <TextField label={`Form field ${index + 1}`} value={entry} maxLength={120} onChange={(next) => { const rows = [...list(value.formFields)]; rows[index] = next; setField("formFields", rows); }} />
                <RemoveButton label={`Remove leave form field ${index + 1}`} onClick={() => setField("formFields", list(value.formFields).filter((_, rowIndex) => rowIndex !== index))} />
              </div>
            ))}
            <button className="button-secondary" onClick={() => setField("formFields", [...list(value.formFields), ""])} type="button">Add leave form field</button>
          </div>
        </>
      );
      break;
    case "hrChecklist":
      fields = (
        <div className="setup-list-editor">
          <h3>Onboarding checklist</h3>
          {list(value).map((row, index) => (
            <div className="setup-edit-row" key={`hr-item-${index}`}>
              <TextField label={`Checklist item ${index + 1}`} value={row.name} maxLength={160} onChange={(next) => updateRow("hrChecklist", index, { ...row, name: next })} />
              <label className="setup-checkbox-field"><input type="checkbox" checked={Boolean(row.required)} onChange={(event) => updateRow("hrChecklist", index, { ...row, required: event.target.checked })} /><span>Required</span></label>
              <RemoveButton label={`Remove checklist item ${index + 1}`} onClick={() => removeRow("hrChecklist", index)} />
            </div>
          ))}
          <button className="button-secondary" onClick={() => setField("hrChecklist", [...list(value), { name: "", required: false }])} type="button">Add checklist item</button>
        </div>
      );
      break;
    case "filingStructure":
      fields = (
        <>
          <div className="setup-list-editor">
            <h3>Filing locations</h3>
            {list(value.locations).map((row, index) => (
              <div className="setup-edit-row" key={`location-${index}`}>
                <TextField label={`Location ${index + 1}`} value={row.name} maxLength={120} onChange={(next) => updateRow("locations", index, { ...row, name: next })} />
                <TextField label="Location code" value={row.code} maxLength={40} onChange={(next) => updateRow("locations", index, { ...row, code: next })} />
                <RemoveButton label={`Remove filing location ${index + 1}`} onClick={() => removeRow("locations", index)} />
              </div>
            ))}
            <button className="button-secondary" onClick={() => setField("locations", [...list(value.locations), { name: "", code: "" }])} type="button">Add filing location</button>
          </div>
          <div className="setup-list-editor">
            <h3>Folder structure</h3>
            {list(value.folders).map((folder, index) => (
              <div className="setup-edit-row" key={`folder-${index}`}>
                <TextField label={`Folder ${index + 1}`} value={folder} maxLength={120} onChange={(next) => { const rows = [...list(value.folders)]; rows[index] = next; setField("folders", rows); }} />
                <RemoveButton label={`Remove folder ${index + 1}`} onClick={() => setField("folders", list(value.folders).filter((_, rowIndex) => rowIndex !== index))} />
              </div>
            ))}
            <button className="button-secondary" onClick={() => setField("folders", [...list(value.folders), ""])} type="button">Add folder</button>
          </div>
        </>
      );
      break;
    case "integrations":
      fields = (
        <div className="setup-list-editor">
          <p className="foundation-muted">Connections are not implemented in Setup Centre. These switches record preferences only; they do not connect providers or imply a successful connection.</p>
          {[
            ["calendarSyncEnabled", "Calendar sync preference"],
            ["accountingEnabled", "Accounting integration preference"],
            ["emailSyncEnabled", "Email sync preference"],
          ].map(([key, label]) => (
            <label className="setup-integration-row" key={key}>
              <span><strong>{label}</strong><small>Connection status: Not connected</small></span>
              <input type="checkbox" checked={Boolean(value[key])} onChange={(event) => setField(key, event.target.checked)} />
            </label>
          ))}
        </div>
      );
      break;
    case "setupRights": {
      const grants = list(value.supervisors);
      const knownIds = new Set(supervisors.map((person) => person.id));
      const sections = [
        ["firmProfile", "Firm profile and branding"],
        ["countryHolidays", "Country, province and holidays"],
        ["matterTypes", "Matter types and stages"],
        ["taskTypes", "Task types and categories"],
        ["urgencyBands", "Urgency bands"],
        ["followUpRules", "Follow-up and tracing rules"],
        ["calendarVisibility", "Calendar visibility"],
        ["leaveRules", "Leave rules and forms"],
        ["minutesTemplates", "Minutes templates"],
        ["hrChecklist", "HR checklist and onboarding"],
        ["filingStructure", "Filing structure and locations"],
      ];
      fields = (
        <div className="setup-list-editor">
          <p className="foundation-muted">A supervisor must also have an active supervisor assignment. Granted rights permit drafting these sections only; owners alone can publish, edit permissions or change setup rights.</p>
          {grants.map((grant, index) => (
            <fieldset className="setup-edit-card" key={`supervisor-${index}`}>
              <legend>Supervisor grant {index + 1}</legend>
              <label className="foundation-field"><span>Supervisor</span>
                <select value={grant.userId} onChange={(event) => updateRow("supervisors", index, { ...grant, userId: event.target.value })}>
                  <option value="">Choose an assigned supervisor</option>
                  {!knownIds.has(grant.userId) && grant.userId ? <option value={grant.userId}>No longer active or assigned — remove this grant</option> : null}
                  {supervisors.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
                </select>
              </label>
              <div className="setup-rights-grid">
                {sections.map(([key, label]) => (
                  <label className="setup-checkbox-field" key={key}>
                    <input type="checkbox" checked={list(grant.sections).includes(key)} onChange={(event) => {
                      const selected = new Set(list(grant.sections));
                      if (event.target.checked) selected.add(key);
                      else selected.delete(key);
                      updateRow("supervisors", index, { ...grant, sections: [...selected] });
                    }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <RemoveButton label={`Remove supervisor grant ${index + 1}`} onClick={() => removeRow("supervisors", index)} />
            </fieldset>
          ))}
          <button className="button-secondary" disabled={!supervisors.some((person) => !grants.some((grant) => grant.userId === person.id))} onClick={() => {
            const available = supervisors.find((person) => !grants.some((grant) => grant.userId === person.id));
            if (available) setField("supervisors", [...grants, { userId: available.id, sections: [] }]);
          }} type="button">Add supervisor grant</button>
          {!supervisors.length ? <p>No assigned supervisors are available. Assign a supervisor from Staff before granting setup access.</p> : null}
        </div>
      );
      break;
    }
  }

  return (
    <ActionForm action={saveSetupDraft} className="foundation-form setup-editor-form">
      <input name="section" type="hidden" value={section} />
      <input name="value" type="hidden" value={JSON.stringify(value)} />
      {fields}
      <SubmitButton>Save draft</SubmitButton>
    </ActionForm>
  );
}
