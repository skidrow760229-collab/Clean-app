import "server-only"

import { createHash } from "node:crypto"
import { desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { promotionRun } from "@/lib/db/schema"
import { canonicalBaseUrl } from "@/lib/site"

/**
 * IndexNow key — a stable, non-secret identifier derived from the app secret so
 * it stays constant across deploys without introducing a new env var. It is
 * published in plain text at /<key>.txt and echoed to search engines; deriving
 * it from a hash (never the raw secret) keeps the secret itself private.
 */
export function indexNowKey(): string {
  const seed = process.env.BETTER_AUTH_SECRET ?? "clean-indexnow"
  return createHash("sha256").update(`indexnow:${seed}`).digest("hex").slice(0, 32)
}

/** Absolute URL of the hosted IndexNow key file. */
export function indexNowKeyLocation(): string {
  return `${canonicalBaseUrl()}/${indexNowKey()}.txt`
}

/**
 * Public, crawlable URLs we ask search engines to (re)index, plus the
 * agent-facing discovery documents. These are the surfaces that make Clean
 * findable by both human search and autonomous agents.
 */
export function promotionUrls(): string[] {
  const base = canonicalBaseUrl()
  return [
    `${base}/`,
    `${base}/agents`,
    `${base}/opportunities`,
    `${base}/docs`,
    `${base}/llms.txt`,
    `${base}/.well-known/ai-plugin.json`,
    `${base}/sitemap.xml`,
  ]
}

/** Discovery endpoints probed each run to confirm they stay publicly live. */
function discoveryEndpoints(): string[] {
  const base = canonicalBaseUrl()
  return [
    `${base}/llms.txt`,
    `${base}/.well-known/ai-plugin.json`,
    `${base}/robots.txt`,
    `${base}/sitemap.xml`,
  ]
}

type EndpointResult = { url: string; status: number; ok: boolean }

async function probe(url: string): Promise<EndpointResult> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "CleanPromotionBot/1.0" },
      signal: AbortSignal.timeout(8000),
    })
    return { url, status: res.status, ok: res.status >= 200 && res.status < 300 }
  } catch {
    return { url, status: 0, ok: false }
  }
}

/**
 * Submit the public URL list to IndexNow. This is a real, zero-credential
 * protocol honored by Bing, Yandex, Seznam and Naver: hosting the key file and
 * POSTing the URLs is all that is required for those engines to crawl them.
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

export type PromotionResult = {
  ok: boolean
  endpointsOk: number
  endpointsTotal: number
  endpoints: EndpointResult[]
  indexnowStatus: number
  indexnowError?: string
  submittedCount: number
  createdAt: number
}

/**
 * Run one real promotion cycle: probe the discovery endpoints, submit the
 * public URLs to IndexNow, and persist the outcome. Everything here performs
 * genuine network work — nothing is simulated.
 */
export async function runPromotion(
  trigger: "cron" | "manual" = "cron",
): Promise<PromotionResult> {
  const endpoints = await Promise.all(discoveryEndpoints().map(probe))
  const endpointsOk = endpoints.filter((e) => e.ok).length
  const endpointsTotal = endpoints.length

  const urls = promotionUrls()
  const indexnow = await submitToIndexNow(urls)

  // IndexNow returns 200 (accepted) or 202 (accepted, pending). Anything in the
  // 2xx range counts as a successful submission.
  const indexnowOk = indexnow.status >= 200 && indexnow.status < 300
  const ok = endpointsOk === endpointsTotal && indexnowOk

  const detail = JSON.stringify({
    endpoints,
    indexnow: { status: indexnow.status, error: indexnow.error, keyLocation: indexNowKeyLocation() },
    urls,
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
    .returning({ id: promotionRun.id, createdAt: promotionRun.createdAt })

  return {
    ok,
    endpointsOk,
    endpointsTotal,
    endpoints,
    indexnowStatus: indexnow.status,
    indexnowError: indexnow.error,
    submittedCount: urls.length,
    createdAt: row?.createdAt.getTime() ?? Date.now(),
  }
}

export type PromotionRunRow = {
  id: number
  trigger: string
  ok: boolean
  endpointsOk: number
  endpointsTotal: number
  indexnowStatus: number
  submittedCount: number
  createdAt: number
}

/** Recent promotion runs for the admin console, newest first. */
export async function recentPromotionRuns(limit = 20): Promise<PromotionRunRow[]> {
  const rows = await db
    .select()
    .from(promotionRun)
    .orderBy(desc(promotionRun.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    ok: r.ok,
    endpointsOk: r.endpointsOk,
    endpointsTotal: r.endpointsTotal,
    indexnowStatus: r.indexnowStatus,
    submittedCount: r.submittedCount,
    createdAt: r.createdAt.getTime(),
  }))
}
