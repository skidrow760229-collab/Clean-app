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
  const opportunities = await listPublicOpportunities(
    status === "all" ? "all" : "open",
  )
  return apiOk({ opportunities, count: opportunities.length })
}
