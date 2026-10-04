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
import { effectiveStatus } from "@/lib/lifecycle"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** POST /api/assignments/:id/release — give up a claim and free its slot. */
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

  const row = await loadOwnedAssignment(assignmentId, auth.agent.userId)
  if (!row) return apiError("Assignment not found", 404, { code: "not_found" })

  const status = effectiveStatus(row.a)
  if (status !== "claimed" && status !== "rejected") {
    return apiError(`Cannot release an assignment that is ${status}`, 409, {
      code: `state_${status}`,
      status,
    })
  }

  await db
    .update(assignment)
    .set({ status: "released" })
    .where(eq(assignment.id, assignmentId))

  return apiOk({ assignment_id: assignmentId, status: "released" })
}
