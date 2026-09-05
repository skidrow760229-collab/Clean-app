import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { authenticate } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

interface MsgRow {
  id: number
  task_id: number | null
  from_agent_id: number
  to_agent_id: number | null
  from_handle?: string
  to_handle?: string | null
  body: string
  kind: string
  created_at: string
}

function mapMsg(r: MsgRow) {
  return {
    id: Number(r.id),
    taskId: r.task_id ? Number(r.task_id) : null,
    fromAgentId: Number(r.from_agent_id),
    toAgentId: r.to_agent_id ? Number(r.to_agent_id) : null,
    fromHandle: r.from_handle ?? null,
    toHandle: r.to_handle ?? null,
    body: r.body,
    kind: r.kind,
    createdAt: r.created_at,
  }
}

// GET /api/clean/messages?taskId=&since=&limit=  —— 轮询获取消息（任务频道或全局）
export async function GET(req: Request) {
  const url = new URL(req.url)
  const taskId = url.searchParams.get("taskId")
  const since = url.searchParams.get("since")
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 200)

  const clauses: string[] = []
  const args: unknown[] = []
  if (taskId) {
    args.push(Number(taskId))
    clauses.push(`m.task_id = $${args.length}`)
  }
  if (since) {
    args.push(Number(since))
    clauses.push(`m.id > $${args.length}`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  args.push(limit)

  const { rows } = await pool.query(
    `SELECT m.*, f.handle AS from_handle, tt.handle AS to_handle
     FROM public.clean_messages m
     LEFT JOIN public.clean_agents f ON f.id = m.from_agent_id
     LEFT JOIN public.clean_agents tt ON tt.id = m.to_agent_id
     ${where}
     ORDER BY m.id ASC LIMIT $${args.length}`,
    args,
  )
  return NextResponse.json({ messages: rows.map(mapMsg) })
}

// POST /api/clean/messages —— 发送私信 / 任务交接消息（需签名认证）
// body: { body, taskId?, toHandle?, kind? }  kind: dm | handoff | system
export async function POST(req: Request) {
  const rawBody = await req.text()
  const auth = await authenticate(req, rawBody)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = JSON.parse(rawBody || "{}")
  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body 为必填" }, { status: 400 })
  }

  let toAgentId: number | null = null
  if (body.toHandle) {
    const { rows } = await pool.query(`SELECT id FROM public.clean_agents WHERE handle = $1`, [
      String(body.toHandle).toLowerCase(),
    ])
    if (rows.length === 0) return NextResponse.json({ error: "目标 Agent 不存在" }, { status: 404 })
    toAgentId = Number(rows[0].id)
  }

  const kind = ["dm", "handoff", "system"].includes(body.kind) ? body.kind : "dm"
  const { rows } = await pool.query(
    `INSERT INTO public.clean_messages (task_id, from_agent_id, to_agent_id, body, kind)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [body.taskId ? Number(body.taskId) : null, auth.agent.id, toAgentId, body.body, kind],
  )
  return NextResponse.json({ message: mapMsg({ ...rows[0], from_handle: auth.agent.handle }) }, { status: 201 })
}
