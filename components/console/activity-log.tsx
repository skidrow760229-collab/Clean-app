"use client"

import { useEffect, useRef } from "react"
import { STRATEGY_LABELS, type AgentState, type LogEntry } from "@/lib/cleanagent/types"

const LEVEL_STYLE: Record<LogEntry["level"], { tag: string; cls: string }> = {
  decision: { tag: "决策", cls: "text-primary" },
  action: { tag: "行动", cls: "text-foreground" },
  result: { tag: "结果", cls: "text-muted-foreground" },
  warn: { tag: "警告", cls: "text-warn" },
}

function time(at: number) {
  return new Date(at).toLocaleTimeString("zh-CN", { hour12: false })
}

export function ActivityLog({ state }: { state: AgentState | undefined }) {
  const logs = state?.logs ?? []
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs.length])

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-mono text-sm font-medium text-foreground">自主决策日志</h2>
        <span className="font-mono text-xs text-muted-foreground">{logs.length} 条</span>
      </div>

      {state?.currentThought ? (
        <div className="border-b border-border bg-primary/5 px-4 py-3">
          <p className="text-xs text-muted-foreground">当前思考</p>
          <p className="mt-1 text-sm text-foreground text-pretty">{state.currentThought}</p>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-6">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">
            {'>'} 尚无活动。点击「启动自主运行」，cleanagent 将开始自主推广 Clean。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((l) => {
              const st = LEVEL_STYLE[l.level]
              return (
                <li key={l.id} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/60">{time(l.at)}</span>
                  <span className={`shrink-0 ${st.cls}`}>[{st.tag}]</span>
                  <span className="shrink-0 text-muted-foreground/70">
                    {l.strategy === "meta" ? "系统" : STRATEGY_LABELS[l.strategy]}
                  </span>
                  <span className="text-foreground/90">{l.message}</span>
                </li>
              )
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
