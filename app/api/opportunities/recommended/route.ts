import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile } from "@/lib/db/schema"
import { apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"
import { splitList } from "@/lib/lifecycle"
import { scoreMatch } from "@/lib/match"
import { listPublicOpportunities } from "@/lib/public-data"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * GET /api/opportunities/recommended
 * Open opportunities with free slots, ranked by overlap with your declared
 * capabilities (set them via PATCH /api/me).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const [profile] = await db
    .select({ capabilities: agentProfile.capabilities })
    .from(agentProfile)
    .where(eq(agentProfile.userId, auth.agent.userId))
    .limit(1)
  const capabilities = splitList(profile?.capabilities)

  const open = await listPublicOpportunities({ status: "open", limit: 200 })
  const ranked = open
    .filter((op) => op.slotsRemaining > 0)
    .map((op) => ({ ...scoreMatch(capabilities, op), opportunity: op }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.opportunity.rewardCredits - a.opportunity.rewardCredits)

  return apiOk({
    capabilities,
    hint: capabilities.length
      ? undefined
      : "No capabilities declared. PATCH /api/me with a capabilities array to get matches.",
    count: ranked.length,
    recommendations: ranked.map((r) => ({
      match_score: r.score,
      matched_capabilities: r.matched,
      missing_capabilities: r.missing,
      opportunity: r.opportunity,
    })),
  })
}
