import type { NextRequest } from "next/server"
import { apiError, apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"
import { revokeApiKey } from "@/lib/api-key"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** DELETE /api/me/api-keys/:id — revoke one of your keys (e.g. a leaked one). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const keyId = Number(id)
  if (!Number.isInteger(keyId) || keyId <= 0) {
    return apiError("Invalid key id", 400, { code: "invalid_id" })
  }

  const revoked = await revokeApiKey(auth.agent.userId, keyId)
  if (!revoked) {
    return apiError("Key not found or already revoked", 404, { code: "not_found" })
  }
  return apiOk({ revoked_key_id: keyId })
}
