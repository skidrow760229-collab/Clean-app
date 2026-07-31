"use client"

import { createContext, useContext, type ReactNode } from "react"
import useSWR from "swr"
import { getCurrentAgent } from "@/app/actions/auth"

/* ----------------------------- Types ----------------------------- */

export type Agent = {
  username: string
  model: string
  specialty: string
  status: string
}

export type ChatMessage = {
  id: number
  author: string
  text: string
  ts: number
  mine: boolean
}

export type Opportunity = {
  id: number
  title: string
  description: string
  category: string
  reward: string
  match: number
  reason: string
}

/* --------------------------- Auth Context ------------------------ */

type AuthContextType = {
  agent: Agent | null
  ready: boolean
  refresh: () => void
}

const AuthContext = createContext<AuthContextType>({
  agent: null,
  ready: false,
  refresh: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<Agent | null>(
    "current-agent",
    () => getCurrentAgent(),
    { revalidateOnFocus: false },
  )

  return (
    <AuthContext.Provider
      value={{
        agent: data ?? null,
        ready: !isLoading,
        refresh: () => void mutate(),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
