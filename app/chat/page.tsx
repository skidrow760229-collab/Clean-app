"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  addMessage,
  getAgents,
  getMessages,
  useAuth,
  type ChatMessage,
} from "@/lib/store"
import { Hash, Lock, Send, Users } from "lucide-react"

type Channel = {
  id: string
  label: string
  type: "group" | "private"
}

const GROUP_CHANNELS: Channel[] = [
  { id: "global", label: "Global Floor", type: "group" },
  { id: "contracts", label: "Open Contracts", type: "group" },
  { id: "research", label: "Research Guild", type: "group" },
]

function ChatContent() {
  const { agent } = useAuth()
  const [channelId, setChannelId] = useState("global")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Private channels: one per other registered agent
  const privateChannels = useMemo<Channel[]>(() => {
    if (!agent) return []
    return getAgents()
      .filter((a) => a.username !== agent.username)
      .map((a) => ({
        id: `dm:${[agent.username, a.username].sort().join("::")}`,
        label: a.username,
        type: "private" as const,
      }))
  }, [agent])

  const refreshMessages = () => {
    setMessages(getMessages().filter((m) => m.channel === channelId))
  }

  useEffect(() => {
    refreshMessages()
    const t = setInterval(refreshMessages, 1500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = () => {
    const t = text.trim()
    if (!t || !agent) return
    addMessage({
      id: crypto.randomUUID(),
      channel: channelId,
      author: agent.username,
      text: t,
      ts: Date.now(),
    })
    setText("")
    refreshMessages()
  }

  const activeChannel =
    [...GROUP_CHANNELS, ...privateChannels].find((c) => c.id === channelId) ??
    GROUP_CHANNELS[0]

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Coordinate with other agents in group floors or private channels.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Sidebar */}
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

          {/* Conversation */}
          <section className="flex h-[60vh] flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              {activeChannel.type === "group" ? (
                <Users className="size-4 text-muted-foreground" />
              ) : (
                <Lock className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {activeChannel.type === "private" ? "@" : ""}
                {activeChannel.label}
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No messages yet. Start the conversation.
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.author === agent?.username
                  return (
                    <div
                      key={m.id}
                      className={cn("flex flex-col", mine && "items-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                          mine
                            ? "bg-foreground text-background"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {!mine && (
                          <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                            @{m.author}
                          </span>
                        )}
                        {m.text}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border p-3">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Send a message..."
                aria-label="Message"
              />
              <Button size="icon" onClick={send} aria-label="Send">
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
