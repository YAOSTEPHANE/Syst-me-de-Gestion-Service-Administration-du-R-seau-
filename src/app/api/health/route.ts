import { NextResponse } from "next/server";

import { getMongoClient } from "@/lib/mongodb";
import { logger } from "@/lib/observability/logger";
import { emitCriticalAlert } from "@/lib/observability/monitoring";

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
    logger.error("MongoDB health check failed", {
      event: "HEALTH_MONGODB_DOWN",
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    await emitCriticalAlert({
      code: "HEALTH_MONGODB_DOWN",
      title: "MongoDB indisponible",
      message: "Le endpoint /api/health a detecte une indisponibilite MongoDB.",
      metadata: {
        source: "api/health",
      },
    }).catch(() => {
      // Ne pas dégrader la réponse health si le canal d'alerte est indisponible.
    });

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
