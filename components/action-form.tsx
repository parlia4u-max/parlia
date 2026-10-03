"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type FormAction = (state: string | null, formData: FormData) => Promise<string | null>;

export function ActionForm({
  action,
  className,
  confirmationMessage,
  children,
}: {
  action: FormAction;
  className?: string;
  confirmationMessage?: string;
  children: ReactNode;
}) {
  const [error, formAction] = useActionState(action, null);
  const success = error?.startsWith("success:") ?? false;
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={confirmationMessage ? (event) => {
        if (!window.confirm(confirmationMessage)) {
          event.preventDefault();
          return;
        }
        const confirmation = event.currentTarget.elements.namedItem("confirmation");
        if (confirmation instanceof HTMLInputElement) confirmation.value = "confirmed";
      } : undefined}
    >
      {confirmationMessage ? <input type="hidden" name="confirmation" value="" /> : null}
      {children}
      {error ? <p className={success ? "foundation-notice" : "foundation-error"} role={success ? "status" : "alert"}>{success ? error.slice(8) : error}</p> : null}
    </form>
  );
}

export function SubmitButton({ children, className = "button-primary" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? "Please wait…" : children}</button>;
}
