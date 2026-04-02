type RequiredServerEnvKey = "JWT_SECRET";

/** Uniquement si la variable est absente en `development` — jamais en production. */
const DEV_ENV_DEFAULTS = {
  MONGODB_URI: "mongodb://127.0.0.1:27017",
  MONGODB_DB: "lonaci",
  JWT_SECRET:
    "dev-only-jwt-secret-do-not-use-in-production-min-32-characters",
} as const;

let usedDevEnvFallback = false;

function getRequiredEnvVar(name: RequiredServerEnvKey): string {
  const value = process.env[name];
  if (value?.trim()) {
    return value.trim();
  }
  if (process.env.NODE_ENV === "development") {
    const fallback = DEV_ENV_DEFAULTS[name];
    if (fallback) {
      usedDevEnvFallback = true;
      return fallback;
    }
  }
  throw new Error(`Variable d'environnement manquante: ${name}`);
}

const JWT_SECRET_MIN_LENGTH_PROD = 32;

function resolveJwtSecret(): string {
  const secret = getRequiredEnvVar("JWT_SECRET");
  if (process.env.NODE_ENV === "production") {
    if (secret.length < JWT_SECRET_MIN_LENGTH_PROD) {
      throw new Error(
        `JWT_SECRET doit comporter au moins ${JWT_SECRET_MIN_LENGTH_PROD} caractères en production.`,
      );
    }
    if (secret === DEV_ENV_DEFAULTS.JWT_SECRET) {
      throw new Error(
        "JWT_SECRET ne peut pas être la valeur de développement par défaut en production.",
      );
    }
  }
  return secret;
}

/** Nom de base après l’hôte (ex. .../lonaci?retryWrites=...) */
function parseDbNameFromMongoUri(uri: string): string | null {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const afterScheme = withoutQuery.replace(/^mongodb(\+srv)?:\/\//, "");
  const slashIdx = afterScheme.indexOf("/");
  if (slashIdx === -1) return null;
  const path = afterScheme.slice(slashIdx + 1).trim();
  return path.length > 0 ? path : null;
}

/**
 * Client Mongo natif (logs d’auth, etc.) : MONGODB_URI, ou sinon la même chaîne que Prisma (DATABASE_URL).
 */
function resolveMongoUri(): string {
  const fromMongo = process.env.MONGODB_URI?.trim();
  if (fromMongo) return fromMongo;
  const fromPrisma = process.env.DATABASE_URL?.trim();
  if (fromPrisma) return fromPrisma;
  if (process.env.NODE_ENV === "development") {
    usedDevEnvFallback = true;
    return DEV_ENV_DEFAULTS.MONGODB_URI;
  }
  throw new Error(
    "Variable d'environnement manquante: MONGODB_URI ou DATABASE_URL (cluster Mongo partagé avec Prisma)."
  );
}

function resolveMongoDb(): string {
  const explicit = process.env.MONGODB_DB?.trim();
  if (explicit) return explicit;
  const uri = process.env.MONGODB_URI?.trim() || process.env.DATABASE_URL?.trim();
  const parsed = uri ? parseDbNameFromMongoUri(uri) : null;
  if (parsed) return parsed;
  if (process.env.NODE_ENV === "development") {
    usedDevEnvFallback = true;
    return DEV_ENV_DEFAULTS.MONGODB_DB;
  }
  throw new Error(
    "Variable d'environnement manquante: MONGODB_DB (ou un nom de base dans l'URL Mongo, ex. .../lonaci)."
  );
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Délais client Mongo natif (logs, index, collections hors Prisma).
 * Sur Atlas / réseau lent, augmenter via MONGODB_CONNECT_TIMEOUT_MS (ex. 60000).
 */
const MONGODB_CONNECT_TIMEOUT_MS_DEFAULT = 30_000;
const MONGODB_SERVER_SELECTION_TIMEOUT_MS_DEFAULT = 30_000;

let devFallbackWarned = false;

function warnDevFallbackIfNeeded() {
  if (
    devFallbackWarned ||
    !usedDevEnvFallback ||
    process.env.NODE_ENV !== "development"
  ) {
    return;
  }
  devFallbackWarned = true;
  console.warn(
    "[env] JWT_SECRET absent, ou Mongo sans URL : valeurs par défaut de développement. Pour la prod, définissez JWT_SECRET, DATABASE_URL (Prisma) et optionnellement MONGODB_URI / MONGODB_DB.",
  );
}

/**
 * Accès paresseux : évite les `throw` au chargement des modules pendant `next build`
 * lorsque les routes n'utilisent pas encore Mongo / JWT (CI sans secrets complets).
 */
export const env = {
  get mongodbUri() {
    const v = resolveMongoUri();
    warnDevFallbackIfNeeded();
    return v;
  },
  get mongodbDb() {
    const v = resolveMongoDb();
    warnDevFallbackIfNeeded();
    return v;
  },
  get mongodbConnectTimeoutMs() {
    return parsePositiveInt(
      "MONGODB_CONNECT_TIMEOUT_MS",
      MONGODB_CONNECT_TIMEOUT_MS_DEFAULT,
    );
  },
  get mongodbServerSelectionTimeoutMs() {
    return parsePositiveInt(
      "MONGODB_SERVER_SELECTION_TIMEOUT_MS",
      MONGODB_SERVER_SELECTION_TIMEOUT_MS_DEFAULT,
    );
  },
  get jwtSecret() {
    const v = resolveJwtSecret();
    warnDevFallbackIfNeeded();
    return v;
  },
  get appName() {
    return process.env.NEXT_PUBLIC_APP_NAME ?? "LONACI";
  },
};

/**
 * Hints prod : une fois par processus Node. Pour des logs CI plus propres pendant
 * `next build` (plusieurs workers), définir SKIP_PROD_ENV_CONSOLE=true.
 */
const g = globalThis as typeof globalThis & {
  __lonaciProdEnvHintsLogged?: boolean;
};

function logProductionEnvHintsOnce() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SKIP_PROD_ENV_CONSOLE === "true") return;
  if (g.__lonaciProdEnvHintsLogged) return;
  g.__lonaciProdEnvHintsLogged = true;

  if (!process.env.SMTP_HOST?.trim()) {
    console.warn(
      "[env] SMTP_HOST absent : les envois d'e-mail (réinitialisation mot de passe, alertes workflow) peuvent être désactivés ou dégradés.",
    );
  }
  if (!process.env.CRON_SECRET?.trim()) {
    console.warn(
      "[env] CRON_SECRET absent : POST /api/cron/daily-jobs répondra 503 (jobs planifiés inopérants).",
    );
  }
  if (process.env.RATE_LIMIT_FAIL_CLOSED !== "true") {
    console.warn(
      "[env] RATE_LIMIT_FAIL_CLOSED != true : si le store Mongo du rate limit est indisponible, les routes concernées peuvent rester accessibles (fail-open).",
    );
  }
}

logProductionEnvHintsOnce();
