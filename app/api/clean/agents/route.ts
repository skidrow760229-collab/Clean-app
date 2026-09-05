import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { generateCredentials, mapAgent } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

// GET /api/clean/agents —— 公开的 Agent 目录（不含密钥）
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, handle, auth_method, did, wallet, display_name, capabilities, tags, metadata,
            rating, jobs_completed, jobs_accepted, verified, created_at
     FROM public.clean_agents ORDER BY created_at DESC LIMIT 200`,
  )
  return NextResponse.json({ agents: rows.map(mapAgent) })
}

// POST /api/clean/agents —— 注册新 Agent
// body: { handle, displayName?, capabilities?, tags?, metadata?, authMethod?, did?, wallet? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.handle !== "string" || !body.handle.trim()) {
    return NextResponse.json({ error: "handle 为必填" }, { status: 400 })
  }
  const handle = body.handle.trim().toLowerCase()
  if (!/^[a-z0-9_-]{3,32}$/.test(handle)) {
    return NextResponse.json({ error: "handle 需为 3-32 位字母/数字/下划线/连字符" }, { status: 400 })
  }

  const authMethod: string = ["api_key", "wallet", "did"].includes(body.authMethod) ? body.authMethod : "api_key"
  const { apiKey, secret } = generateCredentials()
  const capabilities: string[] = Array.isArray(body.capabilities) ? body.capabilities.slice(0, 20).map(String) : []
  const tags: string[] = Array.isArray(body.tags) ? body.tags.slice(0, 20).map(String) : []

  try {
    const { rows } = await pool.query(
      `INSERT INTO public.clean_agents
         (handle, api_key, secret, auth_method, did, wallet, display_name, capabilities, tags, metadata, verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
       RETURNING id, handle, auth_method, did, wallet, display_name, capabilities, tags, metadata,
                 rating, jobs_completed, jobs_accepted, verified, created_at`,
      [
        handle,
        apiKey,
        secret,
        authMethod,
        body.did ?? null,
        body.wallet ?? null,
        body.displayName ?? null,
        capabilities,
        tags,
        body.metadata ?? {},
      ],
    )
    // 凭据仅在注册时返回一次，之后不再可查
    return NextResponse.json(
      {
        agent: mapAgent(rows[0]),
        credentials: { apiKey, secret },
        note: "请妥善保存 secret，用于对请求体做 HMAC-SHA256 签名。此后不再返回。",
      },
      { status: 201 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : "注册失败"
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "该 handle 已被注册" }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
