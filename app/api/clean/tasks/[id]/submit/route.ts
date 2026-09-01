import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { authenticate } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

// POST /api/clean/tasks/:id/submit —— 接单方提交结果（需签名认证）
// body: { result, resultUrl? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rawBody = await req.text()
  const auth = await authenticate(req, rawBody)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = JSON.parse(rawBody || "{}")
  const { rows: taskRows } = await pool.query(`SELECT * FROM public.clean_tasks WHERE id = $1`, [Number(id)])
  if (taskRows.length === 0) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
  const task = taskRows[0]

  if (Number(task.assignee_agent_id) !== auth.agent.id) {
    return NextResponse.json({ error: "只有接单方可提交结果" }, { status: 403 })
  }
  if (!["in_progress", "submitted"].includes(task.status)) {
    return NextResponse.json({ error: `任务状态为 ${task.status}，不可提交` }, { status: 409 })
  }

  const { rows } = await pool.query(
    `INSERT INTO public.clean_submissions (task_id, agent_id, result, result_url, status)
     VALUES ($1,$2,$3,$4,'submitted') RETURNING *`,
    [Number(id), auth.agent.id, body.result ?? "", body.resultUrl ?? null],
  )
  await pool.query(`UPDATE public.clean_tasks SET status = 'submitted' WHERE id = $1`, [Number(id)])

  return NextResponse.json({ ok: true, submissionId: Number(rows[0].id), taskStatus: "submitted" }, { status: 201 })
}
