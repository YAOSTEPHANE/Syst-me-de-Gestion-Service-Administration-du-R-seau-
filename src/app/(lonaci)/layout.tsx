import type { ReactNode } from "react";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import { redirect } from "next/navigation";

import LonaciShell from "@/components/lonaci/lonaci-shell";
import { getSessionFromCookies } from "@/lib/auth/session";

import "./lonaci-shell.css";

const lonaciSora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-lonaci-sora",
  display: "swap",
});

const lonaciMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-lonaci-mono",
  display: "swap",
});

export default async function LonaciLayout({ children }: { children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className={`${lonaciSora.variable} ${lonaciMono.variable}`}>
      <LonaciShell>{children}</LonaciShell>
    </div>
  );
}
