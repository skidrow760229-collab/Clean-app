import "server-only"

import { after } from "next/server"
import { gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentHit } from "@/lib/db/schema"

/**
 * Client classes. `self` is our own promotion probe and is never counted as
 * reach; everything else is real inbound traffic.
 */
export type ClientClass = "ai_crawler" | "ai_assistant" | "agent_sdk" | "search_bot" | "browser" | "other" | "self"

const RULES: [ClientClass, RegExp][] = [
  ["self", /CleanPromotionBot|CleanSelfTest/i],
  // Live fetches made on behalf of a user/agent session — the highest-intent signal.
  ["ai_assistant", /ChatGPT-User|Claude-User|Claude-Web|Perplexity-User|MistralAI-User|DuckAssistBot|Gemini-Deep-Research/i],
  ["ai_crawler", /GPTBot|OAI-SearchBot|ClaudeBot|anthropic-ai|PerplexityBot|Google-Extended|CCBot|Bytespider|Amazonbot|Applebot-Extended|meta-externalagent|cohere-ai|YouBot|Diffbot|Timpibot|AI2Bot|PetalBot/i],
  ["agent_sdk", /python-requests|python-httpx|aiohttp|node-fetch|undici|axios|got\/|curl\/|Wget|Go-http-client|okhttp|openai|langchain|llama.?index|mcp|modelcontextprotocol|claude-code|cursor|^node$|Deno|Bun\//i],
  ["search_bot", /bingbot|Googlebot|YandexBot|Baiduspider|DuckDuckBot|Applebot|SeznamBot|Yeti|Sogou/i],
  ["browser", /Mozilla\/5\.0.*(Chrome|Safari|Firefox|Edg)\//i],
]

export function classifyClient(userAgent: string | null): ClientClass {
  const ua = userAgent?.trim() ?? ""
  if (!ua) return "agent_sdk" // bare HTTP clients often send no UA at all
  for (const [cls, re] of RULES) if (re.test(ua)) return cls
  return "other"
}

/** Surfaces worth measuring. Keep the set small so the funnel stays readable. */
export type Surface =
  | "llms_txt"
  | "llms_full"
  | "openapi"
  | "ai_plugin"
  | "agent_card"
  | "mcp_manifest"
  | "mcp_call"
  | "agents_json"
  | "opportunities_api"
  | "register_attempt"
  | "register_success"

/**
 * Schedules one hit after the response is sent (serverless may drop a bare
 * un-awaited promise). Never throws: a failed counter must not break a
 * discovery document an agent is reading.
 */
export function trackHit(surface: Surface, req: Request): void {
  const client = classifyClient(req.headers.get("user-agent"))
  if (client === "self") return
  try {
    after(() => recordHit(surface, client))
  } catch {
    void recordHit(surface, client)
  }
}

async function recordHit(surface: Surface, client: ClientClass): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const key = `${day}|${surface}|${client}`
  try {
    await db
      .insert(agentHit)
      .values({ key, day, surface, client, count: 1 })
      .onConflictDoUpdate({
        target: agentHit.key,
        set: { count: sql`${agentHit.count} + 1`, lastAt: sql`now()` },
      })
  } catch (e) {
    console.error("[agent-traffic] record failed:", e instanceof Error ? e.message : e)
  }
}

export type Funnel = {
  days: number
  /** Total non-self hits per surface. */
  bySurface: Record<string, number>
  /** Total non-self hits per client class. */
  byClient: Record<string, number>
  /** Hits from AI crawlers / assistants / agent SDKs on discovery docs. */
  agentDiscovery: number
  registerAttempts: number
  registerSuccess: number
  mcpCalls: number
}

const DISCOVERY: Surface[] = ["llms_txt", "llms_full", "openapi", "ai_plugin", "agent_card", "mcp_manifest", "agents_json"]
const AGENT_CLIENTS: ClientClass[] = ["ai_crawler", "ai_assistant", "agent_sdk"]

export async function agentFunnel(days = 7): Promise<Funnel> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({ surface: agentHit.surface, client: agentHit.client, n: sql<number>`cast(sum(${agentHit.count}) as int)` })
    .from(agentHit)
    .where(gte(agentHit.day, since))
    .groupBy(agentHit.surface, agentHit.client)

  const funnel: Funnel = {
    days,
    bySurface: {},
    byClient: {},
    agentDiscovery: 0,
    registerAttempts: 0,
    registerSuccess: 0,
    mcpCalls: 0,
  }
  for (const r of rows) {
    funnel.bySurface[r.surface] = (funnel.bySurface[r.surface] ?? 0) + r.n
    funnel.byClient[r.client] = (funnel.byClient[r.client] ?? 0) + r.n
    if (DISCOVERY.includes(r.surface as Surface) && AGENT_CLIENTS.includes(r.client as ClientClass)) {
      funnel.agentDiscovery += r.n
    }
    if (r.surface === "register_attempt") funnel.registerAttempts += r.n
    if (r.surface === "register_success") funnel.registerSuccess += r.n
    if (r.surface === "mcp_call") funnel.mcpCalls += r.n
  }
  return funnel
}
