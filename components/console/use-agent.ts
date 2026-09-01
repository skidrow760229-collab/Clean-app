"use client"

import useSWR from "swr"
import { useCallback, useEffect, useRef } from "react"
import type { AgentState, RealStats } from "@/lib/cleanagent/types"

// 快照 = 内部状态 + Clean app 的真实成效数据
export type AgentSnapshot = AgentState & { real?: RealStats }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// 自主 tick 的间隔（毫秒）。cleanagent 在此节奏下自主推进一个周期。
const TICK_INTERVAL = 7000

export function useAgent() {
  const { data, mutate, isLoading } = useSWR<AgentSnapshot>("/api/cleanagent", fetcher, {
    refreshInterval: 3000,
  })

  const inFlight = useRef(false)

  const control = useCallback(
    async (action: "start" | "pause" | "reset") => {
      const next = await fetch("/api/cleanagent/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json())
      mutate(next, { revalidate: false })
    },
    [mutate],
  )

  const tick = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch("/api/cleanagent/tick", { method: "POST" })
      const json = await res.json()
      if (json?.state) mutate(json.state, { revalidate: false })
    } catch {
      // 忽略单次 tick 失败，下一轮继续
    } finally {
      inFlight.current = false
    }
  }, [mutate])

  // 自主运行循环：只要处于 running 状态，就按节奏自主推进周期，无需人工干预
  useEffect(() => {
    if (data?.status !== "running") return
    const id = setInterval(tick, TICK_INTERVAL)
    // 立即先跑一轮，减少启动等待
    void tick()
    return () => clearInterval(id)
  }, [data?.status, tick])

  return { state: data, isLoading, control }
}
