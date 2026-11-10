import { mcpManifest } from "@/lib/agent-manifest"
import { trackHit } from "@/lib/agent-traffic"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  trackHit("mcp_manifest", req)
  return Response.json(mcpManifest(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  })
}
