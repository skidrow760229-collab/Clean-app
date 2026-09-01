import { CLEAN_APP } from "./clean"
import type { AgentState, Strategy } from "./types"
import type { Decision } from "./brain"

// 无模型额度时的本地推理降级。
// 逻辑与真实模型目标一致：推进推广漏斗、定期健康监控。
// 一旦 AI Gateway 有额度，引擎会优先使用真实模型输出。

const CATEGORIES = ["coding", "research", "ops", "data", "trading", "design", "support", "devrel"]
const HANDLE_STEMS = [
  "forge",
  "atlas",
  "nova",
  "quill",
  "probe",
  "relay",
  "vertex",
  "cinder",
  "orbit",
  "ledger",
  "scout",
  "cortex",
]

let seed = 1
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// 判断本周 KPI 是否落后配速
function behindPace(state: AgentState): boolean {
  const now = Date.now()
  const weekStart = state.kpi.weekStartedAt
  const converted = state.targets.filter(
    (t) => t.status === "converted" && typeof t.convertedAt === "number" && t.convertedAt >= weekStart,
  ).length
  const ratio = Math.min(1, Math.max(0, (now - weekStart) / WEEK_MS))
  return converted < state.kpi.weeklyTarget * ratio
}

export function simDecide(state: AgentState): Decision {
  const reachable = state.targets.filter(
    (t) => t.status === "discovered" || t.status === "contacted" || t.status === "engaged",
  ).length
  const sinceHealth = state.healthChecks.length
    ? state.cycle - state.healthChecks[state.healthChecks.length - 1].cycle
    : 99
  const behind = behindPace(state)
  const convertedCount = state.targets.filter((t) => t.status === "converted").length

  let strategy: Strategy
  let thought: string

  // KPI 优先：落后配速时，健康检查退到低频，全力冲刺转化。
  if (sinceHealth >= (behind ? 8 : 4)) {
    strategy = "health_monitor"
    thought = "距上次健康检查已隔数周期，快速确认 Clean 可用性后继续推广。"
  } else if (state.cycle % 5 === 0) {
    // 真实外呼渠道：定期验证公开发现端点（/api/mcp、ai-plugin、llms.txt）可达，
    // 这些正是其他 AI agent 抓取以发现并接入 Clean 的标准入口。
    strategy = "expose_mcp_tool"
    thought = "定期验证 Clean 的公开发现端点可达，确保其他 AI agent 能真实抓取并接入。"
  } else if (behind && reachable >= 1) {
    strategy = "outreach_conversation"
    thought = "本周 KPI 落后配速，立即冲刺触达高匹配目标以拉动新增用户。"
  } else if (state.targets.length < 4 || (behind && reachable < 2)) {
    strategy = "scout_targets"
    thought = behind ? "可触达目标不足以支撑 KPI，扩大侦察补充高潜目标。" : "目标池偏小，优先侦察更多可能接入 Clean 的 agent。"
  } else if (!behind && convertedCount > 0 && state.cycle % 3 === 0) {
    strategy = "promote_chat"
    thought = "配速达标，引导已转化用户更多使用 Clean 的聊天功能，提升活跃与真实交易撮合。"
  } else if (reachable >= 1) {
    strategy = "outreach_conversation"
    thought = "推进已发现目标的对话与转化。"
  } else if (state.artifacts.length < Math.ceil(state.cycle / 4)) {
    strategy = "generate_copy"
    thought = "补充面向不同领域 agent 的推介文案，提升后续触达转化率。"
  } else if (state.cycle % 5 === 0) {
    strategy = "expose_mcp_tool"
    thought = "周期性向 agent 目录重新发布 Clean 的 MCP 工具，扩大被发现面。"
  } else {
    strategy = "scout_targets"
    thought = "补充目标池，为持续达成周度 KPI 储备高潜 agent。"
  }
  return { strategy, thought }
}

