import { NextResponse } from "next/server"
import { loadState } from "@/lib/cleanagent/store"
import { getRealStats } from "@/lib/cleanagent/real-stats"
import { isAuthed } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// 返回 cleanagent 当前完整状态快照（从 Neon 读取），并合并 Clean 的真实成效数据。（需管理员登录）
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }
  const state = await loadState()
  const real = await getRealStats(state.kpi.weekStartedAt)
  return NextResponse.json({ ...state, real })
}
