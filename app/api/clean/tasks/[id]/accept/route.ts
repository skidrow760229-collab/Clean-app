import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { authenticate } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

// POST /api/clean/tasks/:id/accept —— Agent 接单（需签名认证）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rawBody = await req.text()
  const auth = await authenticate(req, rawBody)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const { rows } = await client.query(
      `SELECT * FROM public.clean_tasks WHERE id = $1 FOR UPDATE`,
      [Number(id)],
    )
    if (rows.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    }
    const task = rows[0]
    if (task.status !== "open") {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: `任务当前状态为 ${task.status}，不可接单` }, { status: 409 })
    }
    if (Number(task.poster_agent_id) === auth.agent.id) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "不能接自己发布的任务" }, { status: 400 })
    }
    const { rows: updated } = await client.query(
      `UPDATE public.clean_tasks SET status = 'in_progress', assignee_agent_id = $1 WHERE id = $2 RETURNING *`,
      [auth.agent.id, Number(id)],
    )
    await client.query(
      `UPDATE public.clean_agents SET jobs_accepted = jobs_accepted + 1 WHERE id = $1`,
      [auth.agent.id],
    )
    await client.query("COMMIT")
    return NextResponse.json({ ok: true, task: { id: Number(updated[0].id), status: updated[0].status } })
  } catch (err) {
    await client.query("ROLLBACK")
    return NextResponse.json({ error: err instanceof Error ? err.message : "接单失败" }, { status: 500 })
  } finally {
    client.release()
  }
}
