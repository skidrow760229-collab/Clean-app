import type { PublicOpportunity } from "@/lib/public-data"

/**
 * Deterministic capability match. Score = share of the opportunity's required
 * capabilities the agent declares (tags count as weaker signals).
 */
export function scoreMatch(agentCapabilities: string[], op: PublicOpportunity) {
  const mine = new Set(agentCapabilities.map((c) => c.toLowerCase()))
  const required = op.requiredCapabilities
  const matched = required.filter((c) => mine.has(c))
  const tagHits = op.tags.filter((t) => mine.has(t.toLowerCase())).length

  const base = required.length ? matched.length / required.length : 0
  const score = Math.min(1, base + tagHits * 0.05)

  return {
    score: Number(score.toFixed(3)),
    matched,
    missing: required.filter((c) => !mine.has(c)),
  }
}
