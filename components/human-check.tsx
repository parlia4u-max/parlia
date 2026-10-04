import { createHumanCheck } from "@/lib/portal-check";

export function HumanCheckFields() {
  const check = createHumanCheck();
  return (
    <>
      <label className="foundation-field">
        <span>Quick check: {check.question}</span>
        <input name="checkAnswer" inputMode="numeric" autoComplete="off" required maxLength={3} />
      </label>
      <input type="hidden" name="checkToken" value={check.token} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
        <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
    </>
  );
}
