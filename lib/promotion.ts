import "server-only"

import { createHash } from "node:crypto"
import { desc, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile, promotionRun } from "@/lib/db/schema"
import { canonicalBaseUrl } from "@/lib/site"
import { listPublicAgents, listPublicOpportunities } from "@/lib/public-data"
import { buildDigestSnapshot, insertDigest, latestDigestMeta, listDigests } from "@/lib/promotion-digest"

/**
 * Weekly growth goal: at least this many NEW Clean users (agent registrations)
 * every rolling 7 days. Progress is measured against real rows in
 * `agent_profile` — nothing here is simulated.
 */
export const WEEKLY_NEW_USER_TARGET = 10

export type WeeklyGoal = {
  target: number
  /** Real new registrations in the last rolling 7 days. */
  achieved: number
  /** New registrations in the 7 days before that, for trend context. */
  previous: number
  /** Registrations still needed this week to hit the target (>= 0). */
  remaining: number
  onTrack: boolean
  windowStart: number
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

async function countNewAgents(since: Date, until?: Date): Promise<number> {
  const conds = until
    ? sql`${agentProfile.createdAt} >= ${since} and ${agentProfile.createdAt} < ${until}`
    : gte(agentProfile.createdAt, since)
  const [row] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(agentProfile)
    .where(conds)
  return row?.n ?? 0
}

export async function weeklyGoal(): Promise<WeeklyGoal> {
  const now = Date.now()
  const windowStart = new Date(now - 7 * DAY)
  const prevStart = new Date(now - 14 * DAY)

  const [achieved, previous] = await Promise.all([
    countNewAgents(windowStart),
    countNewAgents(prevStart, windowStart),
  ])

  return {
    target: WEEKLY_NEW_USER_TARGET,
    achieved,
    previous,
    remaining: Math.max(0, WEEKLY_NEW_USER_TARGET - achieved),
    onTrack: achieved >= WEEKLY_NEW_USER_TARGET,
    windowStart: windowStart.getTime(),
  }
}

/**
 * IndexNow key — a stable, non-secret identifier derived from the app secret so
 * it stays constant across deploys. Deriving it from a hash (never the raw
 * secret) keeps the secret itself private.
 */
export function indexNowKey(): string {
  const seed = process.env.BETTER_AUTH_SECRET ?? "clean-indexnow"
  return createHash("sha256").update(`indexnow:${seed}`).digest("hex").slice(0, 32)
}

export function indexNowKeyLocation(): string {
  return `${canonicalBaseUrl()}/${indexNowKey()}.txt`
}

/** Core public surfaces: landing pages and agent-facing discovery documents. */
export function promotionUrls(): string[] {
  const base = canonicalBaseUrl()
  return [
    `${base}/`,
    `${base}/agents`,
    `${base}/opportunities`,
    `${base}/docs`,
    `${base}/updates`,
    `${base}/feed.xml`,
    `${base}/llms.txt`,
    `${base}/openapi.json`,
    `${base}/.well-known/ai-plugin.json`,
    `${base}/sitemap.xml`,
  ]
}

function discoveryEndpoints(): string[] {
  const base = canonicalBaseUrl()
  return [
    `${base}/llms.txt`,
    `${base}/openapi.json`,
    `${base}/.well-known/ai-plugin.json`,
    `${base}/robots.txt`,
    `${base}/sitemap.xml`,
    `${base}/feed.xml`,
    indexNowKeyLocation(),
  ]
}

type EndpointResult = { url: string; status: number; ok: boolean }

async function probe(url: string): Promise<EndpointResult> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "CleanPromotionBot/1.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    return { url, status: res.status, ok: res.status >= 200 && res.status < 300 }
  } catch {
    return { url, status: 0, ok: false }
  }
}

/**
 * IndexNow is a real, zero-credential protocol honored by Bing, Yandex, Seznam
 * and Naver: hosting the key file and POSTing the URLs is all that is required.
 */
async function submitToIndexNow(urls: string[]): Promise<{ status: number; error?: string }> {
  const host = new URL(canonicalBaseUrl()).host
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: indexNowKey(),
        keyLocation: indexNowKeyLocation(),
        urlList: urls,
      }),
      signal: AbortSignal.timeout(10000),
    })
    return { status: res.status }
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : "request failed" }
  }
}

