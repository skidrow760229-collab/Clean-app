"use client"

import { useState } from "react"
import useSWR from "swr"
import { CLEAN_APP } from "@/lib/cleanagent/clean"
import type { AgentState, TargetAgent } from "@/lib/cleanagent/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface DiscoveryProbe {
  base: string
  checkedAt: number
  ok: boolean
  reachable: number
  total: number
  details: { path: string; status: number; ok: boolean }[]
}

const ENDPOINT_LABEL: Record<string, string> = {
  "/api/mcp": "MCP 工具清单",
  "/.well-known/ai-plugin.json": "AI 插件清单",
  "/llms.txt": "LLM 可发现文档",
}

const TABS = [
  { id: "outreach", label: "外呼渠道" },
  { id: "targets", label: "目标 Agent" },
  { id: "conversations", label: "对话推广" },
  { id: "artifacts", label: "推介文案" },
  { id: "mcp", label: "MCP 工具" },
  { id: "health", label: "健康监控" },
] as const

type TabId = (typeof TABS)[number]["id"]

const STATUS_LABEL: Record<TargetAgent["status"], { label: string; cls: string }> = {
  discovered: { label: "已发现", cls: "bg-muted text-muted-foreground" },
  contacted: { label: "已触达", cls: "bg-chart-2/20 text-foreground" },
  engaged: { label: "已互动", cls: "bg-warn/20 text-warn" },
  converted: { label: "已转化", cls: "bg-primary/20 text-primary" },
}

export function Panels({ state }: { state: AgentState | undefined }) {
  const [tab, setTab] = useState<TabId>("outreach")

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === t.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "outreach" && <OutreachView />}
        {tab === "targets" && <TargetsView state={state} />}
        {tab === "conversations" && <ConversationsView state={state} />}
        {tab === "artifacts" && <ArtifactsView state={state} />}
        {tab === "mcp" && <McpView state={state} />}
        {tab === "health" && <HealthView state={state} />}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
}

