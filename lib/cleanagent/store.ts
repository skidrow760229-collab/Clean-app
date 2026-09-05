import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentState } from "@/lib/db/schema"
import type { AgentState } from "./types"
import { CLEAN_MCP_TOOLS } from "./clean"

// cleanagent 的自主运行状态持久化在 Neon（单行 JSONB 文档）。
// 重启、多实例、Cron 与浏览器都读写同一份进度，永不丢失。
const STATE_ID = "singleton"

function createInitialState(): AgentState {
  return {
    status: "idle",
    cycle: 0,
    startedAt: null,
    lastTickAt: null,
    engine: {
      mode: "unknown",
      lastProbedCycle: -1,
      detail: "尚未探测推理引擎。",
    },
    currentThought: "等待启动。启动后 cleanagent 将自主决定推广 Clean 的策略。",
    logs: [],
    targets: [],
    artifacts: [],
    conversations: [],
    healthChecks: [],
    mcpTools: CLEAN_MCP_TOOLS,
    metrics: {
      cycles: 0,
      targetsDiscovered: 0,
      contacted: 0,
      engaged: 0,
      converted: 0,
      artifacts: 0,
      conversations: 0,
      uptimePct: 100,
      chatNudges: 0,
      weeklyTarget: 40,
      usersThisWeek: 0,
      weeklyExpected: 0,
      onPace: true,
    },
    kpi: {
      weeklyTarget: 40,
      weekStartedAt: Date.now(),
    },
  }
}

// 读取当前状态；不存在则初始化并落库。
export async function loadState(): Promise<AgentState> {
  const rows = await db.select().from(agentState).where(eq(agentState.id, STATE_ID)).limit(1)
  if (rows.length > 0) {
    // 合并默认值，兼容后续字段/工具清单变更（metrics 深合并以补齐新增字段）
    const base = createInitialState()
    const saved = rows[0].state
    return {
      ...base,
      ...saved,
      mcpTools: CLEAN_MCP_TOOLS,
      metrics: { ...base.metrics, ...saved.metrics },
      kpi: { ...base.kpi, ...saved.kpi },
    }
  }
  const initial = createInitialState()
  await db.insert(agentState).values({ id: STATE_ID, state: initial })
  return initial
}

// 持久化状态（upsert）。
export async function saveState(next: AgentState): Promise<void> {
  await db
    .insert(agentState)
    .values({ id: STATE_ID, state: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: agentState.id,
      set: { state: next, updatedAt: new Date() },
    })
}

// 重置到初始状态并落库。
export async function resetState(): Promise<AgentState> {
  const initial = createInitialState()
  await saveState(initial)
  return initial
}

// 保持数组长度受控，避免文档无限增长
export function trimState(state: AgentState) {
  const cap = <T>(arr: T[], n: number) => (arr.length > n ? arr.slice(arr.length - n) : arr)
  state.logs = cap(state.logs, 120)
  state.artifacts = cap(state.artifacts, 24)
  state.conversations = cap(state.conversations, 24)
  state.healthChecks = cap(state.healthChecks, 40)
  state.targets = cap(state.targets, 40)
}
