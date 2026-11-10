import { registryProofRecord } from "@/lib/mcp-registry"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return new Response(registryProofRecord(), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  } catch {
    return new Response("unavailable", { status: 503 })
  }
}