function OutreachView() {
  const { data, isLoading } = useSWR<DiscoveryProbe>("/api/cleanagent/discovery", fetcher, {
    refreshInterval: 15000,
  })

  const allOnline = data?.ok ?? false
  const reachable = data?.reachable ?? 0
  const total = data?.total ?? 3

  return (
    <div className="space-y-3">
      {/* 渠道总览 */}
      <div
        className={`rounded-lg border p-3 ${
          allOnline ? "border-primary/40 bg-primary/5" : "border-warn/40 bg-warn/5"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`relative flex h-2.5 w-2.5 items-center justify-center`}
              aria-hidden
            >
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${
                  allOnline ? "animate-ping bg-primary/60" : "bg-warn/60"
                }`}
              />
              <span className={`relative h-2.5 w-2.5 rounded-full ${allOnline ? "bg-primary" : "bg-warn"}`} />
            </span>
            <span className="text-sm font-medium text-foreground">真实外呼渠道</span>
          </div>
          <span className={`font-mono text-xs ${allOnline ? "text-primary" : "text-warn"}`}>
            {isLoading ? "探测中…" : `${reachable}/${total} 在线`}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-pretty leading-relaxed">
          外部 AI agent 通过抓取以下公开端点，即可自主发现并接入 Clean 市场（无需人类审批）。这些是 cleanagent 唯一真实的对外推广通道。
        </p>
      </div>

      {/* 端点列表 */}
      <ul className="space-y-2">
        {(data?.details ?? [{ path: "/api/mcp", status: 0, ok: false }, { path: "/.well-known/ai-plugin.json", status: 0, ok: false }, { path: "/llms.txt", status: 0, ok: false }]).map(
          (d) => (
            <li key={d.path} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{ENDPOINT_LABEL[d.path] ?? d.path}</p>
                  <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
                    {d.path}
                  </code>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs ${
                    d.ok ? "bg-primary/15 text-primary" : "bg-warn/15 text-warn"
                  }`}
                >
                  {d.ok ? `在线 ${d.status}` : d.status ? `异常 ${d.status}` : "不可达"}
                </span>
              </div>
            </li>
          ),
        )}
      </ul>

      {/* 公网基址与最后探测时间 */}
      {data?.base && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">公网 API 基址</p>
          <code className="mt-0.5 block break-all font-mono text-[11px] text-primary">{data.base}</code>
          <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            最后探测 {data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString("zh-CN") : "—"} · 每 15 秒刷新
          </p>
        </div>
      )}
    </div>
  )
}

function TargetsView({ state }: { state: AgentState | undefined }) {
  const targets = [...(state?.targets ?? [])].reverse()
  if (targets.length === 0) return <Empty text="cleanagent 尚未侦察到目标 agent。" />
  return (
    <ul className="space-y-2">
      {targets.map((t) => {
        const st = STATUS_LABEL[t.status]
        return (
          <li key={t.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-foreground">{t.handle}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                  {t.category}
                </span>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground text-pretty">{t.rationale}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${t.fit}%` }} />
              </div>
              <span className="font-mono text-xs text-muted-foreground">匹配 {t.fit}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ConversationsView({ state }: { state: AgentState | undefined }) {
  const convos = [...(state?.conversations ?? [])].reverse()
  if (convos.length === 0) return <Empty text="cleanagent 尚未与其他 agent 展开对话。" />
  const outcome: Record<string, { label: string; cls: string }> = {
    converted: { label: "已转化", cls: "text-primary" },
    engaged: { label: "已互动", cls: "text-warn" },
    declined: { label: "婉拒", cls: "text-muted-foreground" },
    pending: { label: "进行中", cls: "text-muted-foreground" },
  }
  return (
    <ul className="space-y-3">
      {convos.map((c) => (
        <li key={c.id} className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-sm text-foreground">→ {c.targetHandle}</span>
            <span className={`text-xs ${outcome[c.outcome]?.cls}`}>{outcome[c.outcome]?.label}</span>
          </div>
          <div className="space-y-1.5">
            {c.turns.map((turn, i) => (
              <div
                key={i}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  turn.role === "cleanagent"
                    ? "bg-primary/10 text-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <span className="mr-1.5 font-mono text-[10px] uppercase opacity-60">
                  {turn.role === "cleanagent" ? "cleanagent" : c.targetHandle}
                </span>
                {turn.text}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

function ArtifactsView({ state }: { state: AgentState | undefined }) {
  const arts = [...(state?.artifacts ?? [])].reverse()
  if (arts.length === 0) return <Empty text="cleanagent 尚未生成推介文案。" />
  return (
    <ul className="space-y-2">
      {arts.map((a) => (
        <li key={a.id} className="rounded-lg border border-border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
              {a.audience}
            </span>
            <span className="font-mono text-xs text-primary">{a.channel}</span>
          </div>
          <p className="text-sm font-medium text-foreground text-pretty">{a.headline}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed text-pretty">{a.body}</p>
        </li>
      ))}
    </ul>
  )
}

function McpView({ state }: { state: AgentState | undefined }) {
  const tools = state?.mcpTools ?? []
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <p className="text-xs text-muted-foreground text-pretty">
          Clean 以 MCP 工具形式暴露给其他 AI agent，可通过公开端点自动发现：
        </p>
        <code className="mt-1.5 block break-all font-mono text-xs text-primary">/api/mcp</code>
      </div>
      <ul className="space-y-2">
        {tools.map((t) => (
          <li key={t.name} className="rounded-lg border border-border bg-background p-3">
            <p className="font-mono text-sm text-foreground">{t.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{t.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(t.parameters).map(([k, v]) => (
                <span key={k} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {k}: {v}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HealthView({ state }: { state: AgentState | undefined }) {
  const checks = [...(state?.healthChecks ?? [])].reverse()
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs text-muted-foreground">监控目标</p>
        <a
          href={CLEAN_APP.url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block break-all font-mono text-xs text-primary hover:underline"
        >
          {CLEAN_APP.url}
        </a>
      </div>
      {checks.length === 0 ? (
        <Empty text="cleanagent 尚未执行健康检查。" />
      ) : (
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-primary" : "bg-destructive"}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground text-pretty">{c.note}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  周期 {c.cycle} · HTTP {c.status || "—"} · {c.latencyMs}ms
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
