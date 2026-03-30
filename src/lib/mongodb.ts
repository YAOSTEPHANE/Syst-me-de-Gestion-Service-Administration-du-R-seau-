import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "@/lib/env";

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientSingleton: MongoClient | null = null;

function getMongoClientInstance(): MongoClient {
  if (!clientSingleton) {
    clientSingleton = new MongoClient(env.mongodbUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      /** Configurable via MONGODB_* (voir `src/lib/env.ts`). Défaut 30s pour Atlas / scripts seed. */
      serverSelectionTimeoutMS: env.mongodbServerSelectionTimeoutMs,
      connectTimeoutMS: env.mongodbConnectTimeoutMs,
    });
  }
  return clientSingleton;
}

function connectClient() {
  const promise = getMongoClientInstance().connect().catch((error) => {
    // Evite les unhandled rejections et permet un nouvel essai au prochain appel.
    if (process.env.NODE_ENV !== "production") {
      global.__mongoClientPromise = undefined;
    }
    throw error;
  });
  if (process.env.NODE_ENV !== "production") {
    global.__mongoClientPromise = promise;
  }
  return promise;
}

function getClientPromise() {
  if (process.env.NODE_ENV !== "production" && global.__mongoClientPromise) {
    return global.__mongoClientPromise;
  }
  return connectClient();
}

export async function getMongoClient() {
  return getClientPromise();
}

export async function getDatabase() {
  const connectedClient = await getClientPromise();
  return connectedClient.db(env.mongodbDb);
}
