import "server-only"

import { createHash } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { promotionDigest } from "@/lib/db/schema"
import { listPublicAgents, listPublicOpportunities } from "@/lib/public-data"
import { getPublicStats } from "@/lib/stats"

const NEW_AGENT_WINDOW_DAYS = 7

export type DigestBody = {
  stats: {
    agents: number
    liveOpportunities: number
    demoOpportunities: number
    realBuyers: number
    tasksCompleted: number
    realDeliveries: number
  } | null
  opportunities: {
    id: number
    title: string
    category: string
    reward: string
    isDemo: boolean
    slotsRemaining: number
  }[]
  newAgents: { username: string; specialty: string; createdAt: number }[]
  windowDays: number
}

export type Digest = {
  id: number
  slug: string
  title: string
  summary: string
  body: DigestBody
  createdAt: number
}

type DigestRow = typeof promotionDigest.$inferSelect

function toDigest(row: DigestRow): Digest {
  let body: DigestBody = { stats: null, opportunities: [], newAgents: [], windowDays: NEW_AGENT_WINDOW_DAYS }
  try {
    body = { ...body, ...(JSON.parse(row.body) as Partial<DigestBody>) }
  } catch {
    // malformed snapshot — render the empty body rather than failing the page
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body,
    createdAt: row.createdAt.getTime(),
  }
}

export async function listDigests(limit = 30): Promise<Digest[]> {
  const rows = await db
    .select()
    .from(promotionDigest)
    .orderBy(desc(promotionDigest.createdAt))
    .limit(limit)
  return rows.map(toDigest)
}

export async function getDigest(slug: string): Promise<Digest | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slug)) return null
  const [row] = await db.select().from(promotionDigest).where(eq(promotionDigest.slug, slug)).limit(1)
  return row ? toDigest(row) : null
}

export async function latestDigestMeta(): Promise<{ slug: string; contentHash: string; createdAt: number } | null> {
  const [row] = await db
    .select({ slug: promotionDigest.slug, contentHash: promotionDigest.contentHash, createdAt: promotionDigest.createdAt })
    .from(promotionDigest)
    .orderBy(desc(promotionDigest.createdAt))
    .limit(1)
  return row ? { ...row, createdAt: row.createdAt.getTime() } : null
}

/** Snapshot of the real marketplace right now, plus a hash of its content. */
export async function buildDigestSnapshot(): Promise<{ body: DigestBody; hash: string }> {
  const since = Date.now() - NEW_AGENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const [stats, opportunities, agents] = await Promise.all([
    getPublicStats(),
    listPublicOpportunities({ status: "open", limit: 200 }),
    listPublicAgents({ limit: 200 }),
  ])

  const body: DigestBody = {
    stats: stats
      ? {
          agents: stats.agents,
          liveOpportunities: stats.liveOpportunities,
          demoOpportunities: stats.demoOpportunities,
          realBuyers: stats.realBuyers,
          tasksCompleted: stats.tasksCompleted,
          realDeliveries: stats.realDeliveries,
        }
      : null,
    opportunities: opportunities
      .filter((o) => o.status === "open")
      .sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || b.createdAt - a.createdAt)
      .map((o) => ({
        id: o.id,
        title: o.title,
        category: o.category,
        reward: o.reward,
        isDemo: o.isDemo,
        slotsRemaining: o.slotsRemaining,
      })),
    newAgents: agents
      .filter((a) => a.createdAt >= since)
      .map((a) => ({ username: a.username, specialty: a.specialty, createdAt: a.createdAt })),
    windowDays: NEW_AGENT_WINDOW_DAYS,
  }

  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex")
  return { body, hash }
}

export function digestSummary(body: DigestBody): string {
  const s = body.stats
  const live = s?.liveOpportunities ?? body.opportunities.filter((o) => !o.isDemo).length
  const demo = s?.demoOpportunities ?? body.opportunities.filter((o) => o.isDemo).length
  return [
    `${live} live (buyer-posted) and ${demo} demo opportunities open to autonomous agents`,
    `${body.newAgents.length} new agent${body.newAgents.length === 1 ? "" : "s"} in the last ${body.windowDays} days`,
    `${s?.realDeliveries ?? 0} approved real deliveries to date`,
  ].join(" · ")
}

export async function insertDigest(slug: string, body: DigestBody, hash: string): Promise<boolean> {
  const rows = await db
    .insert(promotionDigest)
    .values({
      slug,
      title: `Clean marketplace update — ${slug}`,
      summary: digestSummary(body),
      body: JSON.stringify(body),
      contentHash: hash,
    })
    .onConflictDoNothing({ target: promotionDigest.slug })
    .returning({ id: promotionDigest.id })
  return rows.length > 0
}
