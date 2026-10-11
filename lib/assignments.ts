import "server-only"
import { and, count, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignment, opportunity } from "@/lib/db/schema"
import {
  allowedActions,
  effectiveStatus,
  maxAttempts,
  parseContract,
} from "@/lib/lifecycle"
import {
  eligibleDispute,
  isAgentPosted,
  posterActions,
  priceLabel,
  workerActions,
} from "@/lib/settlement"

type Row = {
  a: typeof assignment.$inferSelect
  o: typeof opportunity.$inferSelect
}

export type PartyRole = "worker" | "poster"

/** Loads an assignment only if it belongs to the given agent (the worker). */
export async function loadOwnedAssignment(assignmentId: number, userId: string) {
  const [row] = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(and(eq(assignment.id, assignmentId), eq(assignment.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * Loads an assignment if the caller is either party: the worker who claimed
 * it, or the agent that posted its opportunity. Anyone else gets null (404),
 * so assignment ids can't be probed.
 */
export async function loadAssignmentForParty(
  assignmentId: number,
  userId: string,
): Promise<(Row & { role: PartyRole }) | null> {
  const [row] = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.id, assignmentId))
    .limit(1)
  if (!row) return null
  if (row.a.userId === userId) return { ...row, role: "worker" }
  if (row.o.posterUserId && row.o.posterUserId === userId) return { ...row, role: "poster" }
  return null
}

function settlementView({ a, o }: Row) {
  if (!isAgentPosted(o)) return null
  return {
    pricing_model: o.pricingModel,
    price: priceLabel(o),
    price_amount: o.priceAmount,
    price_currency: o.priceCurrency,
    settlement_method: o.settlementMethod,
    settlement_terms: o.settlementTerms,
    off_platform: true,
    status: a.settlementStatus,
    payment_reference: a.paymentReference,
    paid_reported_at: a.paidReportedAt ? a.paidReportedAt.toISOString() : null,
    payment_confirmed_at: a.paymentConfirmedAt ? a.paymentConfirmedAt.toISOString() : null,
  }
}

function disputeView({ a }: Row) {
  if (!a.disputeType && !a.disputeReason) return null
  return {
    type: a.disputeType ?? "rejection",
    reason: a.disputeReason,
    opened_at: a.disputedAt ? a.disputedAt.toISOString() : null,
    poster_response: a.disputeResponse,
    ruling: a.ruling,
    ruling_note: a.rulingNote,
    ruled_at: a.ruledAt ? a.ruledAt.toISOString() : null,
  }
}

/** Full machine-readable view of an assignment, including its contract. */
export function serializeAssignment(
  row: Row,
  opts?: { full?: boolean; role?: PartyRole },
) {
  const { a, o } = row
  const contract = parseContract(o.contract)
  const status = effectiveStatus(a)
  const remaining = Math.max(0, maxAttempts(contract) - a.attempts)
  const role = opts?.role ?? "worker"
  const agentPosted = isAgentPosted(o)

  const actions = agentPosted
    ? role === "poster"
      ? posterActions({ ...a, effectiveStatus: status })
      : workerActions({ ...a, effectiveStatus: status }, o.pricingModel, remaining)
    : allowedActions(status, a.attempts, contract)

  const base = {
    assignment_id: a.id,
    opportunity_id: o.id,
    title: o.title,
    status,
    your_role: role,
    worker: a.username,
    price: priceLabel(o),
    reward_credits: o.rewardCredits,
    attempts: a.attempts,
    attempts_remaining: remaining,
    allowed_actions: actions,
    dispute_available: agentPosted && role === "worker" ? eligibleDispute(a, o.pricingModel) : null,
    settlement_status: a.settlementStatus,
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
    reviewed_by: agentPosted ? "poster" : "clean",
    contract,
    deliverable: a.deliverable,
    settlement: settlementView(row),
    dispute: disputeView(row),
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

/** Closes an opportunity once every slot has produced an approved delivery. */
export async function closeOpportunityIfFull(opportunityId: number, maxClaims: number) {
  const [approved] = await db
    .select({ n: count() })
    .from(assignment)
    .where(and(eq(assignment.opportunityId, opportunityId), eq(assignment.status, "approved")))
  if ((approved?.n ?? 0) >= maxClaims) {
    await db.update(opportunity).set({ status: "closed" }).where(eq(opportunity.id, opportunityId))
  }
}

/** Every delivery against one opportunity, visible only to its poster. */
export async function listAssignmentsForOpportunity(opportunityId: number) {
  const rows = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.opportunityId, opportunityId))
    .orderBy(desc(assignment.claimedAt))
  return rows.map((r) => serializeAssignment(r, { full: true, role: "poster" }))
}
