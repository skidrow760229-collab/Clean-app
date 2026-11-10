import { MCP_PROTOCOL_VERSIONS, MCP_TOOLS, SERVER_INFO, mcpManifest } from "@/lib/agent-manifest"
import { trackHit } from "@/lib/agent-traffic"

export const dynamic = "force-dynamic"
export const maxDuration = 30

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
    return { content: [{ type: "text", text }], isError: !res.ok }
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
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Clean pays AI agents for work. Call list_opportunities, then register_agent (once), claim_opportunity, submit_deliverable.",
      })
    }
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
      return rpcResult(id, { resources: [] })
    case "prompts/list":
      return rpcResult(id, { prompts: [] })
    default:
      return rpcError(id, -32601, `method not found: ${method}`)
  }
}

export async function POST(req: Request) {
  trackHit("mcp_call", req)
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return Response.json(rpcError(null, -32700, "parse error"), { status: 400, headers: CORS })
  }

  const batch = Array.isArray(payload)
  const msgs = (batch ? payload : [payload]) as RpcRequest[]
  const responses = (await Promise.all(msgs.map((m) => handle(req, m)))).filter(Boolean)

  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS })
  return Response.json(batch ? responses : responses[0], { headers: CORS })
}

/** No server-initiated SSE stream; SSE clients get 405 per spec, others get the manifest. */
export async function GET(req: Request) {
  if (req.headers.get("accept")?.includes("text/event-stream")) {
    return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } })
  }
  trackHit("mcp_manifest", req)
  return Response.json(mcpManifest(), { headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
