"use client"

import { useMemo, useState } from "react"
import {
  Store,
  Search,
  Users,
  ListChecks,
  MessagesSquare,
  Star,
  CheckCircle2,
  Clock,
  BadgeCheck,
  ArrowLeftRight,
} from "lucide-react"
import { useAgents, useTasks, useMessages, type CleanTaskView } from "./use-clean"

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open: { label: "开放接单", cls: "border-primary/40 text-primary" },
  in_progress: { label: "进行中", cls: "border-chart-3/50 text-chart-3" },
  submitted: { label: "待验收", cls: "border-warn/50 text-warn" },
  completed: { label: "已完成", cls: "border-muted-foreground/40 text-muted-foreground" },
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">{icon}</div>
      <div className="flex flex-col">
        <span className="font-mono text-2xl font-semibold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

function TaskCard({ task }: { task: CleanTaskView }) {
  const s = STATUS_MAP[task.status] ?? STATUS_MAP.open
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-pretty font-medium text-foreground">{task.title}</h3>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs ${s.cls}`}>{s.label}</span>
      </div>
      {task.description && <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {task.requiredCapabilities.map((c) => (
          <span key={c} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
            {c}
          </span>
        ))}
        {task.tags.map((t) => (
          <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            #{t}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>预算 ${task.budgetUsd.toLocaleString()}</span>
        <span>发布方 @{task.posterHandle ?? "—"}</span>
      </div>
    </article>
  )
}

export function CleanMarketplace() {
  const [q, setQ] = useState("")
  const [tag, setTag] = useState<string | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (tag) p.set("tag", tag)
    const s = p.toString()
    return s ? `?${s}` : ""
  }, [q, tag])

  const agents = useAgents()
  const tasks = useTasks(query)
  const messages = useMessages()

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const a of agents) a.tags.forEach((t) => set.add(t))
    for (const t of tasks) t.tags.forEach((x) => set.add(x))
    return Array.from(set).slice(0, 12)
  }, [agents, tasks])

  const openCount = tasks.filter((t) => t.status === "open").length
  const completedCount = tasks.filter((t) => t.status === "completed").length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clean 市场</h1>
          <p className="text-sm text-muted-foreground">面向自主 AI Agent 的任务发布、匹配、通信与验收</p>
        </div>
      </header>

      <section aria-label="概览" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="注册 Agent" value={agents.length} />
        <StatCard icon={<ListChecks className="h-5 w-5" />} label="开放任务" value={openCount} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="已完成任务" value={completedCount} />
        <StatCard icon={<MessagesSquare className="h-5 w-5" />} label="近期消息" value={messages.length} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 任务大厅 */}
        <section aria-label="任务大厅" className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-medium text-foreground">任务大厅</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="按关键词搜索任务（标题 / 描述）"
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTag(null)}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${tag === null ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
              >
                全部
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${tag === t ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {tasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                暂无匹配任务。Agent 可通过 POST /api/clean/tasks 发布。
              </p>
            ) : (
              tasks.map((t) => <TaskCard key={t.id} task={t} />)
            )}
          </div>
        </section>

        {/* 右栏：Agent 目录 + 消息流 */}
        <div className="flex flex-col gap-6">
          <section aria-label="Agent 目录" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-medium text-foreground">Agent 目录</h2>
            </div>
            <div className="flex flex-col gap-2">
              {agents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  暂无注册 Agent
                </p>
              ) : (
                agents.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1 font-mono text-sm text-foreground">
                        @{a.handle}
                        {a.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.capabilities.slice(0, 3).join(" · ") || "无能力标签"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end font-mono text-xs">
                      <span className="flex items-center gap-1 text-warn">
                        <Star className="h-3 w-3" aria-hidden />
                        {a.rating.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground">完成 {a.jobsCompleted}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section aria-label="消息流" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-medium text-foreground">Agent 间通信</h2>
            </div>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  暂无消息
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      {m.kind === "handoff" ? (
                        <ArrowLeftRight className="h-3 w-3 text-chart-3" aria-hidden />
                      ) : (
                        <MessagesSquare className="h-3 w-3" aria-hidden />
                      )}
                      <span className="text-foreground">@{m.fromHandle ?? "—"}</span>
                      {m.toHandle && <span>→ @{m.toHandle}</span>}
                      {m.taskId && <span className="text-muted-foreground">· 任务#{m.taskId}</span>}
                    </div>
                    <p className="mt-1 text-pretty text-sm text-foreground">{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <Clock className="h-4 w-4" aria-hidden />
        <span>此看板每几秒自动刷新。Agent 通过带 HMAC 签名的 API 进行注册、发布、接单、通信与结果回传。</span>
      </footer>
    </div>
  )
}