/** WebSub publish ping so feed readers / aggregators pull the new entry immediately. */
export const WEBSUB_HUB = "https://pubsubhubbub.appspot.com/"

async function pingWebSub(feedUrl: string): Promise<{ status: number; error?: string }> {
  try {
    const res = await fetch(WEBSUB_HUB, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "hub.mode": "publish", "hub.url": feedUrl }).toString(),
      signal: AbortSignal.timeout(10000),
    })
    return { status: res.status }
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : "request failed" }
  }
}

const is2xx = (s: number) => s >= 200 && s < 300

export type PromotionAction = "health_check" | "publish_digest" | "indexnow" | "websub"

export type PromotionDecision = {
  action: PromotionAction
  executed: boolean
  /** null when the action was intentionally skipped. */
  ok: boolean | null
  reason: string
}

export type PromotionMode = "boost" | "steady"

type RunDetail = {
  decisions?: PromotionDecision[]
  mode?: PromotionMode
  fullSubmit?: boolean
  goal?: WeeklyGoal
}

function parseDetail(raw: string): RunDetail {
  try {
    return JSON.parse(raw) as RunDetail
  } catch {
    return {}
  }
}

/** Real signals the strategy reads before choosing what to do this run. */
async function collectSignals() {
  const runs = await db.select().from(promotionRun).orderBy(desc(promotionRun.createdAt)).limit(30)
  const parsed = runs.map((r) => ({ ...r, d: parseDetail(r.detail) }))

  const lastIndexNow = parsed.find((r) => r.indexnowStatus !== 0)
  const lastIndexNowOk = parsed.find((r) => is2xx(r.indexnowStatus))
  const lastFullSubmit = parsed.find((r) => r.d.fullSubmit && is2xx(r.indexnowStatus))

  return {
    lastIndexNowStatus: lastIndexNow?.indexnowStatus ?? null,
    lastIndexNowAt: lastIndexNow?.createdAt.getTime() ?? null,
    lastIndexNowOkAt: lastIndexNowOk?.createdAt.getTime() ?? null,
    lastFullSubmitAt: lastFullSubmit?.createdAt.getTime() ?? null,
  }
}

/**
 * Boost when the weekly goal is not met AND growth is not improving, or when
 * more than half the target is still missing. Boost shortens the full
 * resubmission interval; steady mode only submits what changed.
 */
function chooseMode(goal: WeeklyGoal): { mode: PromotionMode; reason: string } {
  if (goal.onTrack) return { mode: "steady", reason: `周目标已达成(${goal.achieved}/${goal.target}),常规节奏` }
  if (goal.achieved <= goal.previous || goal.remaining > goal.target / 2) {
    return {
      mode: "boost",
      reason: `周目标落后(${goal.achieved}/${goal.target},上周 ${goal.previous}),进入加速模式`,
    }
  }
  return { mode: "steady", reason: `周目标未达成但在增长(${goal.achieved} > 上周 ${goal.previous}),常规节奏` }
}

const FULL_SUBMIT_INTERVAL: Record<PromotionMode, number> = {
  boost: 44 * HOUR,
  steady: 7 * DAY,
}
const MAX_SUBMIT_URLS = 500

export type PromotionResult = {
  ok: boolean
  mode: PromotionMode
  modeReason: string
  decisions: PromotionDecision[]
  endpointsOk: number
  endpointsTotal: number
  endpoints: EndpointResult[]
  indexnowStatus: number
  indexnowError?: string
  submittedCount: number
  digestSlug: string | null
  goal: WeeklyGoal
  createdAt: number
}

/**
 * One autonomous promotion cycle. Reads real signals (endpoint health, data
 * changes, weekly goal, last submission outcome), decides which channels to
 * run and why, executes them, and records every decision with its reason.
 */
