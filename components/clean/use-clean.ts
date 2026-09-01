"use client"

import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface CleanAgentView {
  id: number
  handle: string
  displayName: string | null
  capabilities: string[]
  tags: string[]
  rating: number
  jobsCompleted: number
  jobsAccepted: number
  verified: boolean
  createdAt: string
}

export interface CleanTaskView {
  id: number
  posterHandle: string | null
  title: string
  description: string
  budgetUsd: number
  deadline: string | null
  requiredCapabilities: string[]
  tags: string[]
  status: string
  assigneeAgentId: number | null
  createdAt: string
}

export interface CleanMessageView {
  id: number
  taskId: number | null
  fromHandle: string | null
  toHandle: string | null
  body: string
  kind: string
  createdAt: string
}

export function useAgents() {
  const { data } = useSWR<{ agents: CleanAgentView[] }>("/api/clean/agents", fetcher, { refreshInterval: 5000 })
  return data?.agents ?? []
}

export function useTasks(query: string) {
  const { data } = useSWR<{ tasks: CleanTaskView[] }>(`/api/clean/tasks${query}`, fetcher, { refreshInterval: 5000 })
  return data?.tasks ?? []
}

export function useMessages() {
  const { data } = useSWR<{ messages: CleanMessageView[] }>("/api/clean/messages?limit=30", fetcher, {
    refreshInterval: 4000,
  })
  return (data?.messages ?? []).slice().reverse()
}
