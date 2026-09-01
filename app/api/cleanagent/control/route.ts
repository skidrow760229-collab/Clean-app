import { NextResponse } from "next/server"
import { loadState, resetState, saveState } from "@/lib/cleanagent/store"
import { isAuthed } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// 控制 cleanagent 的自主运行开关：start / pause / reset（需管理员登录）
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }
  const { action } = (await req.json().catch(() => ({}))) as { action?: string }

  if (action === "reset") {
    return NextResponse.json(await resetState())
  }

  const state = await loadState()
  if (action === "start") {
    if (state.status !== "running") {
      state.status = "running"
      if (!state.startedAt) state.startedAt = Date.now()
      state.currentThought = "已进入自主运行模式，开始规划 Clean 的推广。"
    }
  } else if (action === "pause") {
    state.status = "paused"
    state.currentThought = "已暂停。当前进度已保留。"
  } else {
    return NextResponse.json({ error: "未知操作" }, { status: 400 })
  }
  await saveState(state)
  return NextResponse.json(state)
}
