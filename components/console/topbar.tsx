"use client"

import { Play, Pause, RotateCcw, Bot, Cpu, CircuitBoard, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AgentState, EngineMode } from "@/lib/cleanagent/types"

const STATUS_MAP = {
  idle: { label: "待机", dot: "bg-muted-foreground" },
  running: { label: "自主运行中", dot: "bg-primary animate-pulse" },
  paused: { label: "已暂停", dot: "bg-warn" },
} as const

const ENGINE_MAP: Record<EngineMode, { label: string; className: string }> = {
  model: { label: "大模型推理", className: "border-primary/40 text-primary" },
  local: { label: "本地自主推理", className: "border-warn/40 text-warn" },
  unknown: { label: "探测中", className: "border-border text-muted-foreground" },
}

export function Topbar({
  state,
  onControl,
}: {
  state: AgentState | undefined
  onControl: (a: "start" | "pause" | "reset") => void
}) {
  const status = state?.status ?? "idle"
  const s = STATUS_MAP[status]
  const engineMode = state?.engine?.mode ?? "unknown"
  const engine = ENGINE_MAP[engineMode]

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
          <Bot className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">
            cleanagent
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            无人参与 · 自主推广与维护 Clean
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
          <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
          <span className="font-mono text-xs text-foreground">{s.label}</span>
          <span className="font-mono text-xs text-muted-foreground">· 周期 {state?.cycle ?? 0}</span>
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 ${engine.className}`}
          title={state?.engine?.detail ?? "尚未探测推理引擎"}
        >
          {engineMode === "model" ? (
            <Cpu className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CircuitBoard className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="font-mono text-xs">{engine.label}</span>
        </div>

        {status !== "running" ? (
          <Button size="sm" onClick={() => onControl("start")} className="gap-1.5">
            <Play className="h-4 w-4" aria-hidden />
            {status === "paused" ? "继续" : "启动自主运行"}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onControl("pause")} className="gap-1.5">
            <Pause className="h-4 w-4" aria-hidden />
            暂停
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onControl("reset")}
          className="gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          <span className="sr-only md:not-sr-only">重置</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" })
            window.location.reload()
          }}
          className="gap-1.5 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="sr-only md:not-sr-only">登出</span>
        </Button>
      </div>
    </header>
  )
}
