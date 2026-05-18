import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import LonaciShell from "@/components/lonaci/lonaci-shell";
import { getSessionFromCookies } from "@/lib/auth/session";

import "./lonaci-shell.css";

export default async function LonaciLayout({ children }: { children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return <LonaciShell>{children}</LonaciShell>;
}
