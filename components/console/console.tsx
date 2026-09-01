"use client"

import { useAgent } from "./use-agent"
import { Topbar } from "./topbar"
import { Metrics } from "./metrics"
import { ActivityLog } from "./activity-log"
import { Panels } from "./panels"

export function Console() {
  const { state, control } = useAgent()

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <Topbar state={state} onControl={control} />

      <Metrics state={state} />

      <section className="grid flex-1 gap-4 lg:grid-cols-2" aria-label="运行详情">
        <div className="min-h-[26rem] lg:h-[34rem]">
          <ActivityLog state={state} />
        </div>
        <div className="min-h-[26rem] lg:h-[34rem]">
          <Panels state={state} />
        </div>
      </section>

      <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground text-pretty">
        cleanagent 由 Vercel AI Gateway 驱动，自主决定推广策略（侦察 → 文案 → 对话 → MCP 暴露 → 健康监控），全程无需人类干预。
      </footer>
    </main>
  )
}
