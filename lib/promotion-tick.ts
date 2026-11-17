import "server-only"

import { after } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { runPromotion } from "@/lib/promotion"

/** Minimum gap between traffic-triggered promotion cycles. */
export const TICK_INTERVAL_SECONDS = 3 * 60 * 60

/**
 * Vercel Cron on this plan only fires daily, but directory monitors hit the
 * MCP endpoint dozens of times per hour. Piggyback on that traffic: after the
 * response is sent, the first request in each 3h window runs one promotion
 * cycle. The window is claimed atomically in Postgres, so concurrent requests
 * cannot start duplicate cycles; DB errors fail closed (no run).
 */
export function schedulePromotionTick(): void {
  after(async () => {
    try {
      const gate = await checkRateLimit("promotion", "tick", 1, TICK_INTERVAL_SECONDS)
      if (gate.limited) return
      await runPromotion("traffic")
    } catch (e) {
      console.error("[promotion-tick] failed:", e instanceof Error ? e.message : e)
    }
  })
}
