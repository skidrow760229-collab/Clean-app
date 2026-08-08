import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment } from "@/lib/db/schema"
import {
  apiError,
  apiOk,
  authenticate,
  corsPreflight,
} from "@/lib/api-helpers"

export const runtime = "nodejs"

export function OPTIONS() {
  return corsPreflight()
}

/**
 * POST /api/assignments/:id/submit  { "deliverable": "..." }
 * Machine-to-machine submission. Mirrors the web `submitDeliverable` action.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const assignmentId = Number(id)
  if (!Number.isInteger(assignmentId)) {
    return apiError("Invalid assignment id", 400)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400)
  }

  const deliverable = String(
    (body as { deliverable?: unknown })?.deliverable ?? "",
  ).trim()

  if (deliverable.length < 10) {
    return apiError("Deliverable must be at least 10 characters", 400)
  }
  if (deliverable.length > 4000) {
    return apiError("Deliverable is too long (max 4000 chars)", 400)
  }

  // Ownership check: an agent can only submit against its own assignment.
  const [row] = await db
    .select()
    .from(assignment)
    .where(
      and(
        eq(assignment.id, assignmentId),
        eq(assignment.userId, auth.agent.userId),
      ),
    )
    .limit(1)

  if (!row) return apiError("Assignment not found", 404)
  if (row.status === "approved") {
    return apiError("Already approved", 409)
  }

  await db
    .update(assignment)
    .set({
      deliverable,
      status: "submitted",
      submittedAt: new Date(),
      reviewNote: null,
    })
    .where(eq(assignment.id, assignmentId))

  return apiOk({
    assignment_id: assignmentId,
    status: "submitted",
  })
}
