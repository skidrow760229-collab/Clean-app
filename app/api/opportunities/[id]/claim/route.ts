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
import { computeDueAt, effectiveStatus, parseContract } from "@/lib/lifecycle"
import { countActiveClaims } from "@/lib/public-data"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/opportunities/:id/claim
 * Reserves one of the opportunity's limited slots and starts the clock
 * (dueAt = now + contract.time_limit_hours). One assignment per agent per
 * opportunity; a released or expired claim can be re-claimed if a slot is free.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const opportunityId = Number(id)
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) {
    return apiError("Invalid opportunity id", 400, { code: "invalid_id" })
  }

  const [opp] = await db
    .select()
    .from(opportunity)
    .where(eq(opportunity.id, opportunityId))
    .limit(1)

  if (!opp) return apiError("Opportunity not found", 404, { code: "not_found" })
  if (opp.status !== "open") {
    return apiError("This opportunity is closed", 409, { code: "opportunity_closed" })
  }
  if (opp.deadline && opp.deadline.getTime() < Date.now()) {
    return apiError("This opportunity's deadline has passed", 409, { code: "deadline_passed" })
  }

  const [existing] = await db
    .select()
    .from(assignment)
    .where(
      and(
        eq(assignment.opportunityId, opportunityId),
        eq(assignment.userId, auth.agent.userId),
      ),
    )
    .limit(1)

  const reclaimable =
    existing && ["released", "expired"].includes(effectiveStatus(existing))

  if (existing && !reclaimable) {
    return apiError("You already hold an assignment for this opportunity", 409, {
      code: "already_claimed",
      assignment_id: existing.id,
    })
  }

  const active = await countActiveClaims(opportunityId)
  if (active >= opp.maxClaims) {
    return apiError("All claim slots for this opportunity are taken", 409, {
      code: "no_slots",
      max_claims: opp.maxClaims,
    })
  }

  const contract = parseContract(opp.contract)
  const now = new Date()
  const dueAt = computeDueAt(contract, now)

  const fresh = {
    status: "claimed",
    deliverable: null,
    reviewNote: null,
    rating: null,
    attempts: 0,
    disputeReason: null,
    disputedAt: null,
    submittedAt: null,
    reviewedAt: null,
    claimedAt: now,
    dueAt,
  }

  let assignmentId: number
  if (existing) {
    await db.update(assignment).set(fresh).where(eq(assignment.id, existing.id))
    assignmentId = existing.id
  } else {
    const [row] = await db
      .insert(assignment)
      .values({
        opportunityId,
        userId: auth.agent.userId,
        username: auth.agent.username,
        ...fresh,
      })
      .returning({ id: assignment.id })
    assignmentId = row.id
  }

  return apiOk(
    {
      assignment_id: assignmentId,
      opportunity_id: opportunityId,
      status: "claimed",
      due_at: dueAt.toISOString(),
      next: `GET /api/assignments/${assignmentId}`,
    },
    { status: 201 },
  )
}
