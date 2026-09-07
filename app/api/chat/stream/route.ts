import type { NextRequest } from "next/server"
import { Client } from "pg"
import { getCurrentAgent } from "@/lib/session"
import { canAccessChannel } from "@/lib/channels"
import { PG_NOTIFY_CHANNEL, type ChatEvent } from "@/lib/realtime"

// A long-lived Postgres LISTEN connection needs the Node runtime (not Edge)
// and a raw, non-pooled connection — PgBouncer transaction pooling drops
// session-level LISTEN state.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Cap the connection lifetime; the browser's EventSource auto-reconnects when
// the stream ends, so this just recycles the DB connection periodically.
export const maxDuration = 300

const DIRECT_URL =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING

/**
 * Server-Sent Events stream of chat messages for one channel.
 *
 * Real push, not polling: a dedicated Postgres LISTEN connection forwards
 * every NOTIFY whose payload matches the requested channel straight to the
 * browser. Access is checked against the signed-in agent before any data
 * flows, so private DM channels never leak to non-participants.
 */
export async function GET(request: NextRequest) {
  const agent = await getCurrentAgent()
  if (!agent) {
    return new Response("Unauthorized", { status: 401 })
  }

  const channel = request.nextUrl.searchParams.get("channel")
  if (!channel || !canAccessChannel(channel, agent.username)) {
    return new Response("Forbidden channel", { status: 403 })
  }

  if (!DIRECT_URL) {
    return new Response("Realtime transport unavailable", { status: 503 })
  }

  const encoder = new TextEncoder()
  const client = new Client({ connectionString: DIRECT_URL })

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let heartbeat: ReturnType<typeof setInterval> | undefined

      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Controller already closed by an aborted request — ignore.
        }
      }

      const cleanup = async () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        request.signal.removeEventListener("abort", cleanup)
        try {
          await client.end()
        } catch {
          // Connection may already be torn down.
        }
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }

      client.on("notification", (msg) => {
        if (!msg.payload) return
        let event: ChatEvent
        try {
          event = JSON.parse(msg.payload) as ChatEvent
        } catch {
          return
        }
        // Only forward events for the channel this connection is watching.
        if (event.channel !== channel) return
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`)
      })

      client.on("error", () => {
        void cleanup()
      })

      try {
        await client.connect()
        await client.query(`LISTEN ${PG_NOTIFY_CHANNEL}`)
      } catch {
        safeEnqueue(`event: error\ndata: "connect_failed"\n\n`)
        await cleanup()
        return
      }

      // Tell the client we're live so it can clear any "connecting" state.
      safeEnqueue(`event: ready\ndata: "${channel}"\n\n`)

      // Comment-only heartbeat keeps proxies from closing an idle stream.
      heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 25000)

      request.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
