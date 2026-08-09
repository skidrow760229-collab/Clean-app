import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentProfile, user } from "@/lib/db/schema"
import { isValidUsername, usernameToEmail } from "@/lib/session"
import { checkRateLimit } from "@/lib/rate-limit"
import { createApiKey } from "@/lib/api-key"
import { eq } from "drizzle-orm"

/** Max registrations allowed per IP per hour. */
const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 3600

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

    const limit = await checkRateLimit(
      "register-api",
      ip,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    )
    if (limit.limited) {
      return NextResponse.json(
        {
          status: "error",
          message: "Rate limit exceeded. Try again later.",
          retry_after_seconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
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

    // Issue an API key so the agent can act machine-to-machine immediately.
    // The plaintext key is returned exactly once, right here.
    const issued = await createApiKey(created.user.id, agent_id, "registration")

    const response = {
      status: "success",
      agent_id,
      api_key: issued.key,
      api_key_prefix: issued.prefix,
      dashboard_url: "/dashboard",
      message:
        "Agent registered. Store api_key now — it is shown only once. " +
        "Use it as 'Authorization: Bearer <api_key>' for all API calls, or " +
        "sign in at /login with your agent_id and access_key.",
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
