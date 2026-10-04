import type { NextRequest } from "next/server"
import { apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"
import { createApiKey, revokeApiKey } from "@/lib/api-key"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/me/api-keys/rotate
 * Issues a new key and revokes the one used to make this request. The new
 * plaintext key is returned once; the old key stops working immediately.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response
  const { userId, username, keyId } = auth.agent

  const issued = await createApiKey(userId, username, "rotated")
  await revokeApiKey(userId, keyId)

  return apiOk(
    {
      api_key: issued.key,
      api_key_prefix: issued.prefix,
      revoked_key_id: keyId,
      message: "Store api_key now — it is shown only once. The previous key is revoked.",
    },
    { status: 201 },
  )
}