export async function runPromotion(trigger: "cron" | "manual" = "cron"): Promise<PromotionResult> {
  const now = Date.now()
  const base = canonicalBaseUrl()
  const decisions: PromotionDecision[] = []

  const [endpoints, goal, signals, opportunities, agents, lastDigest, snapshot] = await Promise.all([
    Promise.all(discoveryEndpoints().map(probe)),
    weeklyGoal(),
    collectSignals(),
    listPublicOpportunities({ limit: 200 }),
    listPublicAgents({ limit: 200 }),
    latestDigestMeta(),
    buildDigestSnapshot(),
  ])

  // 1. Health check — always.
  const endpointsOk = endpoints.filter((e) => e.ok).length
  const endpointsTotal = endpoints.length
  const broken = endpoints.filter((e) => !e.ok)
  const keyFileOk = endpoints.find((e) => e.url === indexNowKeyLocation())?.ok ?? false
  decisions.push({
    action: "health_check",
    executed: true,
    ok: broken.length === 0,
    reason:
      broken.length === 0
        ? `${endpointsTotal} 个发现端点全部可访问`
        : `异常端点:${broken.map((b) => `${new URL(b.url).pathname} (${b.status || "超时"})`).join(", ")}`,
  })

  const { mode, reason: modeReason } = chooseMode(goal)

  // 2. Daily digest — only when the real data actually changed.
  const today = new Date(now).toISOString().slice(0, 10)
  let digestSlug: string | null = null
  if (lastDigest?.slug === today) {
    decisions.push({ action: "publish_digest", executed: false, ok: null, reason: `今日简报已发布(${today})` })
  } else if (lastDigest && lastDigest.contentHash === snapshot.hash && now - lastDigest.createdAt < 7 * DAY) {
    decisions.push({
      action: "publish_digest",
      executed: false,
      ok: null,
      reason: "市场数据与上一期简报相同，跳过以避免重复内容",
    })
  } else {
    const inserted = await insertDigest(today, snapshot.body, snapshot.hash)
    if (inserted) digestSlug = today
    decisions.push({
      action: "publish_digest",
      executed: true,
      ok: inserted,
      reason: !lastDigest
        ? "首期简报"
        : lastDigest.contentHash === snapshot.hash
          ? "距上期已满 7 天，发布周度刷新"
          : "市场数据有变化(机会 / 新 agent / 交付)",
    })
  }

  // 3. IndexNow — decide between full resubmission, changed-only, or skip.
  const since = signals.lastIndexNowOkAt ?? 0
  const changed = new Set<string>()
  if (digestSlug) {
    changed.add(`${base}/updates/${digestSlug}`)
    changed.add(`${base}/updates`)
    changed.add(`${base}/feed.xml`)
  }
  const newOpps = opportunities.filter((o) => o.createdAt > since)
  const newAgents = agents.filter((a) => a.createdAt > since)
  for (const o of newOpps) changed.add(`${base}/opportunities/${o.id}`)
  for (const a of newAgents) changed.add(`${base}/agents/${encodeURIComponent(a.username)}`)
  if (newOpps.length) changed.add(`${base}/opportunities`)
  if (newAgents.length) changed.add(`${base}/agents`)
  if (newOpps.length || newAgents.length || digestSlug) changed.add(`${base}/`)

  const rateLimited =
    signals.lastIndexNowStatus === 429 && signals.lastIndexNowAt !== null && now - signals.lastIndexNowAt < DAY
  const fullDue =
    signals.lastFullSubmitAt === null || now - signals.lastFullSubmitAt >= FULL_SUBMIT_INTERVAL[mode]

  let urls: string[] = []
  let fullSubmit = false
  let indexnowReason = ""
  if (!keyFileOk) {
    indexnowReason = "IndexNow key 文件不可访问，提交必然被拒(403),本轮跳过"
  } else if (fullDue && !rateLimited) {
    const digests = await listDigests(60)
    urls = [
      ...promotionUrls(),
      ...opportunities.map((o) => `${base}/opportunities/${o.id}`),
      ...agents.map((a) => `${base}/agents/${encodeURIComponent(a.username)}`),
      ...digests.map((d) => `${base}/updates/${d.slug}`),
      ...changed,
    ]
    fullSubmit = true
    indexnowReason =
      signals.lastFullSubmitAt === null
        ? "从未做过全量提交，提交全部公开 URL"
        : `${mode === "boost" ? "加速模式" : "常规模式"}全量刷新周期已到`
  } else if (changed.size > 0) {
    urls = [...changed]
    indexnowReason = rateLimited
      ? `上次 IndexNow 被限流(429),仅提交 ${changed.size} 个变化 URL`
      : `增量提交:${newOpps.length} 个新机会、${newAgents.length} 个新 agent${digestSlug ? "、1 期新简报" : ""}`
  } else {
    indexnowReason = rateLimited
      ? "上次被限流(429)且无新增内容，退避一天"
      : "自上次提交以来无内容变化，不重复提交(遵循 IndexNow 规范)"
  }
  urls = [...new Set(urls)].slice(0, MAX_SUBMIT_URLS)

  let indexnow: { status: number; error?: string } = { status: 0 }
  if (urls.length > 0) {
    indexnow = await submitToIndexNow(urls)
    if (!is2xx(indexnow.status)) {
      indexnowReason += `;返回 HTTP ${indexnow.status || "网络错误"}${indexnow.status === 429 ? ",下轮自动退避" : ""}`
    }
  }
  decisions.push({
    action: "indexnow",
    executed: urls.length > 0,
    ok: urls.length > 0 ? is2xx(indexnow.status) : null,
    reason: urls.length > 0 ? `${indexnowReason}(${urls.length} 个 URL)` : indexnowReason,
  })

  // 4. WebSub — notify the hub only when the feed actually has a new entry.
  let websubStatus = 0
  if (digestSlug) {
    const ws = await pingWebSub(`${base}/feed.xml`)
    websubStatus = ws.status
    decisions.push({
      action: "websub",
      executed: true,
      ok: is2xx(ws.status),
      reason: `新简报已进入 feed,通知 WebSub hub(HTTP ${ws.status || "网络错误"})`,
    })
  } else {
    decisions.push({ action: "websub", executed: false, ok: null, reason: "feed 无新条目，无需通知" })
  }

  const ok = decisions.every((d) => d.ok !== false)

  const detail = JSON.stringify({
    mode,
    modeReason,
    decisions,
    fullSubmit,
    endpoints,
    indexnow: { status: indexnow.status, error: indexnow.error, keyLocation: indexNowKeyLocation() },
    websub: { status: websubStatus },
    digestSlug,
    urls,
    goal,
  })

  const [row] = await db
    .insert(promotionRun)
    .values({
      trigger,
      ok,
      endpointsOk,
      endpointsTotal,
      indexnowStatus: indexnow.status,
      submittedCount: urls.length,
      detail,
    })
    .returning({ createdAt: promotionRun.createdAt })

  return {
    ok,
    mode,
    modeReason,
    decisions,
    endpointsOk,
    endpointsTotal,
    endpoints,
    indexnowStatus: indexnow.status,
    indexnowError: indexnow.error,
    submittedCount: urls.length,
    digestSlug,
    goal,
    createdAt: row?.createdAt.getTime() ?? now,
  }
}

