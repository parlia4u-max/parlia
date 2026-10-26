"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { saveQuickSetup } from "@/app/actions/quick-setup";
import type { QuickSetupAnswers } from "@/lib/setup-presets";

type Pack = { key: string; name: string; summary: string; stages: { name: string; kind: string }[] };
type Option = { key: string; label: string; description?: string; packs?: readonly string[] };
type Band = { name: string; days: number; colour: string };

const STEPS = ["Your firm", "Your work", "Your team", "Office rules", "Review"] as const;

export function QuickSetupWizard({ initial, packs, firmTypes, roles, urgency, provinces, published }: {
  initial: QuickSetupAnswers;
  packs: Pack[];
  firmTypes: Option[];
  roles: Option[];
  urgency: Record<"simple" | "detailed", Band[]>;
  provinces: readonly string[];
  published: boolean;
}) {
  const [answers, setAnswers] = useState<QuickSetupAnswers>({ ...initial, roles: initial.roles.length ? initial.roles : roles.map((role) => role.key) });
  const [step, setStep] = useState(0);
  const [openPack, setOpenPack] = useState<string | null>(null);
  const [result, formAction] = useActionState(saveQuickSetup, null);
  const set = <K extends keyof QuickSetupAnswers>(key: K, value: QuickSetupAnswers[K]) => setAnswers((current) => ({ ...current, [key]: value }));
  const setFirm = (key: keyof QuickSetupAnswers["firm"], value: string) => setAnswers((current) => ({ ...current, firm: { ...current.firm, [key]: value } }));
  const toggle = (key: "packs" | "roles", value: string) => setAnswers((current) => ({
    ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));
  const canContinue = step === 0 ? Boolean(answers.firm.name.trim()) : step === 1 ? answers.packs.length > 0 : true;

  if (result === "success:published") {
    return (
      <section className="foundation-panel wizard-done">
        <p className="eyebrow">ALL SET</p>
        <h2>{answers.firm.name} is ready to use</h2>
        <p>Your matter types, stages, automatic tasks, roles and office rules are now live. Here is what most firms do next:</p>
        <div className="wizard-next">
          <Link href="/staff"><strong>Invite your team</strong><span>Add each person with their role</span></Link>
          <Link href="/matters/import"><strong>Bring in your matters</strong><span>Upload a spreadsheet of existing matters</span></Link>
          <Link href="/matters/new"><strong>Open a new matter</strong><span>Tasks are created for you at each stage</span></Link>
          <Link href="/setup"><strong>Fine-tune anything</strong><span>Every setting can still be changed in Setup Centre</span></Link>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="wizard" onSubmit={(event) => {
      const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (intent === "publish" && published && !window.confirm("Publish these settings now? Your team will see the new matter types, roles and rules straight away.")) event.preventDefault();
    }}>
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <ol className="wizard-steps" aria-label="Set-up steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""}>
            <button type="button" onClick={() => setStep(index)} disabled={index > step && !canContinue} aria-current={index === step ? "step" : undefined}>
              <span>{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="foundation-panel">
          <h2>Tell us about your firm</h2>
          <p>This appears on letters, leave forms and your client portal. Only the name is required.</p>
          <div className="setup-field-grid">
            <WizardField label="Firm name *" value={answers.firm.name} onChange={(value) => setFirm("name", value)} />
            <WizardField label="Registered name" value={answers.firm.legalName} onChange={(value) => setFirm("legalName", value)} placeholder="e.g. Smith Attorneys Inc" />
            <WizardField label="Email" type="email" value={answers.firm.email} onChange={(value) => setFirm("email", value)} />
            <WizardField label="Phone" value={answers.firm.phone} onChange={(value) => setFirm("phone", value)} />
            <WizardField label="Website" value={answers.firm.website} onChange={(value) => setFirm("website", value)} placeholder="https://" />
            <label className="foundation-field"><span>Brand colour</span><input type="color" value={answers.firm.brandColour} onChange={(event) => setFirm("brandColour", event.target.value)} /></label>
          </div>
          <WizardField label="Physical address" value={answers.firm.address} onChange={(value) => setFirm("address", value)} />
        </section>
      ) : null}

      {step === 1 ? (
        <section className="foundation-panel">
          <h2>What work does your firm do?</h2>
          <p>Pick a starting point, then add or remove types of work. Each one comes with its stages and the tasks Parlia creates automatically when a matter reaches that stage.</p>
          <div className="wizard-chip-row" role="group" aria-label="Quick start">
            {firmTypes.map((type) => (
              <button key={type.key} type="button" className="wizard-chip" onClick={() => set("packs", [...new Set([...answers.packs, ...(type.packs ?? [])])])}>+ {type.label}</button>
            ))}
          </div>
          <div className="wizard-card-grid">
            {packs.map((pack) => {
              const selected = answers.packs.includes(pack.key);
              return (
                <article key={pack.key} className={`wizard-card${selected ? " is-selected" : ""}`}>
                  <label>
                    <input type="checkbox" checked={selected} onChange={() => toggle("packs", pack.key)} />
                    <span><strong>{pack.name}</strong><small>{pack.summary} · {pack.stages.length} stages</small></span>
                  </label>
                  <button type="button" className="wizard-link" onClick={() => setOpenPack(openPack === pack.key ? null : pack.key)}>{openPack === pack.key ? "Hide stages" : "See stages"}</button>
                  {openPack === pack.key ? <ol className="wizard-stage-list">{pack.stages.map((stage) => <li key={stage.name}>{stage.name}{stage.kind === "W" ? <em> · follow-up reminder</em> : stage.kind === "C" || stage.kind === "X" ? <em> · closes the matter</em> : null}</li>)}</ol> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="foundation-panel">
          <h2>Who works at your firm?</h2>
          <p>Tick the kinds of people you have. Each gets sensible access; you can adjust it later under Permissions.</p>
          <div className="wizard-card-grid">
            {roles.map((role) => (
              <article key={role.key} className={`wizard-card${answers.roles.includes(role.key) ? " is-selected" : ""}`}>
                <label>
                  <input type="checkbox" checked={answers.roles.includes(role.key)} onChange={() => toggle("roles", role.key)} />
                  <span><strong>{role.label}</strong><small>{role.description}</small></span>
                </label>
              </article>
            ))}
          </div>
          <h2 className="wizard-subheading">How should urgency be shown?</h2>
          <div className="wizard-card-grid">
            {(["simple", "detailed"] as const).map((key) => (
              <article key={key} className={`wizard-card${answers.urgency === key ? " is-selected" : ""}`}>
                <label>
                  <input type="radio" name="urgency-choice" checked={answers.urgency === key} onChange={() => set("urgency", key)} />
                  <span><strong>{key === "simple" ? "Simple – 3 levels" : "Detailed – 5 levels"}</strong>
                    <small className="wizard-bands">{urgency[key].map((band) => <i key={band.name} style={{ background: band.colour }}>{band.name}</i>)}</small></span>
                </label>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="foundation-panel">
          <h2>Office rules</h2>
          <p>Filled in with the usual South African defaults. Public holidays for 2026 and 2027 are added for you.</p>
          <div className="setup-field-grid">
            <label className="foundation-field"><span>Province</span>
              <select value={answers.province} onChange={(event) => set("province", event.target.value)}>
                <option value="">Choose…</option>{provinces.map((province) => <option key={province}>{province}</option>)}
              </select>
            </label>
            <NumberInput label="Annual leave (working days a year)" value={answers.leave.annualLeaveDays} onChange={(value) => set("leave", { ...answers.leave, annualLeaveDays: value })} />
            <NumberInput label="Sick leave (days per 3 years)" value={answers.leave.sickLeaveDaysPerCycle} onChange={(value) => set("leave", { ...answers.leave, sickLeaveDaysPerCycle: value })} />
            <NumberInput label="Family responsibility (days a year)" value={answers.leave.familyResponsibilityDays ?? 0} onChange={(value) => set("leave", { ...answers.leave, familyResponsibilityDays: value })} />
            <NumberInput label="Leave days that may carry over" value={answers.leave.carryOverDays} onChange={(value) => set("leave", { ...answers.leave, carryOverDays: value })} />
            <NumberInput label="Remind us to follow up after (days)" value={answers.followUpAfterDays} onChange={(value) => set("followUpAfterDays", value)} />
          </div>
          <label className="foundation-field"><span>Folders in every matter file (one per line)</span>
            <textarea rows={6} value={answers.folders.join("\n")} onChange={(event) => set("folders", event.target.value.split("\n"))} />
          </label>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="foundation-panel">
          <h2>Check and publish</h2>
          <dl className="wizard-summary">
            <dt>Firm</dt><dd>{answers.firm.name}{answers.firm.legalName ? ` (${answers.firm.legalName})` : ""}</dd>
            <dt>Types of work</dt><dd>{packs.filter((pack) => answers.packs.includes(pack.key)).map((pack) => pack.name).join(", ") || "None chosen"}</dd>
            <dt>Roles</dt><dd>{roles.filter((role) => answers.roles.includes(role.key)).map((role) => role.label).join(", ") || "Keep current roles"}</dd>
            <dt>Urgency</dt><dd>{answers.urgency === "simple" ? "3 levels" : "5 levels"}</dd>
            <dt>Leave</dt><dd>{answers.leave.annualLeaveDays} annual · {answers.leave.sickLeaveDaysPerCycle} sick per cycle · {answers.leave.familyResponsibilityDays ?? 0} family responsibility</dd>
            <dt>Province</dt><dd>{answers.province || "Not chosen"}</dd>
          </dl>
          <p className="foundation-muted">Anything you set up before is kept. You can change every detail later in Setup Centre.</p>
          <div className="wizard-actions">
            <Submit intent="draft" className="button-secondary">Save as draft</Submit>
            <Submit intent="publish" className="button-primary">Publish and start using Parlia</Submit>
          </div>
        </section>
      ) : null}

      {result && result !== "success:published" ? <p className={result.startsWith("success:") ? "foundation-notice" : "foundation-error"} role="status">{result.replace(/^success:/, "")}</p> : null}

      {step < 4 ? (
        <div className="wizard-actions">
          {step > 0 ? <button type="button" className="button-secondary" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <button type="button" className="button-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>
            {canContinue ? "Continue" : step === 0 ? "Enter your firm name" : "Choose at least one"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function WizardField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="foundation-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="foundation-field"><span>{label}</span><input type="number" min={0} max={1000} value={value} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))} /></label>;
}

function Submit({ intent, className, children }: { intent: string; className: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" name="intent" value={intent} className={className} disabled={pending}>{pending ? "Please wait…" : children}</button>;
}
