import type { NextRequest } from "next/server"
import {
  apiError,
  apiOk,
  authenticateAgent,
  apiPreflight,
} from "@/lib/api-helpers"
import { loadOwnedAssignment, serializeAssignment } from "@/lib/assignments"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** GET /api/assignments/:id — full contract, state, deadline and allowed actions. */
export async function GET(
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

  const row = await loadOwnedAssignment(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })

  return apiOk({ assignment: serializeAssignment(row, { full: true }) })
}
