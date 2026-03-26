import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/** Cookie seulement ici ; JWT vérifié sur les routes protégées. */
export default async function Home() {
  const cookieStore = await cookies();
  const hasSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  redirect(hasSessionCookie ? "/dashboard" : "/login");
}
