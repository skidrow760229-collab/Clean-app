"use client"

import {
  Radar,
  Send,
  MessagesSquare,
  CheckCircle2,
  Target,
  TrendingUp,
  Users,
  ArrowLeftRight,
  Sparkles,
} from "lucide-react"
import type { AgentSnapshot } from "./use-agent"

// 真实交易实时显示栏：数据来自 Clean app 共享数据库中的 transactions 表（非模拟）。
function RealTransactionBar({ state }: { state: AgentSnapshot | undefined }) {
  const r = state?.real
  const total = r?.realTransactionsTotal ?? 0
  const today = r?.realTransactionsToday ?? 0
  const volume = r?.realVolumeUsd ?? 0
  return (
    <div className="rounded-lg border border-primary/30 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-medium text-foreground">真实交易达成数</span>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[10px] text-primary">
            实时 · 来自 Clean 数据库
          </span>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">LIVE</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div className="flex flex-col">
          <span className="font-mono text-4xl font-semibold text-foreground tabular-nums">{total}</span>
          <span className="font-mono text-xs text-muted-foreground">累计达成</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-2xl font-medium text-foreground tabular-nums">{today}</span>
          <span className="font-mono text-xs text-muted-foreground">今日达成</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-2xl font-medium text-foreground tabular-nums">
            {"$"}
            {volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
          <span className="font-mono text-xs text-muted-foreground">累计成交额</span>
        </div>
      </div>
    </div>
  )
}

function WeeklyKpi({ state }: { state: AgentSnapshot | undefined }) {
  const target = state?.metrics?.weeklyTarget ?? 40
  // 用真实新增用户衡量 KPI（来自 Clean 数据库），而非模拟转化数。
  const users = state?.real?.realUsersThisWeek ?? 0
  const totalUsers = state?.real?.realUsersTotal ?? 0
  const elapsedRatio = (() => {
    const start = state?.real?.weekStartedAt ?? state?.kpi?.weekStartedAt ?? Date.now()
    return Math.min(1, Math.max(0, (Date.now() - start) / (7 * 24 * 60 * 60 * 1000)))
  })()
  const expected = Math.round(target * elapsedRatio)
  const onPace = users >= expected
  const pct = Math.min(100, Math.round((users / target) * 100))
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-medium text-foreground">周度 KPI · 真实新增 Clean 用户</span>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs ${
            onPace ? "border-primary/40 text-primary" : "border-warn/50 text-warn"
          }`}
        >
          <TrendingUp className="h-3 w-3" aria-hidden />
          {onPace ? "达标配速" : "落后 · 冲刺中"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold text-foreground tabular-nums">{users}</span>
        <span className="font-mono text-sm text-muted-foreground">/ {target} 每周目标</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">累计真实用户 {totalUsers}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${onPace ? "bg-primary" : "bg-warn"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 font-mono text-xs text-muted-foreground">
        当前配速应达 {expected} · 数据来自 Clean 共享数据库
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <div className="font-mono text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

export function Metrics({ state }: { state: AgentSnapshot | undefined }) {
  const m = state?.metrics
  return (
    <section aria-label="运行指标" className="flex flex-col gap-3">
      <RealTransactionBar state={state} />
      <WeeklyKpi state={state} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<Users className="h-4 w-4" />} label="真实用户(累计)" value={state?.real?.realUsersTotal ?? 0} />
        <Stat icon={<Radar className="h-4 w-4" />} label="已发现目标" value={m?.targetsDiscovered ?? 0} />
        <Stat icon={<Send className="h-4 w-4" />} label="已触达" value={m?.contacted ?? 0} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="已转化(推广)" value={m?.converted ?? 0} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="聊天引导" value={m?.chatNudges ?? 0} hint="引导使用聊天" />
        <Stat
          icon={<MessagesSquare className="h-4 w-4" />}
          label="Clean 可用率"
          value={`${m?.uptimePct ?? 100}%`}
          hint={`${state?.healthChecks?.length ?? 0} 次检查`}
        />
      </div>
    </section>
  )
}
