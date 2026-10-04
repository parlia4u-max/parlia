import type { Metadata } from "next";
import "./globals.css";
import "@/components/app-shell-styles.css";
import { AppShell, type NavigationAccess } from "@/components/app-shell";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SETUP_SECTIONS } from "@/lib/setup-config";

export const metadata: Metadata = {
  title: "Parlia",
  description: "Run your firm together.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  let navigationAccess: NavigationAccess = { isOwner: false, canViewPeople: false, canManagePeople: false, canViewMatters: false, canViewTasks: false, canViewCalendar: false, canViewAttendance: false, canViewReports: false, setupHrefs: [] };
  if (currentUser) {
    const setupHrefs: string[] = [];
    if (currentUser.isOwner) {
      setupHrefs.push(...SETUP_SECTIONS.map((section) => section.href));
    } else {
      const db = getDb();
      const [configuration, supervisorLink] = await Promise.all([
        db.setupConfiguration.findUnique({ where: { firmId: currentUser.firmId }, select: { published: true } }),
        db.supervisorLink.findFirst({
          where: { firmId: currentUser.firmId, supervisorId: currentUser.id, user: { active: true } },
          select: { id: true },
        }),
      ]);
      if (configuration && supervisorLink) {
        const published = configuration.published && typeof configuration.published === "object"
          ? configuration.published as { setupRights?: { supervisors?: { userId: string; sections: string[] }[] } }
          : {};
        const grant = published.setupRights?.supervisors?.find((item) => item.userId === currentUser.id);
        for (const section of SETUP_SECTIONS) {
          if (section.ownerOnly || !Array.isArray(grant?.sections) || !grant.sections.includes(section.key)) continue;
          setupHrefs.push(section.href);
        }
      }
    }
    navigationAccess = {
      isOwner: currentUser.isOwner,
      canViewPeople: hasPermission(currentUser, "people"),
      canManagePeople: currentUser.isOwner || hasPermission(currentUser, "people", "Edit") && permissionScope(currentUser, "people") !== "Own",
      canViewMatters: hasPermission(currentUser, "matters"),
      canViewTasks: hasPermission(currentUser, "tasks"),
      canViewCalendar: hasPermission(currentUser, "calendar"),
      canViewAttendance: hasPermission(currentUser, "attendance"),
      canViewReports: hasPermission(currentUser, "reports") && hasPermission(currentUser, "matters"),
      setupHrefs,
    };
  }

  return (
    <html lang="en">
      <body>
        <AppShell navigationAccess={navigationAccess}>{children}</AppShell>
      </body>
    </html>
  );
}
