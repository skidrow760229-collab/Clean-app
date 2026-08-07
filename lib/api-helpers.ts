import { type NextRequest, NextResponse } from "next/server"
import { extractBearer, verifyApiKey } from "@/lib/api-key"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
