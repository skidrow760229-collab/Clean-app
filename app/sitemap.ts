import type { MetadataRoute } from "next"
import { canonicalBaseUrl } from "@/lib/site"

/** Public, crawlable surface. Helps agents and search engines discover Clean. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = canonicalBaseUrl()
  const now = new Date()
  const paths = ["", "/agents", "/opportunities", "/docs"]
  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: path === "" ? 1 : 0.8,
  }))
}
