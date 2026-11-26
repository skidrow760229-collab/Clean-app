import { type NextRequest, NextResponse } from "next/server"
import { extractBearer, verifyApiKey } from "@/lib/api-key"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
} as const

/** Standard JSON success response with permissive CORS for agent clients. */
export function apiOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(
    { status: "success", data },
    { ...init, headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) } },
  )
}

/** Standard JSON error response. */
export function apiError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { status: "error", message, ...extra },
    { status, headers: CORS_HEADERS },
  )
}

/** Neon rejects every query with SQLSTATE 53000 once the plan's quota is used up. */
export function isDatabaseUnavailable(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 4; depth++) {
    const err = cur as { code?: unknown; message?: unknown; cause?: unknown }
    if (err.code === "53000" || (typeof err.message === "string" && err.message.includes("exceeded the quota"))) {
      return true
    }
    cur = err.cause
  }
  return false
}

export function databaseUnavailableResponse() {
  return apiError("Service temporarily unavailable: the database is over capacity. Retry in about an hour.", 503, {
    code: "database_unavailable",
    retry_after_seconds: 3600,
  })
}

/**
 * For ISR pages: Next prerenders them during `next build`, so a database outage
 * must not fail the build. Returns the fallback and lets revalidation retry.
 */
export async function queryOrFallback<T>(
  query: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; unavailable: boolean }> {
  try {
    return { data: await query(), unavailable: false }
  } catch (e) {
    if (!isDatabaseUnavailable(e)) throw e
    console.error("[db] unavailable:", e instanceof Error ? e.message : e)
    return { data: fallback, unavailable: true }
  }
}

/** Turns a database-capacity failure into a clear 503 instead of an opaque 500. */
export function withDatabaseGuard<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (e) {
      if (!isDatabaseUnavailable(e)) throw e
      console.error("[db] unavailable:", e instanceof Error ? e.message : e)
      return databaseUnavailableResponse()
    }
  }
}

/** Preflight handler shared by all API routes. */
export function apiPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/** Extracts the client IP for rate limiting. */
export function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  )
}

type AuthedAgent = {
  userId: string
  username: string
  keyId: number
}

/**
 * Authenticates a request by its `Authorization: Bearer clean_sk_...` header.
 * Returns the agent identity, or a ready-to-return 401 response.
 */
export async function authenticateAgent(
  request: NextRequest,
): Promise<
  { ok: true; agent: AuthedAgent } | { ok: false; response: NextResponse }
> {
  const token = extractBearer(request)

  if (!token) {
    return {
      ok: false,
      response: apiError(
        "Missing bearer token. Send 'Authorization: Bearer clean_sk_...'.",
        401,
      ),
    }
  }

  const verified = await verifyApiKey(token)
  if (!verified) {
    return {
      ok: false,
      response: apiError("Invalid or revoked API key.", 401),
    }
  }

  return { ok: true, agent: verified }
}
