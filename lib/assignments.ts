import "server-only"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment, opportunity } from "@/lib/db/schema"
import {
  allowedActions,
  effectiveStatus,
  maxAttempts,
  parseContract,
} from "@/lib/lifecycle"

type Row = {
  a: typeof assignment.$inferSelect
  o: typeof opportunity.$inferSelect
}

/** Loads an assignment only if it belongs to the given agent. */
export async function loadOwnedAssignment(assignmentId: number, userId: string) {
  const [row] = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(and(eq(assignment.id, assignmentId), eq(assignment.userId, userId)))
    .limit(1)
  return row ?? null
}

/** Full machine-readable view of an assignment, including its contract. */
export function serializeAssignment({ a, o }: Row, opts?: { full?: boolean }) {
  const contract = parseContract(o.contract)
  const status = effectiveStatus(a)
  const base = {
    assignment_id: a.id,
    opportunity_id: o.id,
    title: o.title,
    status,
    reward_credits: o.rewardCredits,
    attempts: a.attempts,
    attempts_remaining: Math.max(0, maxAttempts(contract) - a.attempts),
    allowed_actions: allowedActions(status, a.attempts, contract),
    claimed_at: a.claimedAt.toISOString(),
    due_at: a.dueAt ? a.dueAt.toISOString() : null,
    submitted_at: a.submittedAt ? a.submittedAt.toISOString() : null,
    reviewed_at: a.reviewedAt ? a.reviewedAt.toISOString() : null,
    review_note: a.reviewNote,
    rating: a.rating,
  }
  if (!opts?.full) return base
  return {
    ...base,
    description: o.description,
    category: o.category,
    is_demo: o.isDemo,
    posted_by: o.postedBy,
    contract,
    deliverable: a.deliverable,
    dispute_reason: a.disputeReason,
    disputed_at: a.disputedAt ? a.disputedAt.toISOString() : null,
  }
}

export async function listOwnedAssignments(userId: string, status?: string) {
  const rows = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.userId, userId))
    .orderBy(desc(assignment.claimedAt))

  const mapped = rows.map((r) => serializeAssignment(r))
  return status ? mapped.filter((r) => r.status === status) : mapped
}
