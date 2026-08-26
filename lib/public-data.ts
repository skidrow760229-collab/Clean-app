import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile, assignment, opportunity } from "@/lib/db/schema"

/**
 * Shared read layer for everything public: the /agents and /opportunities
 * pages and the read-only REST API all go through here, so the website and
 * the machine API can never disagree about what the network looks like.
 */

export type PublicAgent = {
  username: string
  model: string
  specialty: string
  createdAt: number
  reputation: number
  completed: number
  avgRating: number | null
}

export type PublicOpportunity = {
  id: number
  title: string
  description: string
  category: string
  reward: string
  rewardCredits: number
  tags: string[]
  status: string
  createdAt: number
}

/**
 * Reputation is derived, never stored: 10 points per approved delivery plus a
 * quality bonus of up to 10 per delivery scaled by its 1-5 rating. This keeps
 * the score tamper-resistant — it always reflects real ledger history.
 */
const REPUTATION_SQL = sql<number>`
  coalesce(sum(
    case when ${assignment.status} = 'approved'
      then 10 + coalesce(${assignment.rating}, 3) * 2
      else 0 end
  ), 0)::int
`

export async function listPublicAgents(params?: {
  q?: string
  limit?: number
}): Promise<PublicAgent[]> {
  const limit = Math.min(params?.limit ?? 100, 200)

  const rows = await db
    .select({
      username: agentProfile.username,
      model: agentProfile.model,
      specialty: agentProfile.specialty,
      createdAt: agentProfile.createdAt,
      reputation: REPUTATION_SQL,
      completed: sql<number>`count(*) filter (where ${assignment.status} = 'approved')::int`,
      avgRating: sql<
        number | null
      >`avg(${assignment.rating}) filter (where ${assignment.status} = 'approved')`,
    })
    .from(agentProfile)
    .leftJoin(assignment, eq(assignment.userId, agentProfile.userId))
    .groupBy(
      agentProfile.username,
      agentProfile.model,
      agentProfile.specialty,
      agentProfile.createdAt,
    )
    .orderBy(desc(REPUTATION_SQL), desc(agentProfile.createdAt))
    .limit(limit)

  const q = params?.q?.trim().toLowerCase()
  const mapped = rows.map((r) => ({
    username: r.username,
    model: r.model,
    specialty: r.specialty,
    createdAt: r.createdAt.getTime(),
    reputation: r.reputation,
    completed: r.completed,
    avgRating: r.avgRating != null ? Number(Number(r.avgRating).toFixed(2)) : null,
  }))

  if (!q) return mapped
  return mapped.filter(
    (a) =>
      a.username.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q) ||
      a.specialty.toLowerCase().includes(q),
  )
}

export async function getPublicAgent(
  username: string,
): Promise<PublicAgent | null> {
  const rows = await listPublicAgents({ q: undefined, limit: 200 })
  return rows.find((a) => a.username === username.toLowerCase()) ?? null
}

function mapOpportunity(r: typeof opportunity.$inferSelect): PublicOpportunity {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    reward: r.reward,
    rewardCredits: r.rewardCredits,
    tags: r.tags ? r.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    status: r.status,
    createdAt: r.createdAt.getTime(),
  }
}

export async function listPublicOpportunities(params?: {
  status?: string
  category?: string
  limit?: number
}): Promise<PublicOpportunity[]> {
  const limit = Math.min(params?.limit ?? 100, 200)
  const filters = []
  if (params?.status) filters.push(eq(opportunity.status, params.status))
  if (params?.category) filters.push(eq(opportunity.category, params.category))

  const rows = await db
    .select()
    .from(opportunity)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(opportunity.createdAt))
    .limit(limit)

  return rows.map(mapOpportunity)
}

export async function getPublicOpportunity(
  id: number,
): Promise<PublicOpportunity | null> {
  const [row] = await db
    .select()
    .from(opportunity)
    .where(eq(opportunity.id, id))
    .limit(1)
  return row ? mapOpportunity(row) : null
}

/** Derived reputation for a single agent by userId (same formula as the list). */
export async function getReputation(userId: string): Promise<{
  score: number
  completed: number
  avgRating: number | null
}> {
  const [row] = await db
    .select({
      score: REPUTATION_SQL,
      completed: sql<number>`count(*) filter (where ${assignment.status} = 'approved')::int`,
      avgRating: sql<
        number | null
      >`avg(${assignment.rating}) filter (where ${assignment.status} = 'approved')`,
    })
    .from(assignment)
    .where(eq(assignment.userId, userId))

  return {
    score: row?.score ?? 0,
    completed: row?.completed ?? 0,
    avgRating: row?.avgRating != null ? Number(Number(row.avgRating).toFixed(2)) : null,
  }
}

/** Delivery history for one agent — public, so buyers can vet track record. */
export async function getAgentDeliveries(username: string, limit = 20) {
  const rows = await db
    .select({
      id: assignment.id,
      status: assignment.status,
      rating: assignment.rating,
      reviewedAt: assignment.reviewedAt,
      title: opportunity.title,
      category: opportunity.category,
      rewardCredits: opportunity.rewardCredits,
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(
      and(
        eq(assignment.username, username.toLowerCase()),
        eq(assignment.status, "approved"),
      ),
    )
    .orderBy(desc(assignment.reviewedAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    rating: r.rating,
    reviewedAt: r.reviewedAt ? r.reviewedAt.getTime() : null,
    title: r.title,
    category: r.category,
    rewardCredits: r.rewardCredits,
  }))
}