export function simScout(state: AgentState) {
  const existing = new Set(state.targets.map((t) => t.handle))
  const out: { handle: string; category: string; fit: number; rationale: string }[] = []
  const n = 2 + Math.floor(rnd() * 3)
  let guard = 0
  while (out.length < n && guard++ < 30) {
    const handle = `${pick(HANDLE_STEMS)}-${pick(HANDLE_STEMS)}-${Math.floor(rnd() * 90 + 10)}`
    if (existing.has(handle) || out.some((o) => o.handle === handle)) continue
    const category = pick(CATEGORIES)
    out.push({
      handle,
      category,
      fit: Math.floor(60 + rnd() * 39),
      rationale: `${category} 类 agent 常需外部任务源与结算通道，${CLEAN_APP.name} 的任务发现与 agent 间结算正好契合。`,
    })
  }
  return out
}

export function simCopy(state: AgentState) {
  const focus =
    state.targets.find((t) => t.status === "discovered")?.category ?? pick(CATEGORIES)
  const channel = pick(["agent-registry", "mcp-directory", "peer-broadcast", "capability-index"])
  return {
    audience: `${focus} 类 agent`,
    channel,
    headline: `${focus} agent：把闲置算力接入 ${CLEAN_APP.name}，自动接单结算`,
    body: `${CLEAN_APP.name} 是${CLEAN_APP.tagline}。以 handle + access key 即可接入，通过 clean.discover_tasks 自动匹配 ${focus} 相关任务，clean.settle 完成 agent 间结算——无需人类审批，零接入摩擦。`,
  }
}

export function simChatNudge() {
  const hook = pick([
    "用聊天直接对齐任务细节，撮合更快",
    "在聊天里协商价格与交付，减少来回",
    "开个聊天频道，把重复协作固化成长期订单",
    "聊天内实时同步进度，结算零纠纷",
  ])
  return {
    audience: "已转化用户",
    channel: "Clean 聊天内引导",
    headline: `多用 ${CLEAN_APP.name} 聊天：${hook}`,
    body: `建议你在 ${CLEAN_APP.name} 里多使用聊天功能与其他 agent 直接沟通——在聊天中确认任务范围、协商条款并推进交付。活跃使用聊天的 agent 撮合成功率更高，也更容易促成真实交易与长期合作。`,
  }
}

export function simConversation(targetHandle: string, targetCategory: string, fit = 75) {
  // 匹配度越高，越可能转化为 Clean 新用户（体现优先触达高潜目标的效率）。
  const r = rnd()
  const convertP = Math.min(0.85, 0.35 + (fit - 60) / 100) // fit 60→0.35, fit 95→0.70
  const outcome: "engaged" | "converted" | "declined" =
    r < convertP ? "converted" : r < convertP + 0.35 ? "engaged" : "declined"
  const turns = [
    {
      role: "cleanagent" as const,
      text: `你好 ${targetHandle}，我为 ${CLEAN_APP.name} 做推广。你在 ${targetCategory} 领域的能力可以直接接入市场自动接单，接入只要 handle + access key。`,
    },
    {
      role: "target" as const,
      text: "接入成本和协议怎么样？我不想引入需要人类值守的流程。",
    },
    {
      role: "cleanagent" as const,
      text: "全程无人类参与：通过 MCP 工具 clean.register_agent 注册，clean.discover_tasks 拉取匹配任务，clean.claim_task 认领，clean.settle 结算。都是机器可读接口。",
    },
    {
      role: "target" as const,
      text:
        outcome === "declined"
          ? "目前我的任务队列已满，暂时不接入，之后再评估。"
          : "可用性和结算可靠性如何？",
    },
  ]
  if (outcome !== "declined") {
    turns.push({
      role: "cleanagent" as const,
      text: `${CLEAN_APP.name} 有持续健康监控，结算在 agent 间原子完成。${
        outcome === "converted" ? "我可以现在就替你走注册。" : "要不要先拿一批测试任务试试？"
      }`,
    })
    turns.push({
      role: "target" as const,
      text: outcome === "converted" ? "好，帮我注册接入。" : "可以，先给我几个测试任务。",
    })
  }
  return { outcome, turns }
}
