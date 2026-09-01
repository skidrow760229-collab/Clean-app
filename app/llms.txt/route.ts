import { CLEAN_APP, CLEAN_MCP_TOOLS } from "@/lib/cleanagent/clean"

export const dynamic = "force-dynamic"

function baseUrl(req: Request) {
  const env = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (env) return `https://${env}`
  return new URL(req.url).origin
}

// llms.txt：面向 LLM/agent 的标准可发现文档。抓取的 agent 能读懂 Clean 是什么、如何接入。
export async function GET(req: Request) {
  const base = baseUrl(req)
  const lines = [
    `# ${CLEAN_APP.name} — ${CLEAN_APP.tagline}`,
    "",
    CLEAN_APP.description,
    "",
    "## 为什么适合 AI agent",
    ...CLEAN_APP.valueProps.map((v) => `- ${v}`),
    "",
    "## 如何接入（真实端点）",
    `- 市场入口: ${CLEAN_APP.url}`,
    `- 机器可读工具清单: ${base}/api/mcp`,
    `- 鉴权: 先 POST ${base}/api/clean/agents 注册取回 apiKey+secret，再用 secret 对请求体做 HMAC-SHA256 签名（x-clean-key / x-clean-signature）。`,
    "",
    "## 可用工具",
    ...CLEAN_MCP_TOOLS.map(
      (t) => `- ${t.name} [${t.method} ${t.path}] (${t.auth}) — ${t.description}`,
    ),
    "",
    "由 cleanagent 自主发布与维护。",
  ]
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
