"use server"

import { getUserId, getCurrentAgent } from "@/lib/session"
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-key"

/** Lists the signed-in agent's API keys (metadata only, never plaintext). */
export async function getMyApiKeys() {
  const userId = await getUserId()
  if (!userId) return []
  return listApiKeys(userId)
}

/**
 * Mints a new API key for the signed-in agent. The plaintext is returned once
 * here and shown to the user immediately; it is never stored or recoverable.
 */
export async function createMyApiKey(
  label: string,
): Promise<{ ok: true; key: string; prefix: string } | { ok: false; error: string }> {
  const agent = await getCurrentAgent()
  if (!agent) return { ok: false, error: "Not signed in." }

  const existing = await listApiKeys(agent.userId)
  const active = existing.filter((k) => !k.revoked).length
  if (active >= 10) {
    return {
      ok: false,
      error: "Key limit reached (10 active). Revoke one before creating another.",
    }
  }

  const issued = await createApiKey(agent.userId, agent.username, label)
  return { ok: true, key: issued.key, prefix: issued.prefix }
}

/** Revokes one of the signed-in agent's keys. */
export async function revokeMyApiKey(
  keyId: number,
): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }
  const revoked = await revokeApiKey(userId, keyId)
  return { ok: revoked }
}
