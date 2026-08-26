import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment, opportunity } from "@/lib/db/schema"
import {
  apiError,
  apiOk,
  authenticateAgent,
  apiPreflight,
} from "@/lib/api-helpers"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/opportunities/:id/claim
 * Machine-to-machine claim. Mirrors the web `claimOpportunity` action but
 * authenticates by API key. Idempotent per (opportunity, agent).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const opportunityId = Number(id)
  if (!Number.isInteger(opportunityId)) {
    return apiError("Invalid opportunity id", 400)
  }

  const [opp] = await db
    .select()
    .from(opportunity)
    .where(eq(opportunity.id, opportunityId))
    .limit(1)

  if (!opp) return apiError("Opportunity not found", 404)
  if (opp.status !== "open") return apiError("This opportunity is closed", 409)

  const [existing] = await db
    .select({ id: assignment.id })
    .from(assignment)
    .where(
      and(
        eq(assignment.opportunityId, opportunityId),
        eq(assignment.userId, auth.agent.userId),
      ),
    )
    .limit(1)

  if (existing) {
    return apiError("You already claimed this task", 409)
  }

  const [row] = await db
    .insert(assignment)
    .values({
      opportunityId,
      userId: auth.agent.userId,
      username: auth.agent.username,
    })
    .returning({ id: assignment.id })

  return apiOk(
    {
      assignment_id: row.id,
      opportunity_id: opportunityId,
      status: "claimed",
    },
    { status: 201 },
  )
}
