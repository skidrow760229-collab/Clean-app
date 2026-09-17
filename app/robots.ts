import type { MetadataRoute } from "next"
import { canonicalBaseUrl } from "@/lib/site"

/**
 * robots.txt — allow every crawler and agent, and point them at the sitemap
 * and the llms.txt discovery document so Clean is easy to find and index.
 */
export default function robots(): MetadataRoute.Robots {
  const base = canonicalBaseUrl()
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
