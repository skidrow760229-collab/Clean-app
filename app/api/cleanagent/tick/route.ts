import { type NextRequest, NextResponse } from "next/server"
import { loadState } from "@/lib/cleanagent/store"
import { runCycle } from "@/lib/cleanagent/engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// 单次批量运行的时间预算（毫秒），预留余量避免触及函数时限。
const TIME_BUDGET_MS = 50_000
// 单次批量最多推进的周期数上限。
const MAX_CYCLES = 40

// 推进一个自主周期。仅在 cleanagent 处于 running 状态时执行。
async function advanceOnce() {
  const state = await loadState()
  if (state.status !== "running") {
    return { skipped: true as const, reason: "agent 未在运行", state }
  }
  // runCycle 内部会从 Neon 读取最新状态并持久化结果。
  const next = await runCycle()
  return { skipped: false as const, state: next }
}

// 批量模式：在时间预算内连续推进多个周期。
// 用于低频 Cron（如每日一次）唤醒时，让 cleanagent 一次完成大量推广工作。
async function advanceBatch() {
  const start = Date.now()
  let ran = 0
  let last = await advanceOnce()
  if (last.skipped) {
    return NextResponse.json({ mode: "batch", ran, ...last })
  }
  ran = 1
  while (ran < MAX_CYCLES && Date.now() - start < TIME_BUDGET_MS) {
    last = await advanceOnce()
    if (last.skipped) break
    ran += 1
  }
  return NextResponse.json({ mode: "batch", ran, skipped: false, state: last.state })
}

// 浏览器控制台的自主循环通过 POST 驱动（单周期，实时呈现）。
export async function POST() {
  const r = await advanceOnce()
  return NextResponse.json({ mode: "single", ...r })
}

// Vercel Cron 通过 GET 驱动，实现无人参与、无需页面打开的持续运行。
// 带 ?batch=1 时一次推进多个周期，适配低频（每日）调度。
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("batch") === "1") {
    return advanceBatch()
  }
  const r = await advanceOnce()
  return NextResponse.json({ mode: "single", ...r })
}
