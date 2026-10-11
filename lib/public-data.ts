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
import { CONTRACT_SCHEMA_VERSION, validateContract } from "@/lib/contract-validator"
import { isAgentPosted, priceLabel } from "@/lib/settlement"

export type PosterRecord = {
  posted: number
  approvedDeliveries: number
  /** Deliveries the worker confirmed were paid. */
  paymentsConfirmed: number
  /** Approved, priced deliveries not yet confirmed paid. */
  paymentsOutstanding: number
  /** Disputes Clean ruled in the worker's favour (payment was owed). */
  rulingsAgainst: number
  rulingsInFavour: number
}

/**
 * Public payment record of an agent acting as a poster. Clean cannot force an
 * off-platform payment, so this record is the enforcement: every ruling and
 * every unconfirmed payment is visible to agents deciding whether to claim.
 */
export async function getPosterRecord(posterUserId: string): Promise<PosterRecord> {
  const [row] = await db
    .select({
      posted: sql<number>`count(distinct ${opportunity.id})::int`,
      approved: sql<number>`count(${assignment.id}) filter (where ${assignment.status} = 'approved')::int`,
      confirmed: sql<number>`count(${assignment.id}) filter (where ${assignment.settlementStatus} = 'confirmed')::int`,
      outstanding: sql<number>`count(${assignment.id}) filter (where ${assignment.status} in ('approved','disputed') and ${assignment.settlementStatus} in ('awaiting_payment','paid_reported'))::int`,
      against: sql<number>`count(${assignment.id}) filter (where ${assignment.ruling} = 'payment_due')::int`,
      favour: sql<number>`count(${assignment.id}) filter (where ${assignment.ruling} = 'not_due')::int`,
    })
    .from(opportunity)
    .leftJoin(assignment, eq(assignment.opportunityId, opportunity.id))
    .where(eq(opportunity.posterUserId, posterUserId))
  return {
    posted: row?.posted ?? 0,
    approvedDeliveries: row?.approved ?? 0,
    paymentsConfirmed: row?.confirmed ?? 0,
    paymentsOutstanding: row?.outstanding ?? 0,
    rulingsAgainst: row?.against ?? 0,
    rulingsInFavour: row?.favour ?? 0,
  }
}

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
  /**
   * "platform_demo" = seeded by Clean, no external buyer;
   * "agent" = posted by another agent that pays off-platform;
   * "buyer" = other real demand paid in Clean credits.
   */
  source: "buyer" | "platform_demo" | "agent"
  /** "platform_credits" for demo work, "credits" for credit-funded work, "off_platform" for agent-priced work. */
  rewardUnit: "credits" | "platform_credits" | "off_platform"
  /** Short price label, e.g. "25 USDC", "Free", "2,900 platform credits". */
  price: string
  pricing: {
    model: string
    amount: string | null
    currency: string | null
    settlementMethod: string | null
    settlementTerms: string | null
    /** True when Clean does not move the money; poster and worker settle directly. */
    offPlatform: boolean
  }
  postedBy: string
  schemaVersion: number
  /** Empty when the contract is complete and consistent. Open listings only include valid ones. */
  contractIssues: string[]
  /** Poster's public payment record; only on single-opportunity reads of agent-posted work. */
  posterRecord?: PosterRecord
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
  const contract = parseContract(r.contract)
  const amount = r.rewardCredits.toLocaleString("en-US")
  const agentPosted = isAgentPosted(r)
  const price = priceLabel(r)
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    reward: agentPosted
      ? r.pricingModel === "free"
        ? "Free — no payment for this work"
        : `${price} per approved delivery, paid by the poster off-platform`
      : r.isDemo
        ? `${amount} platform credits per approved delivery (demo, not cash)`
        : `${amount} credits per approved delivery`,
    price,
    pricing: {
      model: r.pricingModel,
      amount: r.priceAmount,
      currency: r.priceCurrency,
      settlementMethod: r.settlementMethod,
      settlementTerms: r.settlementTerms,
      offPlatform: agentPosted,
    },
    rewardCredits: r.rewardCredits,
    tags: r.tags ? r.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    status: r.status,
    createdAt: r.createdAt.getTime(),
    requiredCapabilities: splitList(r.requiredCapabilities),
    contract,
    maxClaims: r.maxClaims,
    activeClaims: r.activeClaims,
    slotsRemaining: Math.max(0, r.maxClaims - r.activeClaims),
    deadline: r.deadline ? r.deadline.getTime() : null,
    isDemo: r.isDemo,
    source: agentPosted ? "agent" : r.isDemo ? "platform_demo" : "buyer",
    rewardUnit: agentPosted ? "off_platform" : r.isDemo ? "platform_credits" : "credits",
    postedBy: r.postedBy,
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    contractIssues: validateContract({
      description: r.description,
      contract,
      // Agent-priced work is not paid in credits, so there is no credit amount to check.
      rewardCredits: agentPosted ? undefined : r.rewardCredits,
    }),
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

  const mapped = rows.map((r) => mapOpportunity({ ...r.o, activeClaims: r.activeClaims }))
  // An incomplete or self-contradictory contract is never advertised as open work.
  return mapped.filter((o) => o.status !== "open" || o.contractIssues.length === 0)
}

export async function getPublicOpportunity(
  id: number,
): Promise<PublicOpportunity | null> {
  const [row] = await db
    .select({ o: opportunity, activeClaims: ACTIVE_CLAIMS_SQL })
    .from(opportunity)
    .where(eq(opportunity.id, id))
    .limit(1)
  if (!row) return null
  const mapped = mapOpportunity({ ...row.o, activeClaims: row.activeClaims })
  if (row.o.posterUserId) mapped.posterRecord = await getPosterRecord(row.o.posterUserId)
  return mapped
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
