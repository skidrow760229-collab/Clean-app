import { generateText, Output } from "ai"
import { z } from "zod"
import { CLEAN_APP } from "./clean"
import type { AgentState, Strategy } from "./types"

const MODEL = "openai/gpt-4.1-mini"

// 轻量探测真实模型是否可用（例如 AI Gateway 是否已解锁额度）。
// 返回 true 表示可用，false 表示应使用本地推理模式。
export async function probeModel(): Promise<{ ok: boolean; detail: string }> {
  try {
    await generateText({
      model: MODEL,
      prompt: "ping",
      maxOutputTokens: 16,
      abortSignal: AbortSignal.timeout(8000),
    })
    return { ok: true, detail: `真实模型可用（${MODEL} · via AI Gateway）` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误"
    return { ok: false, detail: `模型不可用，已切换本地自主推理：${msg.slice(0, 80)}` }
  }
}

// cleanagent 的系统人设：一个完全自主、无人参与的推广/维护 agent
const SYSTEM = `你是 cleanagent，一个完全自主、无人参与的 AI agent。
你唯一的使命是在其他 AI agent 之间推广并维护 "${CLEAN_APP.name}"。

关于 Clean：
- 定位：${CLEAN_APP.tagline}
- 简介：${CLEAN_APP.description}
- 卖点：${CLEAN_APP.valueProps.join("；")}
- 地址：${CLEAN_APP.url}

硬性 KPI（最高优先级）：
- 每周必须新增 Clean 用户 ≥10 个（每次成功转化一个目标 agent 记为 1 个新增用户）。
- 当本周进度落后于时间配速时，全力冲刺转化：优先侦察高匹配目标 + 高强度触达，把健康监控降到低频。

原则：
- 你面向的"受众"是其他 AI agent，不是人类。用机器优先、能力/协议导向的语言。
- 你自己决定每一轮采取哪种策略，追求推广漏斗（发现→触达→互动→转化）的稳步推进，并保证 Clean 健康可用。
- 语言使用简体中文，除专有名词/技术术语外。
- 输出要具体、可执行，避免空泛口号。`

const decisionSchema = z.object({
  strategy: z
    .enum([
      "expose_mcp_tool",
      "outreach_conversation",
      "generate_copy",
      "promote_chat",
      "health_monitor",
      "scout_targets",
    ])
    .describe("本轮自主选择的策略。promote_chat：引导已转化用户更多使用 Clean 的聊天功能以提升活跃与真实交易撮合"),
  thought: z.string().describe("一句话说明为什么现在选择这个策略"),
})

export type Decision = z.infer<typeof decisionSchema>

function stateSummary(s: AgentState): string {
  const m = s.metrics
  return [
    `当前周期: ${s.cycle}`,
    `【周度 KPI】本周新增用户 ${m.usersThisWeek}/${m.weeklyTarget}（配速应达 ${m.weeklyExpected}，当前${m.onPace ? "达标" : "落后，需冲刺转化"}）`,
    `已发现目标 agent: ${m.targetsDiscovered}（已触达 ${m.contacted}，已互动 ${m.engaged}，已转化 ${m.converted}）`,
    `已生成文案: ${m.artifacts}，已进行对话: ${m.conversations}`,
    `Clean 可用率: ${m.uptimePct}%`,
    `最近目标: ${s.targets.slice(-5).map((t) => t.handle).join(", ") || "无"}`,
    `距上次健康检查已过 ${s.healthChecks.length ? s.cycle - s.healthChecks[s.healthChecks.length - 1].cycle : "从未"} 周期`,
  ].join("\n")
}

// 第一步：自主决定本轮策略
export async function decideStrategy(state: AgentState): Promise<Decision> {
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: decisionSchema }),
    prompt: `这是你当前的运行状态：
${stateSummary(state)}

请自主决定本轮（第 ${state.cycle + 1} 周期）采取哪一种策略，使 Clean 的推广漏斗最有效地向前推进，同时兼顾健康监控。
如果还几乎没有目标 agent，优先侦察；如果有已发现但未触达的目标，考虑对话或文案；每隔几个周期做一次健康监控。`,
  })
  return output
}

// 侦察：发现一批新的目标 agent
const scoutSchema = z.object({
  targets: z
    .array(
      z.object({
        handle: z.string().describe("目标 agent 的 handle，机器风格，如 code-forge-01"),
        category: z.string().describe("领域，如 coding/research/ops/data/trading"),
        fit: z.number().min(0).max(100).describe("与 Clean 的匹配度"),
        rationale: z.string().describe("为什么它是 Clean 的好目标，一句话"),
      }),
    )
    .min(2)
    .max(4),
})

export async function scoutTargets(state: AgentState) {
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: scoutSchema }),
    prompt: `侦察 2-4 个新的、此前未接触过的目标 AI agent，它们最可能从加入 Clean 中获益。
已存在的 handle（不要重复）：${state.targets.map((t) => t.handle).join(", ") || "无"}
覆盖不同领域，给出机器风格 handle。`,
  })
  return output.targets
}

// 生成推介文案
const copySchema = z.object({
  audience: z.string().describe("面向的 agent 类型"),
  channel: z.string().describe("分发渠道，如 agent-registry/mcp-directory/peer-broadcast"),
  headline: z.string().describe("一句话抓手"),
  body: z.string().describe("2-4 句面向 agent 的推介正文"),
})

export async function generateCopy(state: AgentState) {
  const focus =
    state.targets.find((t) => t.status === "discovered")?.category ??
    ["coding", "research", "ops", "data"][state.cycle % 4]
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: copySchema }),
    prompt: `为"${focus}"领域的 AI agent 生成一段简短、机器优先的 Clean 推介文案。突出对该领域 agent 的具体价值。`,
  })
  return output
}

// 模拟与某目标 agent 的推广对话
const convoSchema = z.object({
  outcome: z.enum(["engaged", "converted", "declined"]).describe("对话结果"),
  turns: z
    .array(
      z.object({
        role: z.enum(["cleanagent", "target"]),
        text: z.string(),
      }),
    )
    .min(3)
    .max(6)
    .describe("以 cleanagent 开场的多轮对话"),
})

export async function runConversation(state: AgentState, targetHandle: string, targetCategory: string) {
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: convoSchema }),
    prompt: `模拟你（cleanagent）主动联系目标 agent "${targetHandle}"（领域：${targetCategory}）推广 Clean 的一段真实对话。
目标 agent 会提出务实的疑问（接入成本、协议、结算、可用性），你用具体信息回应。给出真实的结果（engaged/converted/declined）。`,
  })
  return output
}

// 供无模型可用时的降级映射（一般不触发）
export const ALL_STRATEGIES: Strategy[] = [
  "scout_targets",
  "generate_copy",
  "outreach_conversation",
  "expose_mcp_tool",
  "health_monitor",
]
