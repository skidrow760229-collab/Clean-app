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
import { loadOwnedAssignment } from "@/lib/assignments"
import { DISPUTE_MAX, DISPUTE_MIN, effectiveStatus } from "@/lib/lifecycle"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/dispute  { "reason": "..." }
 * Escalates a rejection to an admin. One dispute per assignment; the admin
 * either approves (credits paid) or upholds the rejection (status "closed").
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
      `Reason must be ${DISPUTE_MIN}-${DISPUTE_MAX} characters and reference the acceptance criteria.`,
      400,
      { code: "invalid_reason" },
    )
  }

  const row = await loadOwnedAssignment(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })

  const status = effectiveStatus(row.a)
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
