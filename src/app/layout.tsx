import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";

import AppToaster from "@/components/system/app-toaster";
import OfflineSupportHost from "@/components/system/offline-support-host";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-lonaci",
});

export const metadata: Metadata = {
  title: {
    default: "LONACI — Gestion institutionnelle",
    template: "%s | LONACI",
  },
  description: "Plateforme institutionnelle de gestion des opérations LONACI.",
  manifest: "/manifest.webmanifest",
  applicationName: "LONACI",
  authors: [{ name: "LONACI" }],
  creator: "LONACI",
  category: "business",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <OfflineSupportHost />
        {children}
        <AppToaster />
        <Analytics />
      </body>
    </html>
  );
}
