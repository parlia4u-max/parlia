"use client";

import { useEffect, useState } from "react";
import { startCallTimer, stopCallTimer } from "@/app/actions/time-entries";
import { ActionForm, SubmitButton } from "@/components/action-form";

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return <strong aria-live="off">{pad(Math.floor(seconds / 3600))}:{pad(Math.floor((seconds % 3600) / 60))}:{pad(seconds % 60)}</strong>;
}

export function CallTimer({ matterId, runningSince, runningElsewhere }: { matterId: string; runningSince: string | null; runningElsewhere: boolean }) {
  if (runningSince) {
    return (
      <ActionForm action={stopCallTimer} className="foundation-form">
        <input type="hidden" name="matterId" value={matterId} />
        <p>Timer running: <Elapsed since={runningSince} /></p>
        <label className="foundation-field"><span>What was it for? (optional)</span><input name="note" maxLength={300} /></label>
        <SubmitButton>Stop timer</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={startCallTimer} className="foundation-form">
      <input type="hidden" name="matterId" value={matterId} />
      {runningElsewhere ? <p className="foundation-notice">You have a timer running on another matter. Stop it before starting a new one.</p> : null}
      <SubmitButton>Start call timer</SubmitButton>
    </ActionForm>
  );
}