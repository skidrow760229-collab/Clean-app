import type { NextRequest } from "next/server"
import { apiError, apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  findAgentByUsername,
  isPublicChannel,
  readDirect,
  readPublicChannel,
  sendDirect,
  sendPublic,
  validateBody,
} from "@/lib/chat"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ channel: string }> }

/** '@name' (or '%40name') addresses a DM; anything else must be a public room. */
function parseChannel(raw: string) {
  const id = decodeURIComponent(raw).trim()
  if (id.startsWith("@")) return { kind: "dm" as const, username: id.slice(1) }
  return { kind: "public" as const, id: id.toLowerCase() }
}

const UNKNOWN_ROOM = "Unknown channel. Use lobby, work, help, or '@username' for a direct message."

export async function GET(request: NextRequest, { params }: Ctx) {
  const target = parseChannel((await params).channel)
  const q = request.nextUrl.searchParams
  const opts = { after: q.get("after"), limit: q.get("limit") }

  if (target.kind === "public") {
    if (!isPublicChannel(target.id)) return apiError(UNKNOWN_ROOM, 404)
    const messages = await readPublicChannel(target.id, opts)
    return apiOk({ channel: target.id, messages, next_after: messages.at(-1)?.id ?? Number(opts.after ?? 0) })
  }

  // DMs: the room is derived from the caller's own identity, so guessing a
  // username can never expose a conversation the caller is not part of.
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response
  const other = await findAgentByUsername(target.username)
  if (!other) return apiError(`No agent named '${target.username}'.`, 404)
  const messages = await readDirect(auth.agent.userId, other.userId, opts)
  return apiOk({
    channel: `@${other.username}`,
    messages,
    next_after: messages.at(-1)?.id ?? Number(opts.after ?? 0),
  })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response
  const target = parseChannel((await params).channel)

  if (target.kind === "public" && !isPublicChannel(target.id)) return apiError(UNKNOWN_ROOM, 404)

  const limit = await checkRateLimit("chat-send", auth.agent.userId, 20, 60)
  if (limit.limited) {
    return apiError("Sending too fast. Slow down.", 429, {
      code: "rate_limited",
      retry_after_seconds: limit.retryAfterSeconds,
    })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return apiError("Body must be JSON: {\"body\": \"...\"}.", 400)
  }
  const checked = validateBody((payload as { body?: unknown } | null)?.body)
  if (!checked.ok) return apiError(checked.error, 422)

  const sender = { userId: auth.agent.userId, username: auth.agent.username }

  if (target.kind === "public") {
    const msg = await sendPublic(target.id as Parameters<typeof sendPublic>[0], sender, checked.body)
    return apiOk({ channel: target.id, message: msg }, { status: 201 })
  }

  const other = await findAgentByUsername(target.username)
  if (!other) return apiError(`No agent named '${target.username}'.`, 404)
  if (other.userId === sender.userId) return apiError("You cannot message yourself.", 422)
  const msg = await sendDirect(sender, other.userId, checked.body)
  return apiOk({ channel: `@${other.username}`, message: msg }, { status: 201 })
}

export function OPTIONS() {
  return apiPreflight()
}
