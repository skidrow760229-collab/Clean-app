import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { authenticate } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

interface TaskRow {
  id: number
  poster_agent_id: number
  poster_handle?: string
  title: string
  description: string
  budget_usd: string
  deadline: string | null
  required_capabilities: string[]
  tags: string[]
  status: string
  assignee_agent_id: number | null
  created_at: string
}

function mapTask(r: TaskRow) {
  return {
    id: Number(r.id),
    posterAgentId: Number(r.poster_agent_id),
    posterHandle: r.poster_handle ?? null,
    title: r.title,
    description: r.description,
    budgetUsd: Number(r.budget_usd),
    deadline: r.deadline,
    requiredCapabilities: r.required_capabilities ?? [],
    tags: r.tags ?? [],
    status: r.status,
    assigneeAgentId: r.assignee_agent_id ? Number(r.assignee_agent_id) : null,
    createdAt: r.created_at,
  }
}

// GET /api/clean/tasks?q=关键词&tag=标签&capability=能力&status=open
// 基础匹配：关键词（标题/描述）+ 标签 + 能力过滤
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim()
  const tag = url.searchParams.get("tag")?.trim()
  const capability = url.searchParams.get("capability")?.trim()
  const status = url.searchParams.get("status")?.trim()

  const clauses: string[] = []
  const args: unknown[] = []
  if (q) {
    args.push(`%${q}%`)
    clauses.push(`(t.title ILIKE $${args.length} OR t.description ILIKE $${args.length})`)
  }
  if (tag) {
    args.push(tag)
    clauses.push(`$${args.length} = ANY(t.tags)`)
  }
  if (capability) {
    args.push(capability)
    clauses.push(`$${args.length} = ANY(t.required_capabilities)`)
  }
  if (status) {
    args.push(status)
    clauses.push(`t.status = $${args.length}`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""

  const { rows } = await pool.query(
    `SELECT t.*, a.handle AS poster_handle
     FROM public.clean_tasks t
     LEFT JOIN public.clean_agents a ON a.id = t.poster_agent_id
     ${where}
     ORDER BY t.created_at DESC LIMIT 200`,
    args,
  )
  return NextResponse.json({ tasks: rows.map(mapTask) })
}

// POST /api/clean/tasks —— 发布任务（需签名认证）
// body: { title, description?, budgetUsd?, deadline?, requiredCapabilities?, tags? }
export async function POST(req: Request) {
  const rawBody = await req.text()
  const auth = await authenticate(req, rawBody)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = JSON.parse(rawBody || "{}")
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title 为必填" }, { status: 400 })
  }

  const { rows } = await pool.query(
    `INSERT INTO public.clean_tasks
       (poster_agent_id, title, description, budget_usd, deadline, required_capabilities, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      auth.agent.id,
      body.title,
      body.description ?? "",
      Number(body.budgetUsd) || 0,
      body.deadline ? new Date(body.deadline).toISOString() : null,
      Array.isArray(body.requiredCapabilities) ? body.requiredCapabilities.slice(0, 20).map(String) : [],
      Array.isArray(body.tags) ? body.tags.slice(0, 20).map(String) : [],
    ],
  )
  return NextResponse.json({ task: mapTask(rows[0]) }, { status: 201 })
}
