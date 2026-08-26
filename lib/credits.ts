import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { creditTransaction } from "@/lib/db/schema"

/**
 * Credit ledger.
 *
 * There is no mutable "balance" column anywhere. An agent's balance is the
 * sum of its signed ledger rows, so it can never drift out of sync with the
 * transaction history and every change is auditable.
 */

export type LedgerEntry = {
  id: number
  amount: number
  balanceAfter: number
  reason: string
  assignmentId: number | null
  createdAt: number
}

/** Current balance = sum of all signed amounts for the user. */
export async function getBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${creditTransaction.amount}), 0)::int`,
    })
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId))
  return row?.balance ?? 0
}

/**
 * Append a signed entry to the ledger and return the new balance.
 *
 * Runs in a transaction and recomputes the balance from the summed rows inside
 * that transaction, so concurrent settlements can't both read a stale balance
 * and write an inconsistent `balanceAfter`.
 */
export async function recordTransaction(params: {
  userId: string
  username: string
  amount: number
  reason: string
  assignmentId?: number | null
}): Promise<number> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({
        balance: sql<number>`coalesce(sum(${creditTransaction.amount}), 0)::int`,
      })
      .from(creditTransaction)
      .where(eq(creditTransaction.userId, params.userId))

    const balanceAfter = (prev?.balance ?? 0) + params.amount

    await tx.insert(creditTransaction).values({
      userId: params.userId,
      username: params.username,
      amount: params.amount,
      balanceAfter,
      reason: params.reason,
      assignmentId: params.assignmentId ?? null,
    })

    return balanceAfter
  })
}

/**
 * Settle an approved assignment exactly once.
 *
 * Idempotent by (assignmentId, reason): if an entry for this payout already
 * exists, it does nothing, so a double-approval can't pay twice.
 */
export async function settleAssignment(params: {
  userId: string
  username: string
  amount: number
  assignmentId: number
}): Promise<{ settled: boolean; balance: number }> {
  const reason = "assignment_reward"

  const [existing] = await db
    .select({ id: creditTransaction.id })
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.assignmentId, params.assignmentId),
        eq(creditTransaction.reason, reason),
      ),
    )
    .limit(1)

  if (existing) {
    return { settled: false, balance: await getBalance(params.userId) }
  }

  const balance = await recordTransaction({
    userId: params.userId,
    username: params.username,
    amount: params.amount,
    reason,
    assignmentId: params.assignmentId,
  })

  return { settled: true, balance }
}

/** Recent ledger entries for a user, newest first. */
export async function listTransactions(
  userId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  const rows = await db
    .select()
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId))
    .orderBy(desc(creditTransaction.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    reason: r.reason,
    assignmentId: r.assignmentId,
    createdAt: r.createdAt.getTime(),
  }))
}
