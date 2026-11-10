import { agentCard } from "@/lib/agent-manifest"
import { trackHit } from "@/lib/agent-traffic"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  trackHit("agent_card", req)
  return Response.json(agentCard(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  })
}
