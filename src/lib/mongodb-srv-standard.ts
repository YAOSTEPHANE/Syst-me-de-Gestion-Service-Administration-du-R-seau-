import dns from "node:dns";

let resolvedMongoUri: string | null = null;

function parseSrvUrl(srvUrl: string) {
  const m = srvUrl.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/);
  if (!m) throw new Error("URI mongodb+srv invalide");
  const [user, pass = ""] = m[1].split(":", 2).map((s) => decodeURIComponent(s));
  return {
    user,
    pass,
    clusterHost: m[2],
    db: m[3]?.trim() || "lonaci",
    query: m[4] ?? "retryWrites=true&w=majority",
  };
}

async function srvToStandardUri(srvUrl: string): Promise<string> {
  const servers = process.env.MONGODB_DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (servers?.length) {
    dns.setServers(servers);
  } else {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
  const { user, pass, clusterHost, db, query } = parseSrvUrl(srvUrl);
  const records = await dns.promises.resolveSrv(`_mongodb._tcp.${clusterHost}`);
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(",");
  const params = new URLSearchParams(query);
  params.set("tls", "true");
  params.set("authSource", "admin");
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${db}?${params.toString()}`;
}

function shouldConvertSrvToStandard(uri: string): boolean {
  if (!uri.startsWith("mongodb+srv://")) return false;
  const explicit = process.env.MONGODB_SRV_TO_STANDARD?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return Boolean(process.env.MONGODB_DNS_SERVERS?.trim());
}

/**
 * Remplace mongodb+srv par mongodb:// (hôtes shard explicites) quand le résolveur système
 * bloque querySrv (réseau d’entreprise). À appeler avant le premier import de Prisma.
 */
export async function initMongoSrvStandardUri(): Promise<void> {
  if (resolvedMongoUri) return;

  const standard = process.env.DATABASE_URL_STANDARD?.trim() || process.env.MONGODB_URI_STANDARD?.trim();
  if (standard) {
    resolvedMongoUri = standard;
    process.env.DATABASE_URL = standard;
    return;
  }

  const raw =
    process.env.MONGODB_URI?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  if (!raw || !shouldConvertSrvToStandard(raw)) {
    return;
  }

  const converted = await srvToStandardUri(raw);
  resolvedMongoUri = converted;
  process.env.DATABASE_URL = converted;
  if (!process.env.MONGODB_URI?.trim()) {
    process.env.MONGODB_URI = converted;
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[env] DATABASE_URL convertie mongodb+srv → mongodb:// (MONGODB_DNS_SERVERS / réseau d’entreprise).",
    );
  }
}

export function getResolvedMongoUri(fallback: string): string {
  return resolvedMongoUri ?? fallback;
}
