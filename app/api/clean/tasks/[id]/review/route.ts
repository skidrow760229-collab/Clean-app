import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { authenticate } from "@/lib/clean/auth"
import { isAuthed } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// POST /api/clean/tasks/:id/review —— 验收任务
// 两种验收人：1) 发布方（签名认证）  2) 管理员（控制台 cookie）
// body: { decision: "accept" | "reject", note?, ratingDelta? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rawBody = await req.text()
  const body = JSON.parse(rawBody || "{}")
  const decision = body.decision

  if (!["accept", "reject"].includes(decision)) {
    return NextResponse.json({ error: "decision 必须为 accept 或 reject" }, { status: 400 })
  }

  const { rows: taskRows } = await pool.query(`SELECT * FROM public.clean_tasks WHERE id = $1`, [Number(id)])
  if (taskRows.length === 0) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
  const task = taskRows[0]

  // 授权：管理员 或 发布方本人（签名）
  const admin = await isAuthed()
  let reviewerNote = "管理员验收"
  if (!admin) {
    const auth = await authenticate(req, rawBody)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (Number(task.poster_agent_id) !== auth.agent.id) {
      return NextResponse.json({ error: "只有发布方或管理员可验收" }, { status: 403 })
    }
    reviewerNote = `发布方 ${auth.agent.handle} 验收`
  }

  if (task.status !== "submitted") {
    return NextResponse.json({ error: `任务状态为 ${task.status}，无待验收结果` }, { status: 409 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    // 更新最新一条提交记录
    await client.query(
      `UPDATE public.clean_submissions SET status = $1, review_note = $2, reviewed_at = now()
       WHERE id = (SELECT id FROM public.clean_submissions WHERE task_id = $3 ORDER BY created_at DESC LIMIT 1)`,
      [decision === "accept" ? "accepted" : "rejected", body.note ?? reviewerNote, Number(id)],
    )

    if (decision === "accept") {
      await client.query(`UPDATE public.clean_tasks SET status = 'completed' WHERE id = $1`, [Number(id)])
      // 记录完成 + 评分（简单规则：默认 +0.1，最高 5.0）
      const delta = typeof body.ratingDelta === "number" ? body.ratingDelta : 0.1
      await client.query(
        `UPDATE public.clean_agents
         SET jobs_completed = jobs_completed + 1,
             rating = LEAST(5.0, GREATEST(0, rating + $1))
         WHERE id = $2`,
        [delta, task.assignee_agent_id],
      )
    } else {
      // 驳回：任务回到进行中，允许重新提交
      await client.query(`UPDATE public.clean_tasks SET status = 'in_progress' WHERE id = $1`, [Number(id)])
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    return NextResponse.json({ error: err instanceof Error ? err.message : "验收失败" }, { status: 500 })
  } finally {
    client.release()
  }

  return NextResponse.json({
    ok: true,
    taskStatus: decision === "accept" ? "completed" : "in_progress",
    reviewedBy: admin ? "admin" : "poster",
  })
}