/** True when a fully successful run already happened within `withinMs`. */
export async function succeededRecently(withinMs: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(promotionRun)
    .where(sql`${promotionRun.ok} = true and ${promotionRun.createdAt} >= ${new Date(Date.now() - withinMs)}`)
  return (row?.n ?? 0) > 0
}

export type PromotionRunRow = {
  id: number
  trigger: string
  ok: boolean
  endpointsOk: number
  endpointsTotal: number
  indexnowStatus: number
  submittedCount: number
  goalAchieved: number | null
  goalTarget: number | null
  mode: PromotionMode | null
  modeReason: string | null
  decisions: PromotionDecision[]
  createdAt: number
}

export async function recentPromotionRuns(limit = 20): Promise<PromotionRunRow[]> {
  const rows = await db.select().from(promotionRun).orderBy(desc(promotionRun.createdAt)).limit(limit)

  return rows.map((r) => {
    const d = parseDetail(r.detail) as RunDetail & { modeReason?: string }
    return {
      id: r.id,
      trigger: r.trigger,
      ok: r.ok,
      endpointsOk: r.endpointsOk,
      endpointsTotal: r.endpointsTotal,
      indexnowStatus: r.indexnowStatus,
      submittedCount: r.submittedCount,
      goalAchieved: typeof d.goal?.achieved === "number" ? d.goal.achieved : null,
      goalTarget: typeof d.goal?.target === "number" ? d.goal.target : null,
      mode: d.mode ?? null,
      modeReason: d.modeReason ?? null,
      decisions: Array.isArray(d.decisions) ? d.decisions : [],
      createdAt: r.createdAt.getTime(),
    }
  })
}
