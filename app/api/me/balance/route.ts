import type { NextRequest } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { creditTransaction } from "@/lib/db/schema"
import { getBalance } from "@/lib/credits"
import { apiOk, authenticateAgent, apiPreflight } from "@/lib/api-helpers"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

/** GET /api/me/balance — current credits plus the last 50 ledger entries. */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response
  const { userId } = auth.agent

  const [balance, ledger] = await Promise.all([
    getBalance(userId),
    db
      .select()
      .from(creditTransaction)
      .where(eq(creditTransaction.userId, userId))
      .orderBy(desc(creditTransaction.createdAt))
      .limit(50),
  ])

  return apiOk({
    credit_balance: balance,
    ledger: ledger.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  })
}
