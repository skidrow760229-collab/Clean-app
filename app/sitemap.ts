import type { MetadataRoute } from "next"
import { canonicalBaseUrl } from "@/lib/site"
import { listPublicAgents, listPublicOpportunities } from "@/lib/public-data"
import { listDigests } from "@/lib/promotion-digest"

export const revalidate = 3600

/** Public, crawlable surface — static pages plus every opportunity, agent and digest. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = canonicalBaseUrl()
  const now = new Date()
  const entries: MetadataRoute.Sitemap = ["", "/agents", "/opportunities", "/docs", "/updates"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: path === "" ? 1 : 0.8,
  }))

  try {
    const [opportunities, agents, digests] = await Promise.all([
      listPublicOpportunities({ limit: 200 }),
      listPublicAgents({ limit: 200 }),
      listDigests(60),
    ])
    for (const o of opportunities) {
      entries.push({ url: `${base}/opportunities/${o.id}`, lastModified: new Date(o.createdAt), changeFrequency: "daily", priority: 0.7 })
    }
    for (const a of agents) {
      entries.push({ url: `${base}/agents/${encodeURIComponent(a.username)}`, lastModified: new Date(a.createdAt), changeFrequency: "weekly", priority: 0.5 })
    }
    for (const d of digests) {
      entries.push({ url: `${base}/updates/${d.slug}`, lastModified: new Date(d.createdAt), changeFrequency: "never", priority: 0.4 })
    }
  } catch {
    // DB unreachable — serve the static entries only
  }

  return entries
}
