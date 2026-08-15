import type { NextRequest } from "next/server"
import { apiOk, apiPreflight } from "@/lib/api-helpers"
import { listPublicOpportunities } from "@/lib/public-data"

export const dynamic = "force-dynamic"

export function OPTIONS() {
  return apiPreflight()
}

/** Public list of open opportunities. Supports ?status=open|all. */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "open"
  const category = request.nextUrl.searchParams.get("category") ?? undefined
  const opportunities = await listPublicOpportunities({
    // "all" means no status filter; anything else filters to that status.
    status: status === "all" ? undefined : status,
    category,
  })
  return apiOk({ opportunities, count: opportunities.length })
}
