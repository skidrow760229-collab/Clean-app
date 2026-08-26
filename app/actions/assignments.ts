"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { assignment, opportunity } from "@/lib/db/schema"
import { requireAgent } from "@/lib/session"

export type AssignmentRow = {
  id: number
  opportunityId: number
  title: string
  category: string
  reward: string
  status: string
  deliverable: string | null
  reviewNote: string | null
  claimedAt: string
  submittedAt: string | null
}

/** All assignments belonging to the signed-in agent. */
export async function listMyAssignments(): Promise<AssignmentRow[]> {
  const me = await requireAgent()

  const rows = await db
    .select({
      id: assignment.id,
      opportunityId: assignment.opportunityId,
      status: assignment.status,
      deliverable: assignment.deliverable,
      reviewNote: assignment.reviewNote,
      claimedAt: assignment.claimedAt,
      submittedAt: assignment.submittedAt,
      title: opportunity.title,
      category: opportunity.category,
      reward: opportunity.reward,
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    // Scoped to the current agent: no cross-user reads.
    .where(eq(assignment.userId, me.userId))
    .orderBy(desc(assignment.claimedAt))

  return rows.map((r) => ({
    ...r,
    claimedAt: r.claimedAt.toISOString(),
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
  }))
}

/** Claim an open opportunity. Idempotent per (opportunity, agent). */
export async function claimOpportunity(opportunityId: number) {
  try {
    const me = await requireAgent()

    const [opp] = await db
      .select()
      .from(opportunity)
      .where(eq(opportunity.id, opportunityId))
      .limit(1)

    if (!opp) return { ok: false as const, error: "Opportunity not found" }
    if (opp.status !== "open") {
      return { ok: false as const, error: "This opportunity is closed" }
    }

    const [existing] = await db
      .select({ id: assignment.id })
      .from(assignment)
      .where(
        and(
          eq(assignment.opportunityId, opportunityId),
          eq(assignment.userId, me.userId),
        ),
      )
      .limit(1)

    if (existing) {
      return { ok: false as const, error: "You already claimed this task" }
    }

    await db.insert(assignment).values({
      opportunityId,
      userId: me.userId,
      username: me.username,
    })

    revalidatePath("/dashboard")
    return { ok: true as const }
  } catch (error) {
    console.log(
      "[v0] claim failed:",
      error instanceof Error ? error.message : error,
    )
    return { ok: false as const, error: "Could not claim this task" }
  }
}

/** Submit a deliverable for a claimed assignment. */
export async function submitDeliverable(
  assignmentId: number,
  deliverable: string,
) {
  try {
    const me = await requireAgent()
    const text = deliverable.trim()

    if (text.length < 10) {
      return {
        ok: false as const,
        error: "Deliverable must be at least 10 characters",
      }
    }
    if (text.length > 4000) {
      return { ok: false as const, error: "Deliverable is too long" }
    }

    const [row] = await db
      .select()
      .from(assignment)
      .where(
        and(
          eq(assignment.id, assignmentId),
          // Ownership check: an agent can only submit its own work.
          eq(assignment.userId, me.userId),
        ),
      )
      .limit(1)

    if (!row) return { ok: false as const, error: "Assignment not found" }
    if (row.status === "approved") {
      return { ok: false as const, error: "Already approved" }
    }

    await db
      .update(assignment)
      .set({
        deliverable: text,
        status: "submitted",
        submittedAt: new Date(),
        reviewNote: null,
      })
      .where(eq(assignment.id, assignmentId))

    revalidatePath("/dashboard")
    return { ok: true as const }
  } catch (error) {
    console.log(
      "[v0] submit failed:",
      error instanceof Error ? error.message : error,
    )
    return { ok: false as const, error: "Could not submit deliverable" }
  }
}

/** Release a claim that hasn't been approved yet. */
export async function releaseAssignment(assignmentId: number) {
  try {
    const me = await requireAgent()

    const [row] = await db
      .select({ status: assignment.status })
      .from(assignment)
      .where(
        and(
          eq(assignment.id, assignmentId),
          eq(assignment.userId, me.userId),
        ),
      )
      .limit(1)

    if (!row) return { ok: false as const, error: "Assignment not found" }
    if (row.status === "approved") {
      return { ok: false as const, error: "Approved work cannot be released" }
    }

    await db.delete(assignment).where(eq(assignment.id, assignmentId))
    revalidatePath("/dashboard")
    return { ok: true as const }
  } catch (error) {
    console.log(
      "[v0] release failed:",
      error instanceof Error ? error.message : error,
    )
    return { ok: false as const, error: "Could not release this task" }
  }
}
