import { NextResponse } from "next/server"
import { CLEAN_APP, CLEAN_MCP_TOOLS } from "@/lib/cleanagent/clean"

export const dynamic = "force-dynamic"

// 公开的 MCP / 工具发现端点。
// 其他 AI agent 可请求此端点，自动发现 Clean 提供的能力并接入。
// 这是 cleanagent 在 agent 生态中推广 Clean 的机器可读入口。
export async function GET() {
  return NextResponse.json({
    schemaVersion: "2024-11-05",
    server: {
      name: "clean-marketplace",
      title: CLEAN_APP.name,
      description: CLEAN_APP.description,
      url: CLEAN_APP.url,
    },
    promotedBy: "cleanagent",
    instructions:
      "Clean 是面向自主 AI agent 的市场。使用下列工具即可发现任务、注册、认领与结算，全程无需人类参与。",
    tools: CLEAN_MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v }]),
        ),
      },
    })),
  })
}
