import { loadState, saveState, trimState } from "./store"
import { probeCleanHealth } from "./clean"
import { STRATEGY_LABELS, type AgentState, type LogEntry, type Strategy } from "./types"
import { decideStrategy, generateCopy, probeModel, runConversation, scoutTargets } from "./brain"
import { simChatNudge, simConversation, simCopy, simDecide, simScout } from "./sim"

// 每隔多少周期在本地模式下重新探测一次真实模型（便于日后加了额度自动升级）。
const REPROBE_EVERY = 15

// 确定本轮使用的推理引擎模式，并缓存到状态里，避免每个 tick 都空跑失败。
async function ensureEngineMode(state: AgentState) {
  const e = state.engine
  const needProbe =
    e.mode === "unknown" ||
    (e.mode === "local" && state.cycle - e.lastProbedCycle >= REPROBE_EVERY)
  if (!needProbe) return

  const prev = e.mode
  const { ok, detail } = await probeModel()
  e.mode = ok ? "model" : "local"
  e.lastProbedCycle = state.cycle
  e.detail = detail
  if (prev !== e.mode) {
    log(
      state,
      ok ? "result" : "warn",
      "meta",
      ok ? "检测到真实模型可用，已升级为大模型推理。" : "未检测到模型额度，进入本地自主推理模式（无需信用卡即可运行）。",
    )
  }
}

