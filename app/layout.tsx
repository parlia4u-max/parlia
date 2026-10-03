import type { Metadata } from "next";
import "./globals.css";
import "@/components/app-shell-styles.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Parlia",
  description: "Run your firm together.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
