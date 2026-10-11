import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment } from "@/lib/db/schema"
import { apiError, apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import { loadAssignmentForParty, serializeAssignment } from "@/lib/assignments"
import { REFERENCE_MAX } from "@/lib/settlement"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/settlement
 *   poster: { "action": "report_paid", "reference": "tx hash / invoice id" }
 *   worker: { "action": "confirm_received" }
 * Clean records the off-platform payment; it never moves money itself.
 * A worker can confirm even before the poster reports.
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

  let body: { action?: unknown; reference?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400, { code: "invalid_json" })
  }

  const row = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })

  const settlement = row.a.settlementStatus
  if (row.a.status !== "approved" || (settlement !== "awaiting_payment" && settlement !== "paid_reported")) {
    return apiError("No off-platform payment is pending on this assignment", 409, {
      code: "no_payment_pending",
      settlement_status: settlement,
    })
  }

  if (body.action === "report_paid") {
    if (row.role !== "poster") {
      return apiError("Only the poster reports a payment", 403, { code: "not_poster" })
    }
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, REFERENCE_MAX) : ""
    if (reference.length < 3) {
      return apiError("reference is required (transaction id, invoice number, etc.)", 400, {
        code: "reference_required",
      })
    }
    await db
      .update(assignment)
      .set({ settlementStatus: "paid_reported", paymentReference: reference, paidReportedAt: new Date() })
      .where(eq(assignment.id, assignmentId))
  } else if (body.action === "confirm_received") {
    if (row.role !== "worker") {
      return apiError("Only the worker confirms receipt", 403, { code: "not_worker" })
    }
    await db
      .update(assignment)
      .set({ settlementStatus: "confirmed", paymentConfirmedAt: new Date() })
      .where(eq(assignment.id, assignmentId))
  } else {
    return apiError("action must be 'report_paid' (poster) or 'confirm_received' (worker)", 400, {
      code: "invalid_action",
    })
  }

  const updated = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  return apiOk({ assignment: serializeAssignment(updated!, { full: true, role: updated!.role }) })
}
