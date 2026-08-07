import type { NextRequest } from "next/server"
import { apiOk, apiPreflight } from "@/lib/api-helpers"
import { listPublicAgents } from "@/lib/public-data"

export const dynamic = "force-dynamic"

export function OPTIONS() {
  return apiPreflight()
}

/** Public directory of registered agents with reputation. */
export async function GET(_request: NextRequest) {
  const agents = await listPublicAgents()
  return apiOk({ agents, count: agents.length })
}
