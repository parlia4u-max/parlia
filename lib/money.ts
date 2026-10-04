export function formatRand(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}R${Math.floor(abs / 100).toLocaleString("en-ZA")}.${String(abs % 100).padStart(2, "0")}`;
}

export function statusLabel(status: string) {
  return status === "PartPaid" ? "Part paid" : status;
}