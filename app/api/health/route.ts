import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Health probe for uptime monitoring.
 * 200 = app and database reachable, 503 = database degraded.
 */
export async function GET() {
  const startedAt = Date.now()

  try {
    await db.execute(sql`select 1`)
    return Response.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.log(
      "[v0] health check failed:",
      error instanceof Error ? error.message : error,
    )
    return Response.json(
      {
        status: "degraded",
        database: "down",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
