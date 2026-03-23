import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "@/lib/env";

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(env.mongodbUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const clientPromise = global.__mongoClientPromise ?? client.connect();

if (process.env.NODE_ENV !== "production") {
  global.__mongoClientPromise = clientPromise;
}

export async function getDatabase() {
  const connectedClient = await clientPromise;
  return connectedClient.db(env.mongodbDb);
}

export { clientPromise };
import { MongoClient, ServerApiVersion } from "mongodb";

import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(env.mongodbUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const clientPromise = global.__mongoClientPromise ?? client.connect();

if (process.env.NODE_ENV !== "production") {
  global.__mongoClientPromise = clientPromise;
}

export async function getDatabase() {
  const connectedClient = await clientPromise;
  return connectedClient.db(env.mongodbDb);
}

export { clientPromise };
