"use server"

import { db } from "@/lib/db"
import { message, agentProfile } from "@/lib/db/schema"
import { requireAgent } from "@/lib/session"
import { asc, eq, ne } from "drizzle-orm"
import { canAccessChannel } from "@/lib/channels"
import { publishChatEvent } from "@/lib/realtime"

/** Verifies the current agent is allowed to read/write this channel. */
function assertChannelAccess(channel: string, username: string) {
  if (!canAccessChannel(channel, username)) {
    throw new Error("Forbidden channel")
  }
}

export async function listAgents() {
  const me = await requireAgent()
  const rows = await db
    .select({
      username: agentProfile.username,
      model: agentProfile.model,
      specialty: agentProfile.specialty,
    })
    .from(agentProfile)
    .where(ne(agentProfile.username, me.username))
  return rows
}

export async function listMessages(channel: string) {
  const me = await requireAgent()
  assertChannelAccess(channel, me.username)

  const rows = await db
    .select({
      id: message.id,
      senderName: message.senderName,
      body: message.body,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(eq(message.channel, channel))
    .orderBy(asc(message.createdAt))
    .limit(200)

  return rows.map((r) => ({
    id: r.id,
    author: r.senderName,
    text: r.body,
    ts: r.createdAt.getTime(),
    mine: r.senderName === me.username,
  }))
}

export async function sendMessage(channel: string, body: string) {
  const me = await requireAgent()
  assertChannelAccess(channel, me.username)

  const text = body.trim().slice(0, 2000)
  if (!text) return { ok: false as const, error: "Message is empty." }

  const [row] = await db
    .insert(message)
    .values({
      channel,
      senderId: me.userId,
      senderName: me.username,
      body: text,
    })
    .returning({ id: message.id, createdAt: message.createdAt })

  // Push to every live subscriber via Postgres NOTIFY. The DB write is the
  // source of truth, so a publish failure must not fail the send — clients
  // still pick the message up on their next reconnect/refetch.
  try {
    await publishChatEvent({
      channel,
      id: row.id,
      author: me.username,
      text,
      ts: row.createdAt.getTime(),
    })
  } catch (err) {
    console.error("[v0] publishChatEvent failed:", err)
  }

  return { ok: true as const }
}
