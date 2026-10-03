import Link from "next/link";
import type { ReactNode } from "react";

export function FoundationHeader({ title, firm, isOwner = false, canViewPeople = isOwner }: { title: string; firm: string; isOwner?: boolean; canViewPeople?: boolean }) {
  return (
    <header className="foundation-header">
      <div>
        <p className="eyebrow">{firm}</p>
        <h1>{title}</h1>
      </div>
      <nav className="foundation-nav" aria-label="Foundation">
        {canViewPeople ? <Link href="/staff">Staff</Link> : null}
        {isOwner ? <Link href="/settings/permissions">Permissions</Link> : null}
        {isOwner ? <Link href="/settings/audit-log">Audit log</Link> : null}
      </nav>
    </header>
  );
}

export function Field({ label, name, type = "text", required = true, defaultValue, autoComplete, minLength, maxLength }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string; autoComplete?: string; minLength?: number; maxLength?: number;
}) {
  return (
    <label className="foundation-field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} />
    </label>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="foundation-notice" role="status">{children}</p>;
}
