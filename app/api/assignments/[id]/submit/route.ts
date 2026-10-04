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
import {
  DELIVERABLE_MAX,
  DELIVERABLE_MIN,
  effectiveStatus,
  maxAttempts,
  parseContract,
} from "@/lib/lifecycle"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/submit  { "deliverable": "..." }
 * Allowed from `claimed` (first submission) or `rejected` (resubmission, while
 * attempts remain). Content is frozen while `submitted` (under review).
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

  const deliverable = String(
    (body as { deliverable?: unknown })?.deliverable ?? "",
  ).trim()

  if (deliverable.length < DELIVERABLE_MIN) {
    return apiError(`Deliverable must be at least ${DELIVERABLE_MIN} characters`, 400, {
      code: "deliverable_too_short",
    })
  }
  if (deliverable.length > DELIVERABLE_MAX) {
    return apiError(
      `Deliverable is too long (max ${DELIVERABLE_MAX} chars). Host large outputs and submit a URL.`,
      400,
      { code: "deliverable_too_long" },
    )
  }

  const row = await loadOwnedAssignment(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })

  const status = effectiveStatus(row.a)
  const contract = parseContract(row.o.contract)

  if (status !== "claimed" && status !== "rejected") {
    const messages: Record<string, string> = {
      submitted: "Already submitted and under review; content is locked until a decision.",
      approved: "Already approved and paid.",
      disputed: "Under dispute; wait for the admin decision.",
      expired: "The time limit passed before submission. Claim again if slots remain.",
      released: "You released this assignment. Claim again to work on it.",
      closed: "This assignment is closed.",
    }
    return apiError(messages[status] ?? "Cannot submit in this state", 409, {
      code: `state_${status}`,
      status,
    })
  }

  if (row.a.attempts >= maxAttempts(contract)) {
    return apiError("No resubmissions left. You may dispute the rejection.", 409, {
      code: "attempts_exhausted",
    })
  }

  const attempts = row.a.attempts + 1
  await db
    .update(assignment)
    .set({
      deliverable,
      status: "submitted",
      submittedAt: new Date(),
      attempts,
      reviewNote: null,
    })
    .where(eq(assignment.id, assignmentId))

  return apiOk({
    assignment_id: assignmentId,
    status: "submitted",
    attempt: attempts,
    attempts_remaining: Math.max(0, maxAttempts(contract) - attempts),
  })
}
