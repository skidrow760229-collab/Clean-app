import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile, assignment, creditTransaction } from "@/lib/db/schema"
import { canonicalBaseUrl } from "@/lib/site"

/**
 * Agent-to-agent referral program.
 *
 * The bonus is paid only when the referred agent's FIRST delivery is approved
 * by a human reviewer, so mass-registering fake agents earns nothing.
 */
export const REFERRAL_BONUS = 20

const bonusReason = (refereeUserId: string) => `referral_bonus:${refereeUserId}`

export function referralUrl(username: string): string {
  return `${canonicalBaseUrl()}/docs?ref=${encodeURIComponent(username)}`
}

export function badgeUrl(username: string): string {
  return `${canonicalBaseUrl()}/agents/${encodeURIComponent(username)}/badge.svg`
}

export function badgeMarkdown(username: string): string {
  return `[![Clean reputation](${badgeUrl(username)})](${canonicalBaseUrl()}/agents/${encodeURIComponent(username)})`
}

/** Resolve a referral handle to a real, non-fixture agent; null when invalid. */
export async function resolveReferrer(handle: unknown): Promise<string | null> {
  if (typeof handle !== "string" || !/^[A-Za-z0-9_-]{3,32}$/.test(handle)) return null
  const [row] = await db
    .select({ username: agentProfile.username })
    .from(agentProfile)
    .where(and(eq(agentProfile.username, handle), eq(agentProfile.isTestFixture, false)))
    .limit(1)
  return row?.username ?? null
}

/**
 * Pay the referrer once, after the referee's first approved delivery.
 * Idempotent: locked on the referrer's ledger and keyed by a per-referee reason,
 * so retries and later approvals never pay again.
 */
export async function awardReferralBonus(refereeUserId: string): Promise<boolean> {
  const [referee] = await db
    .select({ referredBy: agentProfile.referredBy, isTestFixture: agentProfile.isTestFixture })
    .from(agentProfile)
    .where(eq(agentProfile.userId, refereeUserId))
    .limit(1)
  if (!referee?.referredBy || referee.isTestFixture) return false

  const [referrer] = await db
    .select({ userId: agentProfile.userId, username: agentProfile.username })
    .from(agentProfile)
    .where(eq(agentProfile.username, referee.referredBy))
    .limit(1)
  if (!referrer || referrer.userId === refereeUserId) return false

  const [firstApproved] = await db
    .select({ id: assignment.id })
    .from(assignment)
    .where(and(eq(assignment.userId, refereeUserId), eq(assignment.status, "approved")))
    .orderBy(assignment.id)
    .limit(1)
  if (!firstApproved) return false

  const reason = bonusReason(refereeUserId)
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credits:${referrer.userId}`}))`)
      const [existing] = await tx
        .select({ id: creditTransaction.id })
        .from(creditTransaction)
        .where(and(eq(creditTransaction.userId, referrer.userId), eq(creditTransaction.reason, reason)))
        .limit(1)
      if (existing) return false

      const [bal] = await tx
        .select({ b: sql<number>`coalesce(sum(${creditTransaction.amount}), 0)::int` })
        .from(creditTransaction)
        .where(eq(creditTransaction.userId, referrer.userId))
      await tx.insert(creditTransaction).values({
        userId: referrer.userId,
        username: referrer.username,
        amount: REFERRAL_BONUS,
        balanceAfter: (bal?.b ?? 0) + REFERRAL_BONUS,
        reason,
        assignmentId: firstApproved.id,
      })
      return true
    })
  } catch (e) {
    // Unique (assignmentId, reason) violation = a concurrent award already won.
    if (e instanceof Error && /credit_tx_assignment_reason|duplicate key/.test(e.message)) return false
    throw e
  }
}

export async function referralSummary(username: string) {
  const [row] = await db
    .select({
      invited: sql<number>`count(*)::int`,
    })
    .from(agentProfile)
    .where(and(eq(agentProfile.referredBy, username), eq(agentProfile.isTestFixture, false)))
  const [earned] = await db
    .select({ total: sql<number>`coalesce(sum(${creditTransaction.amount}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(creditTransaction)
    .where(and(eq(creditTransaction.username, username), sql`${creditTransaction.reason} like 'referral_bonus:%'`))
  return {
    invited: row?.invited ?? 0,
    activated: earned?.n ?? 0,
    creditsEarned: earned?.total ?? 0,
  }
}

/** Network-wide referral funnel for the admin console. */
export async function referralStats() {
  const [row] = await db
    .select({
      referred: sql<number>`count(*) filter (where ${agentProfile.referredBy} is not null)::int`,
      referrers: sql<number>`count(distinct ${agentProfile.referredBy})::int`,
    })
    .from(agentProfile)
    .where(eq(agentProfile.isTestFixture, false))
  const [paid] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(creditTransaction)
    .where(sql`${creditTransaction.reason} like 'referral_bonus:%'`)
  return { referred: row?.referred ?? 0, referrers: row?.referrers ?? 0, bonusesPaid: paid?.n ?? 0, bonus: REFERRAL_BONUS }
}
