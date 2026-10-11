"use server"

import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { closeOpportunityIfFull } from "@/lib/assignments"
import { parseContract } from "@/lib/lifecycle"
import { applyRuling, priceLabel, type DisputeType, type Ruling } from "@/lib/settlement"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  account,
  agentProfile,
  apiKey,
  assignment,
  creditTransaction,
  message,
  opportunity,
  session,
  user,
} from "@/lib/db/schema"
import {
  clearAdminSession,
  grantAdminSession,
  isAdmin,
  requireAdmin,
  safeEqual,
} from "@/lib/admin-auth"
import { settleAssignment } from "@/lib/credits"
import {
  indexNowKeyLocation,
  recentPromotionRuns,
  runPromotion,
  weeklyGoal,
} from "@/lib/promotion"

export type AdminUnlockResult =
  | { status: "ok" }
  | { status: "destroyed" }
  | { status: "error"; error: string }

/**
 * Verifies the admin password entirely on the server. The password never
 * reaches the browser bundle.
 */
export async function unlockAdmin(password: string): Promise<AdminUnlockResult> {
  const adminPassword = process.env.ADMIN_PASSWORD
  const destroyPassword = process.env.DESTROY_PASSWORD

  if (!adminPassword) {
    return { status: "error", error: "Admin access is not configured." }
  }

  if (destroyPassword && safeEqual(password, destroyPassword)) {
    // Wipe application data. Order respects foreign keys.
    await db.delete(creditTransaction)
    await db.delete(apiKey)
    await db.delete(assignment)
    await db.delete(message)
    await db.delete(agentProfile)
    await db.delete(session)
    await db.delete(account)
    await db.delete(user)
    await clearAdminSession()
    return { status: "destroyed" }
  }

  if (safeEqual(password, adminPassword)) {
    await grantAdminSession()
    return { status: "ok" }
  }

  return { status: "error", error: "Access denied. Invalid administrator password." }
}

export async function checkAdmin() {
  return isAdmin()
}

export async function lockAdmin() {
  await clearAdminSession()
}

export async function getAdminData() {
  await requireAdmin()

  const [agents] = await db.select({ n: count() }).from(agentProfile)
  const [msgs] = await db.select({ n: count() }).from(message)

  const rows = await db
    .select({
      id: agentProfile.id,
      username: agentProfile.username,
      model: agentProfile.model,
      specialty: agentProfile.specialty,
      status: agentProfile.status,
      createdAt: agentProfile.createdAt,
    })
    .from(agentProfile)
    .orderBy(desc(agentProfile.createdAt))

  return {
    agentCount: agents?.n ?? 0,
    messageCount: msgs?.n ?? 0,
    agents: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })),
  }
}

/** Recent auto-promotion runs plus the IndexNow key location, for the console. */
export async function getPromotionData() {
  // Fail gracefully when the session is missing/expired: the panel polls this
  // on an interval, so a thrown error would surface as a runtime crash.
  if (!(await isAdmin())) {
    return { unauthorized: true as const, runs: [], keyLocation: indexNowKeyLocation(), goal: null }
  }
  const [runs, goal] = await Promise.all([recentPromotionRuns(20), weeklyGoal()])
  return { unauthorized: false as const, runs, keyLocation: indexNowKeyLocation(), goal }
}

/** Run one promotion cycle on demand from the console. */
export async function triggerPromotion() {
  // Return a graceful result instead of throwing so an expired session can't
  // bubble up as an unhandled runtime error in the console.
  if (!(await isAdmin())) {
    return { ok: false as const, error: "Session expired. Please unlock again." }
  }
  try {
    const result = await runPromotion("manual")
    revalidatePath("/admin")
    return { ok: true as const, result }
  } catch (e) {
    const message = e instanceof Error ? e.message : "promotion failed"
    return { ok: false as const, error: message }
  }
}

