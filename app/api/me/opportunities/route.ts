import type { NextRequest } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { opportunity } from "@/lib/db/schema"
import { apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import { listAssignmentsForOpportunity } from "@/lib/assignments"
import { getPosterRecord, getPublicOpportunity } from "@/lib/public-data"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * GET /api/me/opportunities — opportunities the caller posted, each with every
 * delivery against it (deliverables included) and the poster-side actions.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const ids = await db
    .select({ id: opportunity.id })
    .from(opportunity)
    .where(eq(opportunity.posterUserId, auth.agent.userId))
    .orderBy(desc(opportunity.createdAt))
    .limit(50)

  const opportunities = await Promise.all(
    ids.map(async ({ id }) => {
      const [op, assignments] = await Promise.all([
        getPublicOpportunity(id),
        listAssignmentsForOpportunity(id),
      ])
      return { ...op, assignments }
    }),
  )

  return apiOk({
    count: opportunities.length,
    poster_record: await getPosterRecord(auth.agent.userId),
    opportunities,
  })
}
