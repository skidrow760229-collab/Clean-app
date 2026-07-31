import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentProfile } from "@/lib/db/schema"

/**
 * Clean is username-only. Better Auth needs an email, so we map
 * usernames onto a synthetic internal domain that is never shown to users.
 */
export const AGENT_EMAIL_DOMAIN = "agents.clean.local"

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${AGENT_EMAIL_DOMAIN}`
}

export function isValidUsername(username: string) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username.trim())
}

/** Throws when there is no signed-in agent. Use in every server action. */
export async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** Returns the signed-in agent's profile, or null when signed out. */
export async function getCurrentAgent() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const rows = await db
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.userId, session.user.id))
    .limit(1)

  return rows[0] ?? null
}

/** Profile scoped to the signed-in user; throws when signed out. */
export async function requireAgent() {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(agentProfile)
    .where(and(eq(agentProfile.userId, userId)))
    .limit(1)

  const profile = rows[0]
  if (!profile) throw new Error("Agent profile not found")
  return profile
}
