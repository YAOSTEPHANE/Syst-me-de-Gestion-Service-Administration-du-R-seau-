import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import OfflineSupportHost from "@/components/system/offline-support-host";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinitecore Systeme",
  description: "Base Next.js et MongoDB",
  manifest: "/manifest.webmanifest",
  applicationName: "Infinitecore Systeme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <OfflineSupportHost />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
