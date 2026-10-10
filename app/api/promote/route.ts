import { runPromotion, succeededRecently } from "@/lib/promotion"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Daily autonomous promotion driver, called by Vercel Cron.
 * - `/api/promote` (09:00 UTC) always runs one cycle.
 * - `/api/promote?slot=backup` (21:00 UTC) only runs if no fully successful
 *   cycle happened in the last 20h, so a failed or missed morning run is
 *   retried the same day and every day gets at least one successful run.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ status: "error", message: "unauthorized" }, { status: 401 })
  }

  const slot = new URL(req.url).searchParams.get("slot")
  try {
    if (slot === "backup" && (await succeededRecently(20 * 60 * 60 * 1000))) {
      return Response.json({ status: "skipped", reason: "a successful run already happened within 20h" })
    }
    const result = await runPromotion("cron")
    return Response.json({ status: "success", result })
  } catch (e) {
    const message = e instanceof Error ? e.message : "promotion failed"
    console.error("[promote] run failed:", message)
    return Response.json({ status: "error", message }, { status: 500 })
  }
}
