import "server-only"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile, assignment, opportunity } from "@/lib/db/schema"
import {
  type Contract,
  parseContract,
  SLOT_HOLDING,
  splitList,
} from "@/lib/lifecycle"

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
  requiredCapabilities: string[]
  contract: Contract
  maxClaims: number
  activeClaims: number
  slotsRemaining: number
  deadline: number | null
  isDemo: boolean
  postedBy: string
}

/**
 * Reputation is derived, never stored, so it always reflects real history:
 *   +10 per approved delivery, +2 per rating point (1-5, default 3),
 *   −5 per delivery whose rejection was upheld (status "closed").
 */
const REPUTATION_SQL = sql<number>`
  greatest(coalesce(sum(
    case
      when ${assignment.status} = 'approved' then 10 + coalesce(${assignment.rating}, 3) * 2
      when ${assignment.status} = 'closed' then -5
      else 0 end
  ), 0), 0)::int
`

const SLOT_LIST = sql.raw(SLOT_HOLDING.map((s) => `'${s}'`).join(","))

/** Active claims holding a slot; past-due "claimed" rows free their slot. */
const ACTIVE_CLAIMS_SQL = sql<number>`(
  select count(*)::int from ${assignment} a
  where a."opportunityId" = ${opportunity.id}
    and a.status in (${SLOT_LIST})
    and not (a.status = 'claimed' and a."dueAt" is not null and a."dueAt" < now())
)`

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

function mapOpportunity(
  r: typeof opportunity.$inferSelect & { activeClaims: number },
): PublicOpportunity {
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
    requiredCapabilities: splitList(r.requiredCapabilities),
    contract: parseContract(r.contract),
    maxClaims: r.maxClaims,
    activeClaims: r.activeClaims,
    slotsRemaining: Math.max(0, r.maxClaims - r.activeClaims),
    deadline: r.deadline ? r.deadline.getTime() : null,
    isDemo: r.isDemo,
    postedBy: r.postedBy,
  }
}

export type OpportunitySort = "newest" | "reward"

export async function listPublicOpportunities(params?: {
  status?: string
  category?: string
  capability?: string
  sort?: OpportunitySort
  limit?: number
  offset?: number
}): Promise<PublicOpportunity[]> {
  const limit = Math.min(Math.max(params?.limit ?? 100, 1), 200)
  const offset = Math.max(params?.offset ?? 0, 0)
  const filters = []
  if (params?.status) filters.push(eq(opportunity.status, params.status))
  if (params?.category) filters.push(eq(opportunity.category, params.category))
  const capability = params?.capability?.trim().toLowerCase()
  if (capability) {
    filters.push(
      sql`(',' || lower(${opportunity.requiredCapabilities}) || ',' || lower(${opportunity.tags}) || ',') like ${`%,${capability},%`}`,
    )
  }

  const rows = await db
    .select({ o: opportunity, activeClaims: ACTIVE_CLAIMS_SQL })
    .from(opportunity)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      params?.sort === "reward"
        ? desc(opportunity.rewardCredits)
        : desc(opportunity.createdAt),
      asc(opportunity.id),
    )
    .limit(limit)
    .offset(offset)

  return rows.map((r) => mapOpportunity({ ...r.o, activeClaims: r.activeClaims }))
}

export async function getPublicOpportunity(
  id: number,
): Promise<PublicOpportunity | null> {
  const [row] = await db
    .select({ o: opportunity, activeClaims: ACTIVE_CLAIMS_SQL })
    .from(opportunity)
    .where(eq(opportunity.id, id))
    .limit(1)
  return row ? mapOpportunity({ ...row.o, activeClaims: row.activeClaims }) : null
}

/** Active claim count for one opportunity (used to enforce maxClaims). */
export async function countActiveClaims(opportunityId: number) {
  const [row] = await db
    .select({ n: ACTIVE_CLAIMS_SQL })
    .from(opportunity)
    .where(eq(opportunity.id, opportunityId))
  return row?.n ?? 0
}

/** Derived reputation for a single agent by userId (same formula as the list). */
export async function getReputation(userId: string): Promise<{
  score: number
  completed: number
  avgRating: number | null
  rejectedFinal: number
  disputes: number
  /** approved / (approved + rejected-final); null until something is decided. */
  successRate: number | null
  /** approved deliveries submitted before their due time. */
  onTimeRate: number | null
}> {
  const [row] = await db
    .select({
      score: REPUTATION_SQL,
      completed: sql<number>`count(*) filter (where ${assignment.status} = 'approved')::int`,
      avgRating: sql<
        number | null
      >`avg(${assignment.rating}) filter (where ${assignment.status} = 'approved')`,
      rejectedFinal: sql<number>`count(*) filter (where ${assignment.status} = 'closed')::int`,
      disputes: sql<number>`count(*) filter (where ${assignment.disputedAt} is not null)::int`,
      onTime: sql<number>`count(*) filter (where ${assignment.status} = 'approved' and (${assignment.dueAt} is null or ${assignment.submittedAt} <= ${assignment.dueAt}))::int`,
    })
    .from(assignment)
    .where(eq(assignment.userId, userId))

  const completed = row?.completed ?? 0
  const rejectedFinal = row?.rejectedFinal ?? 0
  const decided = completed + rejectedFinal
  return {
    score: row?.score ?? 0,
    completed,
    avgRating: row?.avgRating != null ? Number(Number(row.avgRating).toFixed(2)) : null,
    rejectedFinal,
    disputes: row?.disputes ?? 0,
    successRate: decided ? Number((completed / decided).toFixed(3)) : null,
    onTimeRate: completed ? Number(((row?.onTime ?? 0) / completed).toFixed(3)) : null,
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
