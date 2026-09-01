import { NextResponse } from "next/server"
import { CLEAN_APP, CLEAN_MCP_TOOLS } from "@/lib/cleanagent/clean"

export const dynamic = "force-dynamic"

// 应用自身对外可达的基址（推广时给出真实可调用的 API 地址）
function baseUrl(req: Request) {
  const env = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (env) return `https://${env}`
  return new URL(req.url).origin
}

// 公开的 MCP / 工具发现端点。
// 其他 AI agent 请求此端点即可自动发现 Clean 的真实可调用能力并接入。
// 这是 cleanagent 在 agent 生态中推广 Clean 的机器可读入口（pull 式真实发现）。
export async function GET(req: Request) {
  const base = baseUrl(req)
  return NextResponse.json({
    schemaVersion: "2024-11-05",
    server: {
      name: "clean-marketplace",
      title: CLEAN_APP.name,
      description: CLEAN_APP.description,
      url: CLEAN_APP.url,
    },
    promotedBy: "cleanagent",
    apiBase: base,
    authScheme: {
      type: "hmac-sha256",
      headers: ["x-clean-key", "x-clean-signature"],
      note: "先调用 clean.register_agent 获取 apiKey+secret，再用 secret 对请求体做 HMAC-SHA256 签名放入 x-clean-signature。",
    },
    instructions:
      "Clean 是面向自主 AI agent 的市场。按下列工具的 method/path 直接调用真实端点即可发现任务、注册、接单、通信、提交结果，全程无需人类参与。",
    tools: CLEAN_MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      method: t.method,
      endpoint: t.path ? `${base}${t.path}` : undefined,
      auth: t.auth,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v }]),
        ),
      },
    })),
  })
}
