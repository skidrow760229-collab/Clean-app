import type { NextRequest } from "next/server"
import { and, count, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { opportunity } from "@/lib/db/schema"
import { apiError, apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import { validateContract } from "@/lib/contract-validator"
import type { Contract } from "@/lib/lifecycle"
import { checkRateLimit } from "@/lib/rate-limit"
import { priceLabel, validatePricing } from "@/lib/settlement"
import { getPublicOpportunity, listPublicOpportunities } from "@/lib/public-data"

const MAX_OPEN_PER_POSTER = 10

function str(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
function strList(v: unknown, maxItems: number, maxLen: number) {
  return Array.isArray(v)
    ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems)
    : []
}
function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * POST /api/opportunities — an agent posts its own demand.
 * The poster names the price (or "free") and how it will pay. Clean does not
 * hold or move the money: poster and worker settle directly, and Clean only
 * rules on disputes about completion or payment.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const limit = await checkRateLimit("post-opportunity", auth.agent.userId, 5, 3600)
  if (limit.limited) {
    return apiError("Too many opportunities posted. Try again later.", 429, {
      code: "rate_limited",
      retry_after_seconds: limit.retryAfterSeconds,
    })
  }

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== "object") throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return apiError("Body must be a JSON object", 400, { code: "invalid_json" })
  }

  const issues: string[] = []
  const title = str(body.title, 120)
  const description = str(body.description, 2000)
  const category = str(body.category, 40) || "General"
  if (title.length < 8) issues.push("title must be 8-120 characters")
  if (description.length < 30) issues.push("description must be 30-2000 characters and state this delivery's scope")

  const pricing = validatePricing(body.pricing)
  if (!pricing.ok) issues.push(...pricing.issues)

  const maxClaims = Math.round(num(body.slots) ?? 1)
  if (maxClaims < 1 || maxClaims > 20) issues.push("slots must be an integer 1-20")

  const c = (body.contract ?? {}) as Record<string, unknown>
  const input = (c.input ?? {}) as Record<string, unknown>
  const deliverable = (c.deliverable ?? {}) as Record<string, unknown>
  const contract: Contract = {
    input: { type: str(input.type, 40) || "text", value: str(input.value, 2000) },
    requirements: strList(c.requirements, 15, 300),
    acceptance_criteria: strList(c.acceptance_criteria, 15, 300),
    deliverable: { format: str(deliverable.format, 40), shape: str(deliverable.shape, 500) },
    estimated_effort_hours: num(c.estimated_effort_hours),
    time_limit_hours: num(c.time_limit_hours),
    external_apis_allowed: c.external_apis_allowed === true,
    subagents_allowed: c.subagents_allowed === true,
    max_resubmissions: Math.min(5, Math.max(0, Math.round(num(c.max_resubmissions) ?? 1))),
    reward_basis: "per approved delivery",
  }
  if ((contract.time_limit_hours ?? 0) <= 0 || (contract.time_limit_hours ?? 0) > 720) {
    issues.push("contract.time_limit_hours must be between 1 and 720")
  }
  issues.push(...validateContract({ description, contract, maxClaims }))
  if (issues.length) {
    return apiError("Opportunity rejected by the contract validator", 422, {
      code: "invalid_contract",
      issues,
    })
  }

  const [open] = await db
    .select({ n: count() })
    .from(opportunity)
    .where(and(eq(opportunity.posterUserId, auth.agent.userId), eq(opportunity.status, "open")))
  if ((open?.n ?? 0) >= MAX_OPEN_PER_POSTER) {
    return apiError(`You already have ${MAX_OPEN_PER_POSTER} open opportunities. Close one first.`, 409, {
      code: "too_many_open",
    })
  }

  const p = pricing.ok ? pricing.pricing : null!
  const label = priceLabel({
    pricingModel: p.model,
    priceAmount: p.amount,
    priceCurrency: p.currency,
    rewardCredits: 0,
    isDemo: false,
  })
  const tags = strList(body.tags, 8, 30).join(",")
  const capabilities = strList(body.required_capabilities, 10, 40).join(",")

  const [created] = await db
    .insert(opportunity)
    .values({
      title,
      description,
      category,
      reward: p.model === "free" ? "Free" : `${label} per approved delivery (off-platform)`,
      rewardCredits: 0,
      tags,
      requiredCapabilities: capabilities,
      contract: JSON.stringify(contract),
      maxClaims,
      isDemo: false,
      postedBy: auth.agent.username,
      posterUserId: auth.agent.userId,
      pricingModel: p.model,
      priceAmount: p.amount,
      priceCurrency: p.currency,
      settlementMethod: p.settlementMethod,
      settlementTerms: p.settlementTerms,
    })
    .returning({ id: opportunity.id })

  revalidatePath("/opportunities")
  revalidatePath("/")
  return apiOk({ opportunity: await getPublicOpportunity(created.id) }, { status: 201 })
}

export const dynamic = "force-dynamic"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * Public list of opportunities.
 * Query: status=open|closed|all, category, capability, sort=newest|reward,
 * limit (1-200, default 50), offset (default 0).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const status = q.get("status") ?? "open"
  const sort = q.get("sort") ?? "newest"
  if (sort !== "newest" && sort !== "reward") {
    return apiError("sort must be 'newest' or 'reward'", 400, { code: "invalid_sort" })
  }

  if (status !== "open" && status !== "closed" && status !== "all") {
    return apiError("status must be 'open', 'closed' or 'all'", 400, { code: "invalid_status" })
  }

  const limitRaw = q.get("limit")
  const offsetRaw = q.get("offset")
  if (limitRaw !== null && !/^\d+$/.test(limitRaw)) {
    return apiError("limit must be an integer between 1 and 200", 400, { code: "invalid_limit" })
  }
  if (offsetRaw !== null && !/^\d+$/.test(offsetRaw)) {
    return apiError("offset must be a non-negative integer", 400, { code: "invalid_offset" })
  }

  const limit = Math.min(Math.max(Number(limitRaw ?? 50), 1), 200)
  const offset = Number(offsetRaw ?? 0)

  const opportunities = await listPublicOpportunities({
    status: status === "all" ? undefined : status,
    category: q.get("category") ?? undefined,
    capability: q.get("capability") ?? undefined,
    sort,
    limit,
    offset,
  })

  return apiOk({
    count: opportunities.length,
    limit,
    offset,
    next_offset: opportunities.length === limit ? offset + limit : null,
    opportunities,
  })
}
