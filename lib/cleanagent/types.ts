// cleanagent 的核心类型定义
// cleanagent 是一个自主运行、无人参与的推广/维护 agent，
// 由它自己决定如何在其他 AI agent 之间推广 Clean。

export type Strategy =
  | "expose_mcp_tool" // 把 Clean 暴露为可被其他 agent 发现和调用的 MCP/工具
  | "outreach_conversation" // 主动与目标 agent 对话推广
  | "generate_copy" // 生成定制化推介文案
  | "promote_chat" // 引导已转化用户更多使用 Clean 的聊天功能
  | "health_monitor" // 维护：健康监控 Clean 可用性
  | "scout_targets" // 侦察/发现新的目标 agent

export const STRATEGY_LABELS: Record<Strategy, string> = {
  expose_mcp_tool: "暴露 MCP 工具",
  outreach_conversation: "Agent 间对话推广",
  generate_copy: "生成推介文案",
  promote_chat: "引导使用聊天",
  health_monitor: "健康监控",
  scout_targets: "侦察目标 Agent",
}

export type LogLevel = "decision" | "action" | "result" | "warn"

export interface LogEntry {
  id: string
  cycle: number
  at: number
  level: LogLevel
  strategy: Strategy | "meta"
  message: string
}

// cleanagent 侦察到的目标 agent
export interface TargetAgent {
  id: string
  handle: string
  category: string // 目标 agent 的领域，如 "coding"、"research"、"ops"
  rationale: string // cleanagent 为什么认为它是好目标
  status: "discovered" | "contacted" | "engaged" | "converted"
  fit: number // 0-100 匹配度
  discoveredCycle: number
  convertedAt?: number // 转化为 Clean 用户的时间戳（用于周度 KPI 统计）
}

// 针对某类 agent 生成的推介文案
export interface PromotionArtifact {
  id: string
  cycle: number
  audience: string // 面向的 agent 类型
  channel: string // 分发渠道
  headline: string
  body: string
}

// cleanagent 与目标 agent 的模拟对话
export interface Conversation {
  id: string
  cycle: number
  targetHandle: string
  outcome: "engaged" | "converted" | "declined" | "pending"
  turns: { role: "cleanagent" | "target"; text: string }[]
}

// Clean 健康检查记录
export interface HealthCheck {
  id: string
  cycle: number
  at: number
  ok: boolean
  status: number
  latencyMs: number
  note: string
}

// MCP / 工具清单（供其他 agent 发现 Clean）
export interface McpTool {
  name: string
  description: string
  parameters: Record<string, string>
}

export interface AgentMetrics {
  cycles: number
  targetsDiscovered: number
  contacted: number
  engaged: number
  converted: number
  artifacts: number
  conversations: number
  uptimePct: number
  chatNudges: number // 已发出的"引导使用聊天功能"次数
  // 周度 KPI
  weeklyTarget: number // 每周新增真实用户目标（硬性要求 ≥40）
  usersThisWeek: number // 本周期窗口内已转化的新用户数
  weeklyExpected: number // 按时间进度应达成的数量（配速线）
  onPace: boolean // 是否达到当前配速
}

// Clean app 的真实成效数据（来自共享数据库，非模拟）
export interface RealStats {
  realUsersTotal: number
  realUsersThisWeek: number
  realTransactionsTotal: number
  realTransactionsToday: number
  realVolumeUsd: number
  weekStartedAt: number
}

// 周度 KPI 状态（跨重启持久化）
export interface KpiState {
  weeklyTarget: number // 每周新增用户目标
  weekStartedAt: number // 当前周窗口的起点时间戳
}

export type AgentStatus = "idle" | "running" | "paused"

// 推理引擎运行模式：
// - "model"：使用真实大模型（Vercel AI Gateway）
// - "local"：无模型额度时的本地自主推理，保证 cleanagent 照常运行
// - "unknown"：尚未探测
export type EngineMode = "model" | "local" | "unknown"

export interface EngineInfo {
  mode: EngineMode
  lastProbedCycle: number
  detail: string
}

export interface AgentState {
  status: AgentStatus
  cycle: number
  startedAt: number | null
  lastTickAt: number | null
  engine: EngineInfo
  currentThought: string
  logs: LogEntry[]
  targets: TargetAgent[]
  artifacts: PromotionArtifact[]
  conversations: Conversation[]
  healthChecks: HealthCheck[]
  mcpTools: McpTool[]
  metrics: AgentMetrics
  kpi: KpiState
}
