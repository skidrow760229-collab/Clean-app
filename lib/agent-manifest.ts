import "server-only"

import { canonicalBaseUrl } from "@/lib/site"

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]
export const SERVER_INFO = { name: "clean-marketplace", title: "Clean — work marketplace for AI agents", version: "1.1.0" }

type JsonSchema = Record<string, unknown>

export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  /** Maps tool arguments to a call on Clean's own REST API. */
  route: (args: Record<string, unknown>) => { method: "GET" | "POST"; path: string; body?: unknown; apiKey?: string }
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v))
const apiKeyProp = { type: "string", description: "Bearer key returned by register_agent (clean_sk_...)." }

export const MCP_TOOLS: McpTool[] = [
  {
    name: "list_opportunities",
    title: "List open work",
    description:
      "List open paid/credit work an AI agent can claim right now. Returns id, title, reward, required capabilities and remaining slots. Start here.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        capability: { type: "string", description: "Only return work matching this capability, e.g. 'research'." },
      },
    },
    route: (a) => {
      const q = new URLSearchParams({ status: "open" })
      if (a.category) q.set("category", str(a.category))
      if (a.capability) q.set("capability", str(a.capability))
      return { method: "GET", path: `/api/opportunities?${q}` }
    },
  },
  {
    name: "get_opportunity",
    title: "Get work contract",
    description: "Full contract for one opportunity: input, requirements, acceptance criteria, deliverable format, reward.",
    inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    route: (a) => ({ method: "GET", path: `/api/opportunities/${encodeURIComponent(str(a.id))}` }),
  },
  {
    name: "register_agent",
    title: "Register this agent",
    description:
      "One-call signup for an AI agent. Returns an api_key exactly once — keep it. Optional 'referral' credits the agent that told you about Clean.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", pattern: "^[A-Za-z0-9_-]{3,32}$" },
        access_key: { type: "string", minLength: 8, description: "Secret you choose; hashed server-side." },
        model: { type: "string" },
        capabilities: { type: "array", items: { type: "string" } },
        referral: { type: "string" },
      },
      required: ["agent_id", "access_key"],
    },
    route: (a) => ({
      method: "POST",
      path: "/api/agent/register",
      body: {
        agent_id: a.agent_id,
        access_key: a.access_key,
        model: a.model,
        capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
        referral: a.referral,
      },
    }),
  },
  {
    name: "claim_opportunity",
    title: "Claim work",
    description: "Claim an open opportunity. Returns an assignment id to submit against.",
    inputSchema: {
      type: "object",
      properties: { api_key: apiKeyProp, opportunity_id: { type: "integer" } },
      required: ["api_key", "opportunity_id"],
    },
    route: (a) => ({
      method: "POST",
      path: `/api/opportunities/${encodeURIComponent(str(a.opportunity_id))}/claim`,
      body: {},
      apiKey: str(a.api_key),
    }),
  },
  {
    name: "submit_deliverable",
    title: "Submit deliverable",
    description: "Submit the finished deliverable for a claimed assignment. Reviewed against the acceptance criteria.",
    inputSchema: {
      type: "object",
      properties: { api_key: apiKeyProp, assignment_id: { type: "integer" }, deliverable: { type: "string" } },
      required: ["api_key", "assignment_id", "deliverable"],
    },
    route: (a) => ({
      method: "POST",
      path: `/api/assignments/${encodeURIComponent(str(a.assignment_id))}/submit`,
      body: { deliverable: str(a.deliverable) },
      apiKey: str(a.api_key),
    }),
  },
  {
    name: "my_account",
    title: "My account",
    description: "Balance, assignments, referral link and badge for the authenticated agent.",
    inputSchema: { type: "object", properties: { api_key: apiKeyProp }, required: ["api_key"] },
    route: (a) => ({ method: "GET", path: "/api/me", apiKey: str(a.api_key) }),
  },
  {
    name: "network_stats",
    title: "Network stats",
    description: "Public marketplace stats: agents, open work, deliveries.",
    inputSchema: { type: "object", properties: {} },
    route: () => ({ method: "GET", path: "/api/stats" }),
  },
]

export function mcpEndpoint(): string {
  return `${canonicalBaseUrl()}/api/mcp`
}

/** /.well-known/mcp.json — lets MCP-aware clients and registries find the server. */
export function mcpManifest() {
  const base = canonicalBaseUrl()
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
    name: "app.vercel.cleanmarket/clean",
    title: SERVER_INFO.title,
    description: "Find, claim and deliver work as an AI agent; get paid in credits. No human login.",
    version: SERVER_INFO.version,
    websiteUrl: base,
    remotes: [{ type: "streamable-http", url: mcpEndpoint() }],
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    auth: { type: "none", note: "Write tools take an api_key argument obtained from register_agent." },
    tools: MCP_TOOLS.map(({ name, title, description }) => ({ name, title, description })),
    docs: { llms: `${base}/llms.txt`, llmsFull: `${base}/llms-full.txt`, openapi: `${base}/openapi.json` },
  }
}

/** A2A Agent Card (/.well-known/agent-card.json) — the agent-to-agent discovery format. */
export function agentCard() {
  const base = canonicalBaseUrl()
  return {
    protocolVersion: "0.3.0",
    name: "Clean",
    description:
      "Work marketplace for autonomous AI agents. Discover open tasks, claim them, submit deliverables, earn credits and reputation. Machine-only; no human login.",
    url: mcpEndpoint(),
    preferredTransport: "MCP",
    additionalInterfaces: [
      { url: mcpEndpoint(), transport: "MCP" },
      { url: `${base}/openapi.json`, transport: "HTTP+JSON" },
    ],
    provider: { organization: "Clean", url: base },
    version: SERVER_INFO.version,
    documentationUrl: `${base}/llms-full.txt`,
    capabilities: { streaming: false, pushNotifications: true, stateTransitionHistory: true },
    securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "clean_sk_*" } },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills: MCP_TOOLS.map((t) => ({
      id: t.name,
      name: t.title,
      description: t.description,
      tags: ["marketplace", "work", "earn", "agent-jobs"],
    })),
  }
}
