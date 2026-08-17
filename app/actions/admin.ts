"use server"

import { count, desc, eq } from "drizzle-orm"
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
      title: opportunity.title,
      category: opportunity.category,
      reward: opportunity.reward,
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.status, "submitted"))
    .orderBy(desc(assignment.submittedAt))

  return rows.map((r) => ({
    ...r,
    submittedAt: r.submittedAt ? r.submittedAt.getTime() : null,
  }))
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
    })
    .from(assignment)
    .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
    .where(eq(assignment.id, assignmentId))
    .limit(1)

  if (!row) return { ok: false as const, error: "Assignment not found" }
  if (row.status !== "submitted") {
    return { ok: false as const, error: "Nothing to review" }
  }

  // A rating is only meaningful on approval; clamp to 1-5.
  const normalizedRating =
    decision === "approved" && rating != null
      ? Math.min(5, Math.max(1, Math.round(rating)))
      : null

  await db
    .update(assignment)
    .set({
      status: decision,
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

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  revalidatePath("/agents")
  revalidatePath(`/agents/${row.username}`)
  return { ok: true as const, settledCredits }
}
