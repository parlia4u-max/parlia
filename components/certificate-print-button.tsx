"use client";

export function CertificatePrintButton({ targetId }: { targetId: string }) {
  return <button className="button-secondary no-print" onClick={() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.dataset.printTarget = "true";
    window.addEventListener("afterprint", () => { delete target.dataset.printTarget; }, { once: true });
    window.print();
  }} type="button">Print certificate</button>;
}