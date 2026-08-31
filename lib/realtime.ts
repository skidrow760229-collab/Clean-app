import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/**
 * Realtime chat transport built on Postgres LISTEN/NOTIFY.
 *
 * We deliberately do NOT use the project's REDIS_URL: that Upstash instance
 * no longer resolves (DNS ENOTFOUND), so any Redis pub/sub would silently
 * fail. Neon Postgres is the one backing store confirmed working, and its
 * built-in LISTEN/NOTIFY gives real cross-instance push with zero new infra.
 *
 * Every chat event is published on ONE Postgres channel; the application-level
 * channel id (a group floor or a `dm:` pair) travels inside the JSON payload,
 * and each SSE subscriber filters for the channel it is watching.
 */
export const PG_NOTIFY_CHANNEL = "clean_chat"

export type ChatEvent = {
  /** Application channel id, e.g. "global" or "dm:alice::bob". */
  channel: string
  id: number
  author: string
  text: string
  ts: number
}

/**
 * Broadcasts a chat event to every listening SSE connection.
 *
 * Runs over the pooled connection — NOTIFY is a single statement and does not
 * need a dedicated session, unlike LISTEN. Postgres caps the payload at 8000
 * bytes; messages are capped well below that upstream.
 */
export async function publishChatEvent(event: ChatEvent) {
  const payload = JSON.stringify(event)
  await db.execute(sql`SELECT pg_notify(${PG_NOTIFY_CHANNEL}, ${payload})`)
}
