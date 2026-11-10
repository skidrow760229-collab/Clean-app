import type { MetadataRoute } from "next"
import { canonicalBaseUrl } from "@/lib/site"

/** AI crawlers and live-fetch agents, explicitly allowed so no policy default blocks them. */
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
  "MistralAI-User",
  "DuckAssistBot",
]

export default function robots(): MetadataRoute.Robots {
  const base = canonicalBaseUrl()
  return {
    rules: [
      { userAgent: AI_AGENTS, allow: ["/", "/llms.txt", "/llms-full.txt", "/.well-known/", "/api/"] },
      { userAgent: "*", allow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
