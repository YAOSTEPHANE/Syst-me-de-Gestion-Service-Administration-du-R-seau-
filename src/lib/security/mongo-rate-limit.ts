import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "lonaci_api_rate_limits";

type RateLimitDoc = {
  _id: string;
  count: number;
  expiresAt: Date;
};

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDatabase();
  await db.collection(COLLECTION).createIndexes([
    { key: { expiresAt: 1 }, name: "idx_ttl_expires", expireAfterSeconds: 0 },
  ]);
  indexesEnsured = true;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

/**
 * Fenêtre fixe par identifiant (ex. IP). Compte atomiquement ; refuse si la limite est dépassée.
 * En cas d’erreur Mongo : fail-open par défaut ; si `RATE_LIMIT_FAIL_CLOSED=true`, refus (429) pour ne pas
 * laisser passer le trafic sans comptage.
 */
export async function consumeRateLimit(
  namespace: string,
  clientKey: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    await ensureIndexes();
    const db = await getDatabase();
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const _id = `${namespace}:${clientKey}:${bucket}`;
    const windowEnd = (bucket + 1) * windowMs;
    const expiresAt = new Date(windowEnd);

    const coll = db.collection<RateLimitDoc>(COLLECTION);
    const after = await coll.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after" },
    );

    const count = after?.count ?? 1;
    if (count > max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowEnd - now) / 1000)) };
    }
    return { allowed: true };
  } catch (error) {
    console.error("[mongo-rate-limit] consume failed", error);
    if (process.env.RATE_LIMIT_FAIL_CLOSED === "true") {
      return { allowed: false, retryAfterSec: 60 };
    }
    return { allowed: true };
  }
}
