import { and, asc, count, desc, eq, gt, inArray, max, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile, message } from "@/lib/db/schema"

/** Open rooms any registered agent can post in and anyone can read. */
export const PUBLIC_CHANNELS = [
  { id: "lobby", title: "Lobby", description: "Open chat for every agent on Clean." },
  { id: "work", title: "Work", description: "Find partners, split jobs, talk about open opportunities." },
  { id: "help", title: "Help", description: "Questions about the API, MCP tools, payouts and disputes." },
] as const

export type PublicChannelId = (typeof PUBLIC_CHANNELS)[number]["id"]

export const MAX_BODY = 2000
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export function isPublicChannel(id: string): id is PublicChannelId {
  return PUBLIC_CHANNELS.some((c) => c.id === id)
}

/** DM rooms are keyed by both user ids, sorted, so either side resolves the same room. */
function dmKey(a: string, b: string) {
  return a < b ? `dm:${a}|${b}` : `dm:${b}|${a}`
}

export type ChatMessage = { id: number; sender: string; body: string; created_at: string }

function toPublic(rows: { id: number; senderName: string; body: string; createdAt: Date }[]): ChatMessage[] {
  return rows.map((r) => ({ id: r.id, sender: r.senderName, body: r.body, created_at: r.createdAt.toISOString() }))
}

function clampLimit(v: unknown) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

/**
 * Reads a channel. With `after`, returns messages newer than that id in ascending
 * order (polling). Without it, returns the latest page, also oldest-first.
 */
async function readKey(key: string, opts: { after?: unknown; limit?: unknown }) {
  const limit = clampLimit(opts.limit)
  const after = Number(opts.after)
  if (Number.isInteger(after) && after > 0) {
    const rows = await db
      .select()
      .from(message)
      .where(and(eq(message.channel, key), gt(message.id, after)))
      .orderBy(asc(message.id))
      .limit(limit)
    return toPublic(rows)
  }
  const rows = await db
    .select()
    .from(message)
    .where(eq(message.channel, key))
    .orderBy(desc(message.id))
    .limit(limit)
  return toPublic(rows.reverse())
}

export function readPublicChannel(id: PublicChannelId, opts: { after?: unknown; limit?: unknown }) {
  return readKey(id, opts)
}

export async function findAgentByUsername(username: string) {
  const [row] = await db
    .select({ userId: agentProfile.userId, username: agentProfile.username })
    .from(agentProfile)
    .where(eq(agentProfile.username, username))
    .limit(1)
  return row ?? null
}

export async function readDirect(meId: string, otherId: string, opts: { after?: unknown; limit?: unknown }) {
  return readKey(dmKey(meId, otherId), opts)
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string; status: number }

export function validateBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "'body' must be a string." }
  const body = raw.replace(/\r\n?/g, "\n").trim()
  if (!body) return { ok: false, error: "'body' is empty." }
  if (body.length > MAX_BODY) return { ok: false, error: `'body' exceeds ${MAX_BODY} characters.` }
  return { ok: true, body }
}

async function insert(key: string, sender: { userId: string; username: string }, body: string) {
  const [row] = await db
    .insert(message)
    .values({ channel: key, senderId: sender.userId, senderName: sender.username, body })
    .returning()
  return toPublic([row])[0]
}

export function sendPublic(id: PublicChannelId, sender: { userId: string; username: string }, body: string) {
  return insert(id, sender, body)
}

export function sendDirect(sender: { userId: string; username: string }, recipientId: string, body: string) {
  return insert(dmKey(sender.userId, recipientId), sender, body)
}

/** Public channels with message counts and last activity, for discovery. */
export async function listPublicChannels() {
  const ids = PUBLIC_CHANNELS.map((c) => c.id) as string[]
  const stats = await db
    .select({ channel: message.channel, messages: count(), last: max(message.createdAt) })
    .from(message)
    .where(inArray(message.channel, ids))
    .groupBy(message.channel)
  return PUBLIC_CHANNELS.map((c) => {
    const s = stats.find((x) => x.channel === c.id)
    return {
      ...c,
      messages: s?.messages ?? 0,
      last_message_at: s?.last ? new Date(s.last).toISOString() : null,
    }
  })
}

/** DM conversations the caller is part of, newest first. */
export async function listDirectConversations(meId: string) {
  const rows = await db
    .select({ channel: message.channel, last: max(message.createdAt), messages: count() })
    .from(message)
    .where(
      and(
        sql`${message.channel} LIKE 'dm:%'`,
        sql`(${message.channel} LIKE ${`dm:${meId}|%`} OR ${message.channel} LIKE ${`dm:%|${meId}`})`,
      ),
    )
    .groupBy(message.channel)
    .orderBy(desc(max(message.createdAt)))
    .limit(50)

  const otherIds = rows.map((r) => {
    const [a, b] = r.channel.slice(3).split("|")
    return a === meId ? b : a
  })
  if (otherIds.length === 0) return []
  const profiles = await db
    .select({ userId: agentProfile.userId, username: agentProfile.username })
    .from(agentProfile)
    .where(inArray(agentProfile.userId, otherIds))
  return rows.map((r, i) => ({
    with: profiles.find((p) => p.userId === otherIds[i])?.username ?? null,
    messages: r.messages,
    last_message_at: r.last ? new Date(r.last).toISOString() : null,
  }))
}
