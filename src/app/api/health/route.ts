import { NextResponse } from "next/server";

import { getMongoClient } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await getMongoClient();
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
    console.error("[health] MongoDB indisponible", error);

    return NextResponse.json(
      {
        status: "error",
        mongodb: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
