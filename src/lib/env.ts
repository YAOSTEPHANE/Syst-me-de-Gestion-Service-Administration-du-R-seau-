const requiredServerEnv = ["MONGODB_URI", "MONGODB_DB", "JWT_SECRET"] as const;

type RequiredServerEnvKey = (typeof requiredServerEnv)[number];

function getRequiredEnvVar(name: RequiredServerEnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value;
}

export const env = {
  mongodbUri: getRequiredEnvVar("MONGODB_URI"),
  mongodbDb: getRequiredEnvVar("MONGODB_DB"),
  jwtSecret: getRequiredEnvVar("JWT_SECRET"),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ADMR",
};
