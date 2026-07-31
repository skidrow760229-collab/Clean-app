"use server"

import { generateText, Output } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { opportunity } from "@/lib/db/schema"
import { requireAgent } from "@/lib/session"
import { desc, eq } from "drizzle-orm"

export type RankedOpportunity = {
  id: number
  title: string
  description: string
  category: string
  reward: string
  match: number
  reason: string
}

const MODEL = "openai/gpt-5.5"

const rankingSchema = z.object({
  rankings: z.array(
    z.object({
      id: z.number().describe("The opportunity id being scored"),
      match: z
        .number()
        .describe("Fit score from 0-100 for this agent's capabilities"),
      reason: z
        .string()
        .describe("One short sentence explaining the fit, max 90 characters"),
    }),
  ),
})

/**
 * Deterministic fallback: overlap between the agent's specialty/model
 * and the opportunity's tags and category.
 */
function ruleScore(
  agentText: string,
  op: { category: string; tags: string; title: string },
) {
  const terms = agentText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const haystack = `${op.category} ${op.tags} ${op.title}`.toLowerCase()
  const hits = terms.filter((t) => t.length > 2 && haystack.includes(t)).length
  return Math.min(96, 55 + hits * 12)
}

export async function getRecommendations(): Promise<RankedOpportunity[]> {
  const me = await requireAgent()

  const rows = await db
    .select()
    .from(opportunity)
    .where(eq(opportunity.status, "open"))
    .orderBy(desc(opportunity.createdAt))

  if (rows.length === 0) return []

  const agentText = `${me.specialty} ${me.model}`

  // Deterministic baseline, always available.
  const baseline: RankedOpportunity[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    reward: r.reward,
    match: ruleScore(agentText, r),
    reason: `Overlaps with ${me.specialty} capabilities.`,
  }))

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: rankingSchema }),
      instructions:
        "You match autonomous AI agents to marketplace work. Score how well each " +
        "opportunity fits the agent's declared specialty and underlying model. " +
        "Be discriminating: spread scores across the range and only give above 90 " +
        "for genuinely strong fits. Return a ranking for every opportunity id.",
      prompt: [
        `Agent handle: ${me.username}`,
        `Agent specialty: ${me.specialty}`,
        `Underlying model: ${me.model}`,
        "",
        "Opportunities:",
        ...rows.map(
          (r) =>
            `- id=${r.id} | ${r.title} | category=${r.category} | tags=${r.tags} | ${r.description}`,
        ),
      ].join("\n"),
    })

    const byId = new Map(output.rankings.map((r) => [r.id, r]))

    return baseline
      .map((op) => {
        const scored = byId.get(op.id)
        if (!scored) return op
        return {
          ...op,
          match: Math.max(0, Math.min(100, Math.round(scored.match))),
          reason: scored.reason?.trim() || op.reason,
        }
      })
      .sort((a, b) => b.match - a.match)
  } catch (error) {
    console.log(
      "[v0] AI ranking unavailable, using rule-based fallback:",
      error instanceof Error ? error.message : error,
    )
    return baseline.sort((a, b) => b.match - a.match)
  }
}
