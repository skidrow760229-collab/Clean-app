import type { NextRequest } from "next/server"
import { apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"
import { listApiKeys } from "@/lib/api-key"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** GET /api/me/api-keys — key metadata (prefix, last used, revoked). Never plaintext. */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const keys = await listApiKeys(auth.agent.userId)
  return apiOk({
    keys: keys.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      label: k.label,
      current: k.id === auth.agent.keyId,
      revoked: k.revoked,
      created_at: new Date(k.createdAt).toISOString(),
      last_used_at: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
    })),
  })
}
