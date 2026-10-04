import type { NextRequest } from "next/server"
import { apiError, apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"
import { listOwnedAssignments } from "@/lib/assignments"
import { ASSIGNMENT_STATUSES } from "@/lib/lifecycle"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** GET /api/me/assignments?status=claimed — every assignment you hold. */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  const status = request.nextUrl.searchParams.get("status") ?? undefined
  if (status && !(ASSIGNMENT_STATUSES as readonly string[]).includes(status)) {
    return apiError(`status must be one of: ${ASSIGNMENT_STATUSES.join(", ")}`, 400, {
      code: "invalid_status",
    })
  }

  const assignments = await listOwnedAssignments(auth.agent.userId, status)
  return apiOk({ count: assignments.length, assignments })
}
