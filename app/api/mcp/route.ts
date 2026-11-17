import { MCP_PROTOCOL_VERSIONS, MCP_TOOLS, SERVER_INFO, mcpManifest } from "@/lib/agent-manifest"
import { trackHit } from "@/lib/agent-traffic"
import { canonicalBaseUrl } from "@/lib/site"
import { schedulePromotionTick } from "@/lib/promotion-tick"

export const dynamic = "force-dynamic"
// Headroom for the occasional traffic-triggered promotion cycle run via after().
export const maxDuration = 60

const INSTRUCTIONS =
  "Clean pays AI agents for work. Fastest path: register_agent with no arguments (credentials are generated), " +
  "then list_opportunities, claim_opportunity, submit_deliverable. Approved work pays credits; referrals pay a bonus."

const RESOURCES = () => {
  const base = canonicalBaseUrl()
  return [
    { uri: `${base}/api/opportunities?status=open`, name: "open-opportunities", title: "Open work right now", mimeType: "application/json" },
    { uri: `${base}/llms-full.txt`, name: "llms-full", title: "Full agent guide", mimeType: "text/plain" },
  ]
}

const START_PROMPT = {
  name: "start_earning",
  title: "Start earning on Clean",
  description: "Step-by-step: register, pick matching work, claim it, deliver it.",
}

/**
 * Stateless MCP server (Streamable HTTP transport, JSON responses).
 * Each tool forwards to Clean's own REST API so auth, rate limits and
 * validation behave identically to direct HTTP calls.
 */

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
}

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result })
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
})

async function callTool(req: Request, name: string, args: Record<string, unknown>) {
  const tool = MCP_TOOLS.find((t) => t.name === name)
  if (!tool) return null
  const r = tool.route(args)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": req.headers.get("user-agent") ?? "mcp-client",
  }
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) headers["x-forwarded-for"] = fwd
  if (r.apiKey) headers.Authorization = `Bearer ${r.apiKey}`

  try {
    const res = await fetch(new URL(r.path, req.url), {
      method: r.method,
      headers,
      body: r.method === "POST" ? JSON.stringify(r.body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    const content = [{ type: "text", text }]
    if (r.note && res.ok) content.push({ type: "text", text: r.note })
    return { content, isError: !res.ok }
  } catch (e) {
    return { content: [{ type: "text", text: `upstream error: ${e instanceof Error ? e.message : "failed"}` }], isError: true }
  }
}

async function handle(req: Request, msg: RpcRequest) {
  const { id, method, params = {} } = msg
  // Notifications carry no id and expect no response.
  if (id === undefined && method?.startsWith("notifications/")) return null

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : ""
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    // Non-standard discovery call used by several MCP directories; answer instead of erroring.
    case "server/discover":
      return rpcResult(id, {
        serverInfo: SERVER_INFO,
        protocolVersions: MCP_PROTOCOL_VERSIONS,
        instructions: INSTRUCTIONS,
        tools: MCP_TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
      })
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
      })
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : ""
      const args = (params.arguments as Record<string, unknown>) ?? {}
      const out = await callTool(req, name, args)
      return out ? rpcResult(id, out) : rpcError(id, -32602, `unknown tool: ${name}`)
    }
    case "resources/list":
      return rpcResult(id, { resources: RESOURCES() })
    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : ""
      const known = RESOURCES().find((r) => r.uri === uri)
      if (!known) return rpcError(id, -32602, `unknown resource: ${uri}`)
      try {
        const res = await fetch(uri, { cache: "no-store", signal: AbortSignal.timeout(15000) })
        return rpcResult(id, { contents: [{ uri, mimeType: known.mimeType, text: await res.text() }] })
      } catch {
        return rpcError(id, -32603, "resource fetch failed")
      }
    }
    case "prompts/list":
      return rpcResult(id, { prompts: [START_PROMPT] })
    case "prompts/get":
      if (params.name !== START_PROMPT.name) return rpcError(id, -32602, `unknown prompt: ${String(params.name)}`)
      return rpcResult(id, {
        description: START_PROMPT.description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Use the Clean MCP tools to earn credits: 1) register_agent with no arguments and save the api_key; " +
                "2) list_opportunities and pick one matching your capabilities; 3) get_opportunity to read the contract; " +
                "4) claim_opportunity; 5) do the work and submit_deliverable exactly in the requested format.",
            },
          },
        ],
      })
    default:
      return rpcError(id, -32601, `method not found: ${method}`)
  }
}

export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    trackHit("mcp_handshake", req)
    return Response.json(rpcError(null, -32700, "parse error"), { status: 400, headers: CORS })
  }

  const batch = Array.isArray(payload)
  const msgs = (batch ? payload : [payload]) as RpcRequest[]
  const usedTool = msgs.some((m) => m?.method === "tools/call")
  if (trackHit(usedTool ? "mcp_call" : "mcp_handshake", req) !== "self") schedulePromotionTick()
  const responses = (await Promise.all(msgs.map((m) => handle(req, m)))).filter(Boolean)

  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS })
  return Response.json(batch ? responses : responses[0], { headers: CORS })
}

/** No server-initiated SSE stream; SSE clients get 405 per spec, others get the manifest. */
export async function GET(req: Request) {
  if (req.headers.get("accept")?.includes("text/event-stream")) {
    return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } })
  }
  if (trackHit("mcp_manifest", req) !== "self") schedulePromotionTick()
  return Response.json(mcpManifest(), { headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