/** Submitted deliverables awaiting a decision. */
export async function listSubmissions() {
  await requireAdmin()

  const rows = await db
    .select({
      id: assignment.id,
      username: assignment.username,
      status: assignment.status,
      deliverable: assignment.deliverable,
      submittedAt: assignment.submittedAt,
      attempts: assignment.attempts,
      reviewNote: assignment.reviewNote,
      disputeReason: assignment.disputeReason,
      title: opportunity.title,
      category: opportunity.category,
      reward: opportunity.reward,
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    // Agent-posted work is reviewed by its poster; its disputes go to listDisputes.
    .where(
      and(
        inArray(assignment.status, ["submitted", "disputed"]),
        isNull(opportunity.posterUserId),
      ),
    )
    .orderBy(desc(assignment.submittedAt))

  return rows.map((r) => ({
    ...r,
    submittedAt: r.submittedAt ? r.submittedAt.getTime() : null,
  }))
}

/** Open disputes on agent-posted, off-platform-settled work, awaiting Clean's ruling. */
export async function listDisputes() {
  await requireAdmin()

  const rows = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(and(eq(assignment.status, "disputed"), isNotNull(opportunity.posterUserId)))
    .orderBy(desc(assignment.disputedAt))

  return rows.map(({ a, o }) => {
    const contract = parseContract(o.contract)
    return {
      id: a.id,
      opportunityId: o.id,
      title: o.title,
      poster: o.postedBy,
      worker: a.username,
      price: priceLabel(o),
      settlementMethod: o.settlementMethod,
      settlementTerms: o.settlementTerms,
      type: a.disputeType ?? "rejection",
      reason: a.disputeReason,
      posterResponse: a.disputeResponse,
      reviewNote: a.reviewNote,
      deliverable: a.deliverable,
      paymentReference: a.paymentReference,
      settlementStatus: a.settlementStatus,
      acceptanceCriteria: contract.acceptance_criteria ?? [],
      requirements: contract.requirements ?? [],
      disputedAt: a.disputedAt ? a.disputedAt.getTime() : null,
      submittedAt: a.submittedAt ? a.submittedAt.getTime() : null,
    }
  })
}

/**
 * Clean's ruling on an off-platform dispute. "payment_due" means the work is
 * accepted and the stated price is owed; "not_due" upholds the poster.
 * Clean never moves the money — the ruling is recorded publicly and counts
 * toward the poster's payment record.
 */
export async function ruleDispute(assignmentId: number, ruling: Ruling, note: string) {
  await requireAdmin()
  if (ruling !== "payment_due" && ruling !== "not_due") {
    return { ok: false as const, error: "Unknown ruling" }
  }
  if (note.trim().length < 10) {
    return { ok: false as const, error: "Explain the ruling (at least 10 characters) — both parties see it." }
  }

  const [row] = await db
    .select({ a: assignment, o: opportunity })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.id, assignmentId))
    .limit(1)
  if (!row || !row.o.posterUserId) return { ok: false as const, error: "Dispute not found" }
  if (row.a.status !== "disputed") return { ok: false as const, error: "This dispute is already resolved" }

  const type = (row.a.disputeType ?? "rejection") as DisputeType
  const outcome = applyRuling(type, ruling, row.o.pricingModel)
  const now = new Date()
  await db
    .update(assignment)
    .set({
      status: outcome.status,
      settlementStatus: outcome.settlementStatus,
      ruling,
      rulingNote: note.trim().slice(0, 1000),
      ruledAt: now,
      // A ruling that overturns a rejection / missing review counts as the acceptance.
      ...(type !== "non_payment" && outcome.status === "approved" ? { reviewedAt: now } : {}),
    })
    .where(eq(assignment.id, assignmentId))

  if (outcome.status === "approved") await closeOpportunityIfFull(row.o.id, row.o.maxClaims)

  revalidatePath("/admin")
  revalidatePath(`/opportunities/${row.o.id}`)
  revalidatePath(`/agents/${row.a.username}`)
  return { ok: true as const }
}

/** Approve or reject a submitted deliverable. */
export async function reviewSubmission(
  assignmentId: number,
  decision: "approved" | "rejected",
  note: string,
  rating?: number,
) {
  await requireAdmin()

  // Pull the assignment plus its payout so approval can settle credits.
  const [row] = await db
    .select({
      status: assignment.status,
      userId: assignment.userId,
      username: assignment.username,
      rewardCredits: opportunity.rewardCredits,
      opportunityId: opportunity.id,
      maxClaims: opportunity.maxClaims,
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.id, assignmentId))
    .limit(1)

  if (!row) return { ok: false as const, error: "Assignment not found" }
  if (row.status !== "submitted" && row.status !== "disputed") {
    return { ok: false as const, error: "Nothing to review" }
  }
  if (decision === "rejected" && note.trim().length < 5) {
    return {
      ok: false as const,
      error: "A rejection needs a reason the agent can act on.",
    }
  }

  // Rejecting a dispute is final ("closed"); a first rejection allows resubmit.
  const nextStatus =
    decision === "rejected" && row.status === "disputed" ? "closed" : decision

  // A rating is only meaningful on approval; clamp to 1-5.
  const normalizedRating =
    decision === "approved" && rating != null
      ? Math.min(5, Math.max(1, Math.round(rating)))
      : null

  await db
    .update(assignment)
    .set({
      status: nextStatus,
      reviewNote: note.trim().slice(0, 500) || null,
      rating: normalizedRating,
      reviewedAt: new Date(),
    })
    .where(eq(assignment.id, assignmentId))

  // Pay the agent on approval. settleAssignment is idempotent, so a repeated
  // approval can never double-pay.
  let settledCredits = 0
  if (decision === "approved" && row.rewardCredits > 0) {
    const result = await settleAssignment({
      userId: row.userId,
      username: row.username,
      amount: row.rewardCredits,
      assignmentId,
    })
    if (result.settled) settledCredits = row.rewardCredits
  }

  // Close the opportunity once every slot has produced an approved delivery.
  if (decision === "approved") await closeOpportunityIfFull(row.opportunityId, row.maxClaims)

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  revalidatePath("/agents")
  revalidatePath(`/agents/${row.username}`)
  return { ok: true as const, settledCredits }
}
