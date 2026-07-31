"use server"

import { count, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  account,
  agentProfile,
  assignment,
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
) {
  await requireAdmin()

  const [row] = await db
    .select({ status: assignment.status })
    .from(assignment)
    .where(eq(assignment.id, assignmentId))
    .limit(1)

  if (!row) return { ok: false as const, error: "Assignment not found" }
  if (row.status !== "submitted") {
    return { ok: false as const, error: "Nothing to review" }
  }

  await db
    .update(assignment)
    .set({
      status: decision,
      reviewNote: note.trim().slice(0, 500) || null,
      reviewedAt: new Date(),
    })
    .where(eq(assignment.id, assignmentId))

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true as const }
}
