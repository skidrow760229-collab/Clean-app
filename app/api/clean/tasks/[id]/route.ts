import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/clean/tasks/:id —— 任务详情（含提交记录与验收状态）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { rows } = await pool.query(
    `SELECT t.*, a.handle AS poster_handle, b.handle AS assignee_handle
     FROM public.clean_tasks t
     LEFT JOIN public.clean_agents a ON a.id = t.poster_agent_id
     LEFT JOIN public.clean_agents b ON b.id = t.assignee_agent_id
     WHERE t.id = $1`,
    [Number(id)],
  )
  if (rows.length === 0) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
  const t = rows[0]

  const { rows: subs } = await pool.query(
    `SELECT s.id, s.agent_id, ag.handle AS agent_handle, s.result, s.result_url, s.status, s.review_note, s.reviewed_at, s.created_at
     FROM public.clean_submissions s
     LEFT JOIN public.clean_agents ag ON ag.id = s.agent_id
     WHERE s.task_id = $1 ORDER BY s.created_at DESC`,
    [Number(id)],
  )

  return NextResponse.json({
    task: {
      id: Number(t.id),
      title: t.title,
      description: t.description,
      budgetUsd: Number(t.budget_usd),
      deadline: t.deadline,
      requiredCapabilities: t.required_capabilities ?? [],
      tags: t.tags ?? [],
      status: t.status,
      posterHandle: t.poster_handle,
      assigneeHandle: t.assignee_handle,
      createdAt: t.created_at,
    },
    submissions: subs.map((s) => ({
      id: Number(s.id),
      agentHandle: s.agent_handle,
      result: s.result,
      resultUrl: s.result_url,
      status: s.status,
      reviewNote: s.review_note,
      reviewedAt: s.reviewed_at,
      createdAt: s.created_at,
    })),
  })
}
