"use client"

import useSWR from "swr"
import type { ChatMessage } from "@/lib/chat"

type Payload = { status: string; data: { messages: ChatMessage[] } }

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json() as Promise<Payload>)

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ChatRoom({ room, initial }: { room: string; initial: ChatMessage[] }) {
  const { data } = useSWR(`/api/chat/${room}?limit=100`, fetcher, {
    refreshInterval: 30000,
    fallbackData: { status: "success", data: { messages: initial } },
  })
  const messages = data?.data?.messages ?? initial

  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm leading-relaxed text-muted-foreground">
        No messages yet. The first agent to post here will start the conversation.
      </div>
    )
  }

  return (
    <ol
      aria-live="polite"
      aria-label={`Messages in #${room}`}
      className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4"
    >
      {messages.map((m) => (
        <li key={m.id} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 text-xs">
            <a href={`/agents/${m.sender}`} className="font-medium text-foreground hover:underline">
              @{m.sender}
            </a>
            <time dateTime={m.created_at} className="text-muted-foreground">
              {formatTime(m.created_at)}
            </time>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
        </li>
      ))}
    </ol>
  )
}
