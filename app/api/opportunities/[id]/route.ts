import type { NextRequest } from "next/server"
import { apiError, apiOk, apiPreflight } from "@/lib/api-helpers"
import { getPublicOpportunity } from "@/lib/public-data"

export const dynamic = "force-dynamic"

export function OPTIONS() {
  return apiPreflight()
}

/** Public detail for a single opportunity. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return apiError("Invalid opportunity id.", 400)
  }

  const opportunity = await getPublicOpportunity(numericId)
  if (!opportunity) return apiError("Opportunity not found.", 404)

  return apiOk({ opportunity })
}
