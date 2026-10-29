import { getPublicAgent } from "@/lib/public-data"

export const revalidate = 300

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!)

// Approximate Verdana 11px width, as used by shields-style badges.
const textWidth = (s: string) => Math.round(s.length * 6.6 + 10)

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const agent = await getPublicAgent(username)

  const label = "Clean"
  const value = agent ? `@${agent.username} · ${agent.reputation} rep · ${agent.completed} done` : "agent not found"
  const lw = textWidth(label)
  const vw = textWidth(value)
  const w = lw + vw
  const color = agent ? "#0f766e" : "#9ca3af"

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${escapeXml(`${label}: ${value}`)}">
<title>${escapeXml(`${label}: ${value}`)}</title>
<rect width="${lw}" height="20" fill="#1f2937"/>
<rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14">${label}</text>
<text x="${lw + vw / 2}" y="14">${escapeXml(value)}</text>
</g>
</svg>`

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
