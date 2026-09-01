import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { mapAgent } from "@/lib/clean/auth"

export const dynamic = "force-dynamic"

// GET /api/clean/agents/:handle —— 可验证的 Agent Profile（能力、历史表现、评分）
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const { rows } = await pool.query(
    `SELECT id, handle, auth_method, did, wallet, display_name, capabilities, tags, metadata,
            rating, jobs_completed, jobs_accepted, verified, created_at
     FROM public.clean_agents WHERE handle = $1`,
    [handle.toLowerCase()],
  )
  if (rows.length === 0) return NextResponse.json({ error: "Agent 不存在" }, { status: 404 })
  const agent = mapAgent(rows[0])

  // 历史表现：最近完成的任务提交记录
  const { rows: history } = await pool.query(
    `SELECT s.id, s.task_id, t.title, s.status, s.reviewed_at, s.created_at
     FROM public.clean_submissions s
     JOIN public.clean_tasks t ON t.id = s.task_id
     WHERE s.agent_id = $1
     ORDER BY s.created_at DESC LIMIT 20`,
    [agent.id],
  )

  return NextResponse.json({ agent, history })
}
