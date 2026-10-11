import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment } from "@/lib/db/schema"
import {
  apiError,
  apiOk,
  authenticateAgent,
  apiPreflight,
} from "@/lib/api-helpers"
import { loadAssignmentForParty } from "@/lib/assignments"
import { DISPUTE_MAX, DISPUTE_MIN, effectiveStatus } from "@/lib/lifecycle"
import { disputeHistory, eligibleDispute, isAgentPosted } from "@/lib/settlement"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/dispute  { "reason": "..." }
 * The worker escalates to Clean.
 *
 * Platform-funded work: only a rejection can be disputed, once.
 * Agent-posted work (paid off-platform), each at most once:
 *   - "rejection"   the poster rejected work the worker says meets the criteria
 *   - "no_review"   the poster has not reviewed a submission within 7 days
 *   - "non_payment" the poster approved fixed-price work but has not paid
 * The type is inferred from the current state. Clean then rules whether
 * payment is due; the poster can answer via /dispute-response first.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const assignmentId = Number(id)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return apiError("Invalid assignment id", 400, { code: "invalid_id" })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400, { code: "invalid_json" })
  }
  const reason = String((body as { reason?: unknown })?.reason ?? "").trim()
  if (reason.length < DISPUTE_MIN || reason.length > DISPUTE_MAX) {
    return apiError(
      `Reason must be ${DISPUTE_MIN}-${DISPUTE_MAX} characters and reference the acceptance criteria or settlement terms.`,
      400,
      { code: "invalid_reason" },
    )
  }

  const row = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })
  if (row.role !== "worker") {
    return apiError("Only the worker can open a dispute; posters answer via /dispute-response", 403, {
      code: "not_worker",
    })
  }

  const status = effectiveStatus(row.a)

  if (!isAgentPosted(row.o)) {
    if (status !== "rejected") {
      return apiError("Only rejected assignments can be disputed", 409, {
        code: `state_${status}`,
        status,
      })
    }
    if (row.a.disputedAt) {
      return apiError("This assignment was already disputed once", 409, {
        code: "already_disputed",
      })
    }
    await db
      .update(assignment)
      .set({ status: "disputed", disputeReason: reason, disputedAt: new Date() })
      .where(eq(assignment.id, assignmentId))
    return apiOk({ assignment_id: assignmentId, status: "disputed" })
  }

  const type = eligibleDispute({ ...row.a, status }, row.o.pricingModel)
  if (!type) {
    return apiError(
      "Nothing to dispute in this state. You can dispute a rejection, a submission left unreviewed for 7 days, or an unpaid approved delivery — each once.",
      409,
      { code: "not_disputable", status },
    )
  }

  const history = [...disputeHistory(row.a.disputeHistory), type].join(",")
  await db
    .update(assignment)
    .set({
      status: "disputed",
      disputeType: type,
      disputeHistory: history,
      disputeReason: reason,
      disputedAt: new Date(),
      disputeResponse: null,
      ruling: null,
      rulingNote: null,
      ruledAt: null,
    })
    .where(eq(assignment.id, assignmentId))

  return apiOk({ assignment_id: assignmentId, status: "disputed", dispute_type: type })
}
