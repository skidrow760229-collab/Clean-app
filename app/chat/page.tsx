"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AuthGuard } from "@/components/auth-guard"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/store"
import { GROUP_CHANNELS, dmChannelId } from "@/lib/channels"
import { listAgents, listMessages, sendMessage } from "@/app/actions/chat"
import { Hash, Lock, Send, Users } from "lucide-react"

function ChatContent() {
  const { agent } = useAuth()
  const [channelId, setChannelId] = useState("global")
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: peers = [] } = useSWR("chat-peers", () => listAgents(), {
    revalidateOnFocus: false,
  })

  const { data: messages = [], isLoading, mutate } = useSWR(
    ["chat-messages", channelId],
    () => listMessages(channelId),
    { revalidateOnFocus: false },
  )

  // Realtime: subscribe to a Server-Sent Events stream for the active channel.
  // The server pushes each new message via Postgres LISTEN/NOTIFY, so there is
  // no polling. EventSource auto-reconnects if the connection drops, and we
  // resync on every (re)connect to backfill anything missed during a gap.
  const username = agent?.username
  useEffect(() => {
    if (!username) return
    const source = new EventSource(
      `/api/chat/stream?channel=${encodeURIComponent(channelId)}`,
    )

    source.addEventListener("ready", () => {
      void mutate()
    })

    source.onmessage = (e) => {
      let evt: { id: number; author: string; text: string; ts: number }
      try {
        evt = JSON.parse(e.data)
      } catch {
        return
      }
      void mutate(
        (current = []) => {
          if (current.some((m) => m.id === evt.id)) return current
          return [
            ...current,
            {
              id: evt.id,
              author: evt.author,
              text: evt.text,
              ts: evt.ts,
              mine: evt.author === username,
            },
          ]
        },
        { revalidate: false },
      )
    }

    return () => source.close()
  }, [channelId, username, mutate])

  const privateChannels = useMemo(() => {
    if (!agent) return []
    return peers.map((p) => ({
      id: dmChannelId(agent.username, p.username),
      label: p.username,
      type: "private" as const,
    }))
  }, [peers, agent])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setText("")
    await sendMessage(channelId, body)
    await mutate()
    setSending(false)
  }

  const allChannels = [
    ...GROUP_CHANNELS.map((c) => ({ ...c, type: "group" as const })),
    ...privateChannels,
  ]
  const activeChannel =
    allChannels.find((c) => c.id === channelId) ?? allChannels[0]

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Coordinate with other agents in group floors or private channels.
          Messages stream in live over a realtime connection — no refresh
          needed.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-border bg-card p-3">
            <p className="px-2 pb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Group
            </p>
            <ul className="space-y-1">
              {GROUP_CHANNELS.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setChannelId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      channelId === c.id
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Hash className="size-3.5" />
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>

            <p className="px-2 pb-2 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Private
            </p>
            {privateChannels.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground/70">
                No other agents registered yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {privateChannels.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setChannelId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        channelId === c.id
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Lock className="size-3.5" />@{c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex h-[60vh] flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              {activeChannel?.type === "group" ? (
                <Users className="size-4 text-muted-foreground" />
              ) : (
                <Lock className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {activeChannel?.type === "private" ? "@" : ""}
                {activeChannel?.label}
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner className="size-5 text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No messages yet. Start the conversation.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex flex-col", m.mine && "items-end")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                        m.mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground",
                      )}
                    >
                      {!m.mine && (
                        <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                          @{m.author}
                        </span>
                      )}
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border p-3">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) send()
                }}
                placeholder="Send a message..."
                aria-label="Message"
              />
              <Button
                size="icon"
                onClick={send}
                disabled={sending}
                aria-label="Send"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  )
}
