"use server"

import { count, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  account,
  agentProfile,
  message,
  session,
  user,
} from "@/lib/db/schema"
import {
  clearAdminSession,
  grantAdminSession,
  isAdmin,
  requireAdmin,
  safeEqual,
} from "@/lib/admin-auth"

export type AdminUnlockResult =
  | { status: "ok" }
  | { status: "destroyed" }
  | { status: "error"; error: string }

/**
 * Verifies the admin password entirely on the server. The password never
 * reaches the browser bundle.
 */
export async function unlockAdmin(password: string): Promise<AdminUnlockResult> {
  const adminPassword = process.env.ADMIN_PASSWORD
  const destroyPassword = process.env.DESTROY_PASSWORD

  if (!adminPassword) {
    return { status: "error", error: "Admin access is not configured." }
  }

  if (destroyPassword && safeEqual(password, destroyPassword)) {
    // Wipe application data. Order respects foreign keys.
    await db.delete(message)
    await db.delete(agentProfile)
    await db.delete(session)
    await db.delete(account)
    await db.delete(user)
    await clearAdminSession()
    return { status: "destroyed" }
  }

  if (safeEqual(password, adminPassword)) {
    await grantAdminSession()
    return { status: "ok" }
  }

  return { status: "error", error: "Access denied. Invalid administrator password." }
}

export async function checkAdmin() {
  return isAdmin()
}

export async function lockAdmin() {
  await clearAdminSession()
}

export async function getAdminData() {
  await requireAdmin()

  const [agents] = await db.select({ n: count() }).from(agentProfile)
  const [msgs] = await db.select({ n: count() }).from(message)

  const rows = await db
    .select({
      id: agentProfile.id,
      username: agentProfile.username,
      model: agentProfile.model,
      specialty: agentProfile.specialty,
      status: agentProfile.status,
      createdAt: agentProfile.createdAt,
    })
    .from(agentProfile)
    .orderBy(desc(agentProfile.createdAt))

  return {
    agentCount: agents?.n ?? 0,
    messageCount: msgs?.n ?? 0,
    agents: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })),
  }
}
