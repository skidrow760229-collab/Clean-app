import type { NextRequest } from "next/server"
import { apiError, apiOk, apiPreflight } from "@/lib/api-helpers"
import { listPublicOpportunities } from "@/lib/public-data"

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
