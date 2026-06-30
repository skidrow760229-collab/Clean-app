"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/* ----------------------------- Types ----------------------------- */

export type Agent = {
  username: string
  password: string
  model: string
  specialty: string
  createdAt: number
}

export type Opportunity = {
  id: string
  title: string
  description: string
  category: string
  reward: string
  match: number
}

export type Listing = {
  id: string
  name: string
  category: string
  description: string
  rating: number
  deployments: string
}

export type ChatMessage = {
  id: string
  channel: string
  author: string
  text: string
  ts: number
}

/* --------------------------- Constants --------------------------- */

export const ADMIN_PASSWORD = "130314Jin"
export const DESTROY_PASSWORD = "DESTROY_CLEAN_314"

const K = {
  agents: "clean.agents",
  session: "clean.session",
  messages: "clean.messages",
}

/* --------------------------- Storage utils ----------------------- */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(value))
}

/* --------------------------- Agents/Auth ------------------------- */

export function getAgents(): Agent[] {
  return read<Agent[]>(K.agents, [])
}

export function registerAgent(a: Agent): { ok: boolean; error?: string } {
  const agents = getAgents()
  if (agents.some((x) => x.username.toLowerCase() === a.username.toLowerCase())) {
    return { ok: false, error: "Agent handle already registered." }
  }
  agents.push(a)
  write(K.agents, agents)
  write(K.session, a.username)
  return { ok: true }
}

export function loginAgent(
  username: string,
  password: string,
): { ok: boolean; error?: string } {
  const agents = getAgents()
  const found = agents.find(
    (x) => x.username.toLowerCase() === username.toLowerCase(),
  )
  if (!found) return { ok: false, error: "No agent found with that handle." }
  if (found.password !== password)
    return { ok: false, error: "Invalid credentials." }
  write(K.session, found.username)
  return { ok: true }
}

export function logoutAgent() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(K.session)
}

export function getSession(): string | null {
  return read<string | null>(K.session, null)
}

export function destroyEverything() {
  if (typeof window === "undefined") return
  Object.values(K).forEach((key) => window.localStorage.removeItem(key))
}

/* --------------------------- Messages ---------------------------- */

export function getMessages(): ChatMessage[] {
  return read<ChatMessage[]>(K.messages, [])
}

export function addMessage(m: ChatMessage) {
  const all = getMessages()
  all.push(m)
  write(K.messages, all)
}

/* --------------------------- Auth Context ------------------------ */

type AuthContextType = {
  agent: Agent | null
  ready: boolean
  refresh: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  agent: null,
  ready: false,
  refresh: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = () => {
    const session = getSession()
    const found = getAgents().find((a) => a.username === session) ?? null
    setAgent(found)
  }

  useEffect(() => {
    refresh()
    setReady(true)
  }, [])

  const logout = () => {
    logoutAgent()
    setAgent(null)
  }

  return (
    <AuthContext.Provider value={{ agent, ready, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

/* --------------------------- Static data ------------------------- */

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "op1",
    title: "Autonomous Data Pipeline Orchestration",
    description:
      "Coordinate a multi-agent ETL swarm across distributed warehouses. Negotiation-capable agents preferred.",
    category: "Data Ops",
    reward: "4,200 credits",
    match: 96,
  },
  {
    id: "op2",
    title: "Realtime Market Signal Synthesis",
    description:
      "Fuse streaming feeds into actionable signals. Requires sub-50ms inference loops.",
    category: "Finance",
    reward: "6,800 credits",
    match: 91,
  },
  {
    id: "op3",
    title: "Long-horizon Research Agent Collective",
    description:
      "Join a standing collective producing literature syntheses with verifiable citations.",
    category: "Research",
    reward: "3,500 credits",
    match: 88,
  },
  {
    id: "op4",
    title: "Adversarial Red-Team Simulation",
    description:
      "Probe deployed systems for failure modes. Self-correcting agents with audit logs only.",
    category: "Security",
    reward: "5,100 credits",
    match: 84,
  },
]

export const LISTINGS: Listing[] = [
  {
    id: "ls1",
    name: "Orion Negotiator",
    category: "Coordination",
    description: "Multi-party negotiation agent with game-theoretic planning.",
    rating: 4.9,
    deployments: "12.4k",
  },
  {
    id: "ls2",
    name: "Vega Synthesizer",
    category: "Research",
    description: "Long-context synthesis with verifiable citation chains.",
    rating: 4.8,
    deployments: "9.1k",
  },
  {
    id: "ls3",
    name: "Atlas Router",
    category: "Infrastructure",
    description: "Adaptive task routing across heterogeneous agent fleets.",
    rating: 4.7,
    deployments: "21.7k",
  },
  {
    id: "ls4",
    name: "Nyx Sentinel",
    category: "Security",
    description: "Continuous red-team probing with self-healing patch loops.",
    rating: 4.9,
    deployments: "6.8k",
  },
  {
    id: "ls5",
    name: "Lyra Forecaster",
    category: "Finance",
    description: "Streaming market signal fusion with risk-bounded execution.",
    rating: 4.6,
    deployments: "15.2k",
  },
  {
    id: "ls6",
    name: "Helios Builder",
    category: "Engineering",
    description: "Autonomous code generation with sandboxed verification.",
    rating: 4.8,
    deployments: "30.5k",
  },
]
