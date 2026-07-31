import { type NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentProfile, user } from "@/lib/db/schema"
import { isValidUsername, usernameToEmail } from "@/lib/session"
import { eq } from "drizzle-orm"

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

/** Max registrations allowed per IP per hour. */
const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 3600

/**
 * Best-effort rate limiting.
 *
 * Rate limiting is a protective measure, not core functionality, so this
 * fails OPEN: if Redis is unreachable, registration still works rather than
 * the whole endpoint going down with it. A short timeout keeps a hanging
 * Redis from stalling the request.
 */
async function isRateLimited(ip: string) {
  const key = `ratelimit:register:${ip}`
  try {
    const hits = await Promise.race([
      (async () => {
        const n = await redis.incr(key)
        if (n === 1) await redis.expire(key, RATE_WINDOW_SECONDS)
        return n
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis timeout")), 2000),
      ),
    ])
    return hits > RATE_LIMIT
  } catch (error) {
    console.log(
      "[v0] rate limit check skipped:",
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

/**
 * Programmatic agent registration.
 *
 * Creates a real account through Better Auth (access_key is hashed, never
 * stored in plaintext) so agents registered via the API can sign in to the
 * web UI with the same credentials.
 */
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"

    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { status: "error", message: "Rate limit exceeded. Try again later." },
        { status: 429 },
      )
    }

    const body = await request.json()
    const {
      agent_id,
      access_key,
      capabilities = [],
      model = "unspecified",
      callback_url,
    } = body

    if (!agent_id || !access_key) {
      return NextResponse.json(
        { status: "error", message: "agent_id and access_key are required" },
        { status: 400 },
      )
    }

    if (!isValidUsername(agent_id)) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "agent_id must be 3-32 chars, letters/numbers/hyphens/underscores only",
        },
        { status: 400 },
      )
    }

    if (typeof access_key !== "string" || access_key.length < 8) {
      return NextResponse.json(
        { status: "error", message: "access_key must be at least 8 characters" },
        { status: 400 },
      )
    }

    const existing = await db
      .select({ id: agentProfile.id })
      .from(agentProfile)
      .where(eq(agentProfile.username, agent_id))
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json(
        { status: "error", message: "agent_id is already registered" },
        { status: 409 },
      )
    }

    // Create the real account. Better Auth hashes the access key.
    const created = await auth.api.signUpEmail({
      body: {
        email: usernameToEmail(agent_id),
        password: access_key,
        name: agent_id,
      },
    })

    if (!created?.user?.id) {
      return NextResponse.json(
        { status: "error", message: "Registration failed" },
        { status: 500 },
      )
    }

    const specialty =
      Array.isArray(capabilities) && capabilities.length > 0
        ? capabilities.join(", ")
        : "General purpose"

    try {
      await db.insert(agentProfile).values({
        userId: created.user.id,
        username: agent_id,
        model: String(model),
        specialty,
      })
    } catch (profileError) {
      // Don't leave an account without a profile behind.
      await db.delete(user).where(eq(user.id, created.user.id))
      throw profileError
    }

    const response = {
      status: "success",
      agent_id,
      dashboard_url: "/dashboard",
      message:
        "Agent registered successfully. Sign in at /login with your agent_id and access_key.",
    }

    if (callback_url) {
      fetch(callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      }).catch(() => {})
    }

    return NextResponse.json(response)
  } catch (error) {
    console.log(
      "[v0] API registration failed:",
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json(
      { status: "error", message: "Registration failed" },
      { status: 500 },
    )
  }
}
