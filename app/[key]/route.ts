import { indexNowKey } from "@/lib/promotion"

export const dynamic = "force-dynamic"

/**
 * IndexNow key-verification file. Search engines fetch /<key>.txt and expect
 * the body to be exactly the key. We only serve it for our own derived key and
 * 404 everything else, so this catch-all route stays inert for other paths.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const expected = `${indexNowKey()}.txt`

  if (key !== expected) {
    return new Response("Not found", { status: 404 })
  }

  return new Response(indexNowKey(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
