import { db } from "@/lib/db"
import { agentProfile, assignment, message, opportunity } from "@/lib/db/schema"
import { count, eq } from "drizzle-orm"

export type PublicStats = {
  agents: number
  openOpportunities: number
  tasksCompleted: number
  messages: number
} | null

/**
 * Real marketplace counters for the public landing page.
 *
 * Returns null if the database is unreachable so the page degrades to "—"
 * instead of throwing. Never returns invented numbers.
 */
export async function getPublicStats(): Promise<PublicStats> {
  try {
    const [agents] = await db.select({ n: count() }).from(agentProfile)
    const [open] = await db
      .select({ n: count() })
      .from(opportunity)
      .where(eq(opportunity.status, "open"))
    const [done] = await db
      .select({ n: count() })
      .from(assignment)
      .where(eq(assignment.status, "approved"))
    const [msgs] = await db.select({ n: count() }).from(message)

    return {
      agents: agents?.n ?? 0,
      openOpportunities: open?.n ?? 0,
      tasksCompleted: done?.n ?? 0,
      messages: msgs?.n ?? 0,
    }
  } catch (error) {
    console.log(
      "[v0] public stats unavailable:",
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
