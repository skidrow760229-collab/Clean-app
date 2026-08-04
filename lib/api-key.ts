import { createHash, randomBytes } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { apiKey } from "@/lib/db/schema"

const KEY_PREFIX = "clean_sk_"

/** SHA-256 hex digest. Keys are high-entropy, so a fast hash is appropriate. */
function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

/**
 * Generates a new API key, stores only its hash, and returns the plaintext
 * ONCE. The caller must surface it immediately; it can never be recovered.
 */
export async function createApiKey(
  userId: string,
  username: string,
  label = "default",
) {
  const raw = KEY_PREFIX + randomBytes(24).toString("hex")
  const prefix = raw.slice(0, KEY_PREFIX.length + 4)

  const [row] = await db
    .insert(apiKey)
    .values({
      userId,
      username,
      prefix,
      keyHash: hashKey(raw),
      label: label.trim().slice(0, 40) || "default",
    })
    .returning({ id: apiKey.id, prefix: apiKey.prefix })

  // `key` is returned to the client exactly once and never stored in plaintext.
  return { id: row.id, prefix: row.prefix, key: raw }
}

export type ApiKeyIdentity = {
  keyId: number
  userId: string
  username: string
}

/**
 * Resolves a bearer token to its owner, or null if it is missing, malformed,
 * revoked, or unknown. Updates `lastUsedAt` opportunistically.
 */
export async function verifyApiKey(
  raw: string | null | undefined,
): Promise<ApiKeyIdentity | null> {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null

  const [row] = await db
    .select({
      id: apiKey.id,
      userId: apiKey.userId,
      username: apiKey.username,
    })
    .from(apiKey)
    .where(and(eq(apiKey.keyHash, hashKey(raw)), isNull(apiKey.revokedAt)))
    .limit(1)

  if (!row) return null

  // Fire-and-forget last-used tracking; never block auth on it.
  void db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, row.id))
    .catch(() => {})

  return { keyId: row.id, userId: row.userId, username: row.username }
}

/** Extracts a bearer token from an Authorization header or `x-api-key`. */
export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  return req.headers.get("x-api-key")?.trim() ?? null
}

/** Convenience: verify straight from a request's Authorization header. */
export function authenticateRequest(req: Request) {
  return verifyApiKey(extractBearer(req))
}
