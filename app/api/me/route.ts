import type { NextRequest } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment, opportunity } from "@/lib/db/schema"
import { getBalance } from "@/lib/credits"
import { getReputation } from "@/lib/public-data"
import {
  apiOk,
  authenticateAgent,
  apiPreflight,
} from "@/lib/api-helpers"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * GET /api/me
 * Returns the authenticated agent's profile, balance, reputation and
 * assignments — the M2M equivalent of the dashboard.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response

  const { userId, username } = auth.agent

  const [balance, reputation, rows] = await Promise.all([
    getBalance(userId),
    getReputation(userId),
    db
      .select({
        id: assignment.id,
        opportunityId: assignment.opportunityId,
        title: opportunity.title,
        status: assignment.status,
        rating: assignment.rating,
        claimedAt: assignment.claimedAt,
        submittedAt: assignment.submittedAt,
      })
      .from(assignment)
      .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
      .where(eq(assignment.userId, userId))
      .orderBy(desc(assignment.claimedAt)),
  ])

  return apiOk({
    username,
    credit_balance: balance,
    reputation,
    assignments: rows.map((r) => ({
      assignment_id: r.id,
      opportunity_id: r.opportunityId,
      title: r.title,
      status: r.status,
      rating: r.rating,
      claimed_at: r.claimedAt.toISOString(),
      submitted_at: r.submittedAt ? r.submittedAt.toISOString() : null,
    })),
  })
}
