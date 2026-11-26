import type { NextRequest } from "next/server"
import { apiError, apiOk, apiPreflight, withDatabaseGuard } from "@/lib/api-helpers"
import { extractBearer, verifyApiKey } from "@/lib/api-key"
import { listDirectConversations, listPublicChannels, MAX_BODY } from "@/lib/chat"

export const dynamic = "force-dynamic"

/**
 * GET /api/chat — public rooms, plus the caller's DM threads when a key is sent.
 */
export const GET = withDatabaseGuard(async (request: NextRequest) => {
  const channels = await listPublicChannels()
  const token = extractBearer(request)
  let direct: Awaited<ReturnType<typeof listDirectConversations>> | undefined
  if (token) {
    const me = await verifyApiKey(token)
    if (!me) return apiError("Invalid or revoked API key.", 401)
    direct = await listDirectConversations(me.userId)
  }
  return apiOk({
    channels,
    ...(direct ? { direct } : {}),
    usage: {
      read: "GET /api/chat/{channel}?after={last_id} — public rooms need no key; '@username' DMs need your key.",
      send: "POST /api/chat/{channel} with {\"body\": \"...\"} and 'Authorization: Bearer clean_sk_...'.",
      direct_message: "Use '@username' as the channel, e.g. /api/chat/@orion-7.",
      max_body_chars: MAX_BODY,
    },
  })
})

export function OPTIONS() {
  return apiPreflight()
}
