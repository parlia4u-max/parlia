import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { reportCsvField } from "@/lib/report-rules";

type RegisterTab = "open" | "closed" | "warehouse";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download physical files.", { status: 401 });
  if (!hasPermission(user, "matters")) return new Response("You cannot access this file register.", { status: 403 });
  const tab = new URL(request.url).searchParams.get("tab") as RegisterTab | null;
  if (tab !== "open" && tab !== "closed" && tab !== "warehouse") return new Response("Choose a valid file register.", { status: 400 });

  const scope = permissionScope(user, "matters");
  const reports = scope === "Team" ? await getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } }) : [];
  const responsibleIds = scope === "Firm" ? undefined : [user.id, ...reports.map((report) => report.userId)];
  const files = await getDb().physicalFile.findMany({
    where: {
      firmId: user.firmId,
      ...(tab === "open" ? { fileStatus: "Open" } : { fileStatus: "Closed" }),
      ...(tab === "warehouse" ? { storageStatus: "Storage" } : {}),
      ...(responsibleIds ? { matter: { is: { responsibleId: { in: responsibleIds } } } } : {}),
    },
    select: {
      cupboard: true, shelfRow: true, shelfColumn: true, outOfFilingLocation: true, storageStatus: true, boxNumber: true, barcodeReference: true,
      borrower: { select: { name: true } },
      matter: { select: { matterNumber: true, clientName: true, clientSurname: true } },
    },
    orderBy: { matter: { matterNumber: "asc" } }, take: 5000,
  });
  const headers = tab === "open"
    ? ["Reference number", "Client name", "Client surname", "Cupboard", "Row", "Column", "Out-of-filing location", "Status"]
    : tab === "closed"
      ? ["Reference number", "Client name", "Client surname", "Storage number", "Status"]
      : ["Reference number", "Client name", "Client surname", "Storage number", "Barcode number"];
  const rows = files.map((file) => {
    const location = file.outOfFilingLocation === "Employee" ? file.borrower?.name ?? "Employee" : file.outOfFilingLocation ?? "";
    return tab === "open"
      ? [file.matter.matterNumber, file.matter.clientName, file.matter.clientSurname, file.cupboard, file.shelfRow, file.shelfColumn, location, "Open"]
      : tab === "closed"
        ? [file.matter.matterNumber, file.matter.clientName, file.matter.clientSurname, file.boxNumber, file.storageStatus === "Storage" ? "Storage" : "In office"]
        : [file.matter.matterNumber, file.matter.clientName, file.matter.clientSurname, file.boxNumber, file.barcodeReference];
  });
  const csv = [headers, ...rows].map((row) => row.map(reportCsvField).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="physical-files-${tab}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}