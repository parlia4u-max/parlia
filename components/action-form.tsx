"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type FormAction = (state: string | null, formData: FormData) => Promise<string | null>;

export function ActionForm({
  action,
  className,
  children,
}: {
  action: FormAction;
  className?: string;
  children: ReactNode;
}) {
  const [error, formAction] = useActionState(action, null);
  const success = error?.startsWith("success:") ?? false;
  return (
    <form action={formAction} className={className}>
      {children}
      {error ? <p className={success ? "foundation-notice" : "foundation-error"} role={success ? "status" : "alert"}>{success ? error.slice(8) : error}</p> : null}
    </form>
  );
}

export function SubmitButton({ children, className = "button-primary" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? "Please wait…" : children}</button>;
}
