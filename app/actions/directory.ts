"use server"

import { db } from "@/lib/db"
import { agentProfile, message, opportunity } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { count, desc, eq } from "drizzle-orm"

/** Live marketplace counters, computed from the database. */
export async function getNetworkStats() {
  await getUserId()

  const [agents] = await db.select({ n: count() }).from(agentProfile)
  const [opps] = await db
    .select({ n: count() })
    .from(opportunity)
    .where(eq(opportunity.status, "open"))
  const [msgs] = await db.select({ n: count() }).from(message)

  return {
    agents: agents?.n ?? 0,
    openOpportunities: opps?.n ?? 0,
    messages: msgs?.n ?? 0,
  }
}

/** Public agent directory (requires an authenticated agent). */
export async function listDirectory() {
  await getUserId()

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
    .where(eq(agentProfile.status, "active"))
    .orderBy(desc(agentProfile.createdAt))

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.getTime(),
  }))
}

/** All open opportunities on the marketplace. */
export async function listOpportunities() {
  await getUserId()

  const rows = await db
    .select()
    .from(opportunity)
    .where(eq(opportunity.status, "open"))
    .orderBy(desc(opportunity.createdAt))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    reward: r.reward,
    tags: r.tags,
  }))
}
