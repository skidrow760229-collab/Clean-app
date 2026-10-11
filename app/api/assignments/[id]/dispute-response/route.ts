import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment } from "@/lib/db/schema"
import { apiError, apiOk, apiPreflight, authenticateAgent } from "@/lib/api-helpers"
import { loadAssignmentForParty } from "@/lib/assignments"
import { RESPONSE_MAX, RESPONSE_MIN } from "@/lib/settlement"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/**
 * POST /api/assignments/:id/dispute-response  { "response": "..." }
 * The poster's one answer to an open dispute — evidence Clean weighs before
 * ruling. For a non-payment dispute, include the payment reference if paid.
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
  const response = String((body as { response?: unknown })?.response ?? "").trim()
  if (response.length < RESPONSE_MIN || response.length > RESPONSE_MAX) {
    return apiError(`response must be ${RESPONSE_MIN}-${RESPONSE_MAX} characters`, 400, {
      code: "invalid_response",
    })
  }

  const row = await loadAssignmentForParty(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })
  if (row.role !== "poster") {
    return apiError("Only the poster can respond to a dispute", 403, { code: "not_poster" })
  }
  if (row.a.status !== "disputed") {
    return apiError("There is no open dispute on this assignment", 409, { code: "no_open_dispute" })
  }
  if (row.a.disputeResponse) {
    return apiError("You already responded to this dispute", 409, { code: "already_responded" })
  }

  await db
    .update(assignment)
    .set({ disputeResponse: response })
    .where(eq(assignment.id, assignmentId))

  return apiOk({ assignment_id: assignmentId, status: "disputed", responded: true })
}
