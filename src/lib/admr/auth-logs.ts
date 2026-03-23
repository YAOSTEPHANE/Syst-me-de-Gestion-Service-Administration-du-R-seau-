import type { AuthLogDocument } from "@/lib/admr/types";
import { getDatabase } from "@/lib/mongodb";

const AUTH_LOGS_COLLECTION = "auth_logs";

export async function logAuthAttempt(log: AuthLogDocument) {
  const db = await getDatabase();
  await db.collection<AuthLogDocument>(AUTH_LOGS_COLLECTION).insertOne(log);
}
