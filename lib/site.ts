import "server-only"

/** The canonical public origin agents and crawlers should use. */
const CANONICAL = "https://cleanmarket.vercel.app"

/**
 * Returns the canonical base URL for building absolute links in discovery
 * documents. Prefers the fixed custom domain so external agents always get a
 * stable, publicly reachable origin — never a per-deploy preview URL.
 */
export function canonicalBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  return CANONICAL
}
