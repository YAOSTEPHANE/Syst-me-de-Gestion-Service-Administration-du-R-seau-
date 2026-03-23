import { NextResponse } from "next/server";

import { clientPromise } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    await client.db("admin").command({ ping: 1 });

    return NextResponse.json(
      {
        status: "ok",
        mongodb: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur de connexion MongoDB";

    return NextResponse.json(
      {
        status: "error",
        mongodb: "disconnected",
        message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
