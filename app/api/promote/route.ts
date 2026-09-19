import { runPromotion } from "@/lib/promotion"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * 7x24 promotion driver. Vercel Cron calls this on a schedule; it also accepts
 * a manual trigger from the authenticated admin console. Vercel Cron requests
 * carry a bearer token equal to CRON_SECRET when that env var is set, so we
 * honor it when present and otherwise allow the call (the work is idempotent
 * and non-destructive: it only probes public endpoints and pings IndexNow).
 */
async function handle(trigger: "cron" | "manual") {
  try {
    const result = await runPromotion(trigger)
    return Response.json({ status: "success", result })
  } catch (e) {
    const message = e instanceof Error ? e.message : "promotion failed"
    console.error("[v0] promotion run failed:", message)
    return Response.json({ status: "error", message }, { status: 500 })
  }
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ status: "error", message: "unauthorized" }, { status: 401 })
  }
  return handle("cron")
}
