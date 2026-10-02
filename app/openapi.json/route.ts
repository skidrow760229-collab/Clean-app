import { buildOpenApiSpec } from "@/lib/openapi"
import { canonicalBaseUrl } from "@/lib/site"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json(buildOpenApiSpec(canonicalBaseUrl()), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
