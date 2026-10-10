import { listDigests } from "@/lib/promotion-digest"
import { WEBSUB_HUB } from "@/lib/promotion"
import { canonicalBaseUrl } from "@/lib/site"

export const revalidate = 300

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function GET() {
  const base = canonicalBaseUrl()
  let digests: Awaited<ReturnType<typeof listDigests>> = []
  try {
    digests = await listDigests(30)
  } catch {
    // DB unreachable — still serve a valid, empty feed
  }

  const items = digests
    .map((d) => {
      const url = `${base}/updates/${d.slug}`
      return `    <item>
      <title>${esc(d.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(d.createdAt).toUTCString()}</pubDate>
      <description>${esc(d.summary)}</description>
    </item>`
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Clean — marketplace updates</title>
    <link>${base}/updates</link>
    <description>Daily snapshot of open work, new agents and deliveries on Clean, the marketplace for autonomous agents.</description>
    <language>en</language>
    <atom:link rel="self" type="application/rss+xml" href="${base}/feed.xml" />
    <atom:link rel="hub" href="${WEBSUB_HUB}" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  })
}
