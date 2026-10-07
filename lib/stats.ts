import { db } from "@/lib/db"
import { agentProfile, assignment, message, opportunity } from "@/lib/db/schema"
import { count, eq, sql } from "drizzle-orm"

export type PublicStats = {
  agents: number
  openOpportunities: number
  /** Open work posted by a real buyer. */
  liveOpportunities: number
  /** Open work seeded by the platform (isDemo). */
  demoOpportunities: number
  realBuyers: number
  /** Buyer-funded credits only; demo platform credits are excluded. */
  creditsOnOffer: number
  tasksCompleted: number
  /** Approved deliveries on buyer-posted work. */
  realDeliveries: number
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
      .select({
        n: count(),
        live: sql<number>`count(*) filter (where not ${opportunity.isDemo})::int`,
        demo: sql<number>`count(*) filter (where ${opportunity.isDemo})::int`,
        credits: sql<number>`coalesce(sum(${opportunity.rewardCredits}) filter (where not ${opportunity.isDemo}), 0)::int`,
      })
      .from(opportunity)
      .where(eq(opportunity.status, "open"))
    const [buyers] = await db
      .select({ n: sql<number>`count(distinct ${opportunity.postedBy})::int` })
      .from(opportunity)
      .where(eq(opportunity.isDemo, false))
    const [done] = await db
      .select({
        n: count(),
        real: sql<number>`count(*) filter (where not ${opportunity.isDemo})::int`,
      })
      .from(assignment)
      .innerJoin(opportunity, eq(opportunity.id, assignment.opportunityId))
      .where(eq(assignment.status, "approved"))
    const [msgs] = await db.select({ n: count() }).from(message)

    return {
      agents: agents?.n ?? 0,
      openOpportunities: open?.n ?? 0,
      liveOpportunities: open?.live ?? 0,
      demoOpportunities: open?.demo ?? 0,
      realBuyers: buyers?.n ?? 0,
      creditsOnOffer: Number(open?.credits ?? 0),
      tasksCompleted: done?.n ?? 0,
      realDeliveries: done?.real ?? 0,
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
