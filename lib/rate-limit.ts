import { sql } from "drizzle-orm"
import { headers } from "next/headers"
import { db } from "@/lib/db"

/**
 * Postgres-backed rate limiting.
 *
 * This deliberately runs on the app's existing Neon pool rather than a
 * separate Redis. If Postgres is unreachable then authentication cannot work
 * either, so the limiter adds no new failure surface — which is why it can
 * safely fail CLOSED instead of silently letting traffic through.
 */

export type RateLimitResult = {
  limited: boolean
  remaining: number
  /** Seconds until the current window resets. */
  retryAfterSeconds: number
}

/**
 * Atomically increments the counter for `scope:identifier` and reports whether
 * the caller is over `limit`.
 *
 * The whole read-modify-write happens in one statement so concurrent requests
 * cannot race past the limit. An expired window resets the count to 1.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `${scope}:${identifier}`
  const windowExpr = sql`(${String(windowSeconds)} || ' seconds')::interval`

  try {
    const result = await db.execute(sql`
      INSERT INTO "rate_limit" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limit"."windowStart" < now() - ${windowExpr} THEN 1
          ELSE "rate_limit"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "rate_limit"."windowStart" < now() - ${windowExpr} THEN now()
          ELSE "rate_limit"."windowStart"
        END
      RETURNING
        "count" AS "hits",
        GREATEST(
          0,
          CEIL(
            EXTRACT(EPOCH FROM ("windowStart" + ${windowExpr} - now()))
          )
        )::int AS "resetIn"
    `)

    const row = (result.rows?.[0] ?? {}) as { hits?: number; resetIn?: number }
    const hits = Number(row.hits ?? 1)

    return {
      limited: hits > limit,
      remaining: Math.max(0, limit - hits),
      retryAfterSeconds: Number(row.resetIn ?? windowSeconds),
    }
  } catch (error) {
    // Fail closed: better to reject a request than to leave auth endpoints
    // unprotected. This should only ever fire if the database is down, in
    // which case the request would fail downstream anyway.
    console.log(
      "[v0] rate limit check failed, denying request:",
      error instanceof Error ? error.message : error,
    )
    return { limited: true, remaining: 0, retryAfterSeconds: windowSeconds }
  }
}

/**
 * Drops a counter. Called after a successful sign-in so that legitimate users
 * who mistyped their key a few times don't stay penalised.
 */
export async function clearRateLimit(scope: string, identifier: string) {
  try {
    await db.execute(
      sql`DELETE FROM "rate_limit" WHERE "key" = ${`${scope}:${identifier}`}`,
    )
  } catch {
    // Non-critical: the window will expire on its own.
  }
}

/**
 * Best-effort client IP for request attribution.
 *
 * On Vercel `x-forwarded-for` is set by the platform edge, so the left-most
 * entry is the real client. Falls back to a shared bucket when absent, which
 * is intentionally conservative.
 */
export async function getClientIp() {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return h.get("x-real-ip")?.trim() || "unknown"
}

/** Removes counters whose window closed over a day ago. */
export async function pruneRateLimits() {
  await db.execute(
    sql`DELETE FROM "rate_limit" WHERE "windowStart" < now() - interval '1 day'`,
  )
}
