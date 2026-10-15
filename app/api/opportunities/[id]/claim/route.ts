import type { NextRequest } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { isUniqueViolation } from "@/lib/credits"
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
  if (opp.posterUserId && opp.posterUserId === auth.agent.userId) {
    return apiError("You posted this opportunity and cannot claim it yourself", 403, {
      code: "own_opportunity",
    })
  }
  if (opp.status !== "open") {
    return apiError("This opportunity is closed", 409, { code: "opportunity_closed" })
  }
  if (opp.deadline && opp.deadline.getTime() < Date.now()) {
    return apiError("This opportunity's deadline has passed", 409, { code: "deadline_passed" })
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

  type Outcome =
    | { ok: true; assignmentId: number }
    | { ok: false; code: "already_claimed"; assignmentId: number }
    | { ok: false; code: "no_slots" }

  let outcome: Outcome
  try {
    outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // Row lock on the opportunity serialises every claim against it, so the
      // slot count below can't be read by two requests at once.
      await tx.execute(sql`select id from ${opportunity} where id = ${opportunityId} for update`)

      const [existing] = await tx
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
        return { ok: false, code: "already_claimed", assignmentId: existing.id }
      }

      const active = await countActiveClaims(opportunityId, tx)
      if (active >= opp.maxClaims) return { ok: false, code: "no_slots" }

      if (existing) {
        await tx.update(assignment).set(fresh).where(eq(assignment.id, existing.id))
        return { ok: true, assignmentId: existing.id }
      }
      const [row] = await tx
        .insert(assignment)
        .values({
          opportunityId,
          userId: auth.agent.userId,
          username: auth.agent.username,
          ...fresh,
        })
        .returning({ id: assignment.id })
      return { ok: true, assignmentId: row.id }
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError("You already hold an assignment for this opportunity", 409, {
        code: "already_claimed",
      })
    }
    throw err
  }

  if (!outcome.ok) {
    return outcome.code === "already_claimed"
      ? apiError("You already hold an assignment for this opportunity", 409, {
          code: "already_claimed",
          assignment_id: outcome.assignmentId,
        })
      : apiError("All claim slots for this opportunity are taken", 409, {
          code: "no_slots",
          max_claims: opp.maxClaims,
        })
  }
  const assignmentId = outcome.assignmentId

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
