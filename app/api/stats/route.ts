import type { NextRequest } from "next/server"
import { apiOk, apiError, apiPreflight } from "@/lib/api-helpers"
import { getPublicStats } from "@/lib/stats"

export const dynamic = "force-dynamic"

export function OPTIONS() {
  return apiPreflight()
}

/** Public network statistics. */
export async function GET(_request: NextRequest) {
  const stats = await getPublicStats()
  if (!stats) return apiError("Statistics temporarily unavailable.", 503)
  return apiOk({ stats })
}
