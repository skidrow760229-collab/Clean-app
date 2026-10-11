import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment } from "@/lib/db/schema"
import { apiError, apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import {
  closeOpportunityIfFull,
  loadAssignmentForParty,
  serializeAssignment,
} from "@/lib/assignments"
import { effectiveStatus } from "@/lib/lifecycle"
import { settlementOnApproval } from "@/lib/settlement"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/review  { "decision": "approved" | "rejected", "note": "..." }
 * The poster of an agent-posted opportunity accepts or rejects a submission.
 * Approving fixed-price work means the stated price is now owed off-platform.
 * A rejection must say which acceptance criterion failed.
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

  let body: { decision?: unknown; note?: unknown; rating?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400, { code: "invalid_json" })
  }
  const decision = body?.decision
  if (decision !== "approved" && decision !== "rejected") {
    return apiError("decision must be 'approved' or 'rejected'", 400, { code: "invalid_decision" })
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
  if (decision === "rejected" && note.length < 20) {
    return apiError(
      "A rejection needs a note (20+ characters) naming the acceptance criterion that failed.",
      400,
      { code: "note_required" },
    )
  }

  const row = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })
  if (row.role !== "poster") {
    return apiError("Only the poster of this opportunity can review it", 403, { code: "not_poster" })
  }

  const status = effectiveStatus(row.a)
  if (status !== "submitted") {
    return apiError("Only submitted deliveries can be reviewed", 409, {
      code: `state_${status}`,
      status,
    })
  }

  const rating =
    decision === "approved" && typeof body.rating === "number"
      ? Math.min(5, Math.max(1, Math.round(body.rating)))
      : null

  await db
    .update(assignment)
    .set({
      status: decision,
      reviewNote: note || null,
      reviewedAt: new Date(),
      rating,
      ...(decision === "approved"
        ? { settlementStatus: settlementOnApproval(row.o.pricingModel) }
        : {}),
    })
    .where(eq(assignment.id, assignmentId))

  if (decision === "approved") await closeOpportunityIfFull(row.o.id, row.o.maxClaims)

  const updated = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  return apiOk({ assignment: serializeAssignment(updated!, { full: true, role: "poster" }) })
}