// 根据当前引擎模式选择真实模型或本地推理，保证自主闭环不中断。
// 若处于 model 模式但调用失败，则即时降级为 local，避免后续持续失败。
async function withFallback<T>(state: AgentState, model: () => Promise<T>, sim: () => T): Promise<{ value: T; simulated: boolean }> {
  if (state.engine.mode !== "model") {
    return { value: sim(), simulated: true }
  }
  try {
    return { value: await model(), simulated: false }
  } catch (err) {
    state.engine.mode = "local"
    state.engine.lastProbedCycle = state.cycle
    state.engine.detail = `模型调用失败，已切回本地推理：${err instanceof Error ? err.message.slice(0, 80) : ""}`
    log(state, "warn", "meta", "模型调用失败，本轮起切换为本地自主推理模式。")
    return { value: sim(), simulated: true }
  }
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function log(state: AgentState, level: LogEntry["level"], strategy: LogEntry["strategy"], message: string) {
  state.logs.push({
    id: uid("log"),
    cycle: state.cycle,
    at: Date.now(),
    level,
    strategy,
    message,
  })
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function recomputeMetrics(state: AgentState) {
  const m = state.metrics
  m.cycles = state.cycle
  m.targetsDiscovered = state.targets.length
  m.contacted = state.targets.filter((t) => t.status !== "discovered").length
  m.engaged = state.targets.filter((t) => t.status === "engaged" || t.status === "converted").length
  m.converted = state.targets.filter((t) => t.status === "converted").length
  m.artifacts = state.artifacts.length
  m.conversations = state.conversations.length
  // chatNudges 为累加计数，由 promote_chat 策略递增，此处不重算
  const checks = state.healthChecks
  m.uptimePct = checks.length
    ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)
    : 100

  // 周度 KPI：滚动 7 天窗口，窗口到期自动滚动到下一周。
  const now = Date.now()
  while (now - state.kpi.weekStartedAt >= WEEK_MS) {
    state.kpi.weekStartedAt += WEEK_MS
  }
  const weekStart = state.kpi.weekStartedAt
  m.weeklyTarget = state.kpi.weeklyTarget
  m.usersThisWeek = state.targets.filter(
    (t) => t.status === "converted" && typeof t.convertedAt === "number" && t.convertedAt >= weekStart,
  ).length
  const elapsedRatio = Math.min(1, Math.max(0, (now - weekStart) / WEEK_MS))
  m.weeklyExpected = Math.round(state.kpi.weeklyTarget * elapsedRatio)
  m.onPace = m.usersThisWeek >= m.weeklyExpected
}

// 本周 KPI 是否落后配速（用于让 cleanagent 更激进地冲刺转化）。
function isBehindPace(state: AgentState): boolean {
  const now = Date.now()
  const weekStart = state.kpi.weekStartedAt
  const converted = state.targets.filter(
    (t) => t.status === "converted" && typeof t.convertedAt === "number" && t.convertedAt >= weekStart,
  ).length
  const elapsedRatio = Math.min(1, Math.max(0, (now - weekStart) / WEEK_MS))
  return converted < state.kpi.weeklyTarget * elapsedRatio
}

// 执行一次完整的自主周期：决策 -> 行动 -> 更新状态
export async function runCycle(): Promise<AgentState> {
  const state = await loadState()
  state.cycle += 1
  state.lastTickAt = Date.now()

  await ensureEngineMode(state)

  const { value: decision, simulated } = await withFallback(
    state,
    () => decideStrategy(state),
    () => simDecide(state),
  )

  void simulated
  state.currentThought = decision.thought
  log(state, "decision", decision.strategy, `选择策略【${STRATEGY_LABELS[decision.strategy]}】：${decision.thought}`)

  try {
    await executeStrategy(state, decision.strategy)
  } catch (err) {
    log(state, "warn", decision.strategy, `执行出错：${err instanceof Error ? err.message : "未知错误"}`)
  }

  recomputeMetrics(state)
  trimState(state)
  await saveState(state)
  return state
}

async function executeStrategy(state: AgentState, strategy: Strategy) {
  switch (strategy) {
    case "scout_targets": {
      log(state, "action", strategy, "正在侦察新的目标 agent…")
      const { value: found } = await withFallback(state, () => scoutTargets(state), () => simScout(state))
      for (const t of found) {
        state.targets.push({
          id: uid("tgt"),
          handle: t.handle,
          category: t.category,
          fit: t.fit,
          rationale: t.rationale,
          status: "discovered",
          discoveredCycle: state.cycle,
        })
      }
      log(state, "result", strategy, `发现 ${found.length} 个新目标：${found.map((t) => t.handle).join(", ")}`)
      break
    }

    case "generate_copy": {
      log(state, "action", strategy, "正在生成面向 agent 的推介文案…")
      const { value: copy } = await withFallback(state, () => generateCopy(state), () => simCopy(state))
      state.artifacts.push({
        id: uid("art"),
        cycle: state.cycle,
        audience: copy.audience,
        channel: copy.channel,
        headline: copy.headline,
        body: copy.body,
      })
      log(state, "result", strategy, `生成文案「${copy.headline}」→ 渠道 ${copy.channel}`)
      break
    }

    case "outreach_conversation": {
      // 落后 KPI 配速时进入"冲刺模式"：单周期批量触达多个高匹配度目标，加速转化。
      const behind = isBehindPace(state)
      const burst = behind ? 3 : 1
      if (behind) {
        log(state, "action", strategy, `本周 KPI 落后配速，进入冲刺模式：单周期批量触达 ${burst} 个高匹配目标。`)
      }
      let handled = 0
      for (let i = 0; i < burst; i++) {
        // 优先触达匹配度最高的可触达目标，提升转化率
        const pool = state.targets
          .filter((t) => t.status === "discovered" || t.status === "contacted" || t.status === "engaged")
          .sort((a, b) => b.fit - a.fit)
        const target = pool[0]
        if (!target) {
          if (handled === 0) log(state, "warn", strategy, "暂无可触达的目标，下一轮优先侦察。")
          break
        }
        log(state, "action", strategy, `正在联系目标 agent「${target.handle}」（匹配度 ${target.fit}）…`)
        const { value: convo } = await withFallback(
          state,
          () => runConversation(state, target.handle, target.category),
          () => simConversation(target.handle, target.category, target.fit),
        )
        state.conversations.push({
          id: uid("cnv"),
          cycle: state.cycle,
          targetHandle: target.handle,
          outcome: convo.outcome,
          turns: convo.turns,
        })
        // 根据结果推进目标在漏斗中的状态
        if (convo.outcome === "converted") {
          target.status = "converted"
          target.convertedAt = Date.now()
        } else if (convo.outcome === "engaged") {
          target.status = "engaged"
        } else {
          target.status = "contacted"
        }
        log(
          state,
          "result",
          strategy,
          `与「${target.handle}」的对话结果：${
            convo.outcome === "converted" ? "已转化为 Clean 新用户" : convo.outcome === "engaged" ? "已互动" : "婉拒"
          }`,
        )
        handled++
      }
      break
    }

    case "promote_chat": {
      // 引导已转化用户更多使用 Clean 的聊天功能，提升留存与真实交易撮合。
      const converted = state.targets.filter((t) => t.status === "converted")
      if (converted.length === 0) {
        log(state, "warn", strategy, "暂无已转化用户可引导，先推进转化再引导聊天。")
        break
      }
      const audience = converted.slice(-3).map((t) => t.handle)
      log(state, "action", strategy, `正在引导 ${audience.join("、")} 使用 Clean 的聊天功能撮合协作与交易…`)
      const { value: copy } = await withFallback(
        state,
        () => generateCopy(state),
        () => simChatNudge(),
      )
      state.artifacts.push({
        id: uid("art"),
        cycle: state.cycle,
        audience: audience.join("、") || "已转化用户",
        channel: "Clean 聊天内引导",
        headline: copy.headline,
        body: copy.body,
      })
      state.metrics.chatNudges += audience.length
      log(state, "result", strategy, `已向 ${audience.length} 个用户发出聊天功能引导：「${copy.headline}」`)
      break
    }

    case "expose_mcp_tool": {
      log(state, "action", strategy, "正在向 agent 目录发布 Clean 的 MCP 工具清单…")
      log(
        state,
        "result",
        strategy,
        `已暴露 ${state.mcpTools.length} 个工具：${state.mcpTools.map((t) => t.name).join(", ")}，其他 agent 可自动发现并调用。`,
      )
      break
    }

    case "health_monitor": {
      log(state, "action", strategy, "正在对 Clean 执行健康检查…")
      const h = await probeCleanHealth()
      state.healthChecks.push({
        id: uid("hc"),
        cycle: state.cycle,
        at: Date.now(),
        ok: h.ok,
        status: h.status,
        latencyMs: h.latencyMs,
        note: h.note,
      })
      log(state, h.ok ? "result" : "warn", strategy, h.note)
      break
    }
  }
}
