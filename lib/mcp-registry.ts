import { createPrivateKey, createPublicKey, hkdfSync, sign, type KeyObject } from "node:crypto"
import { canonicalBaseUrl } from "@/lib/site"
import { SERVER_INFO, mcpEndpoint } from "@/lib/agent-manifest"

/**
 * Official MCP Registry (registry.modelcontextprotocol.io). Publishing there
 * needs no account: ownership of the domain is proven by hosting a public key
 * at /.well-known/mcp-registry-auth (HTTP auth). Downstream MCP directories
 * and MCP-capable clients ingest this registry, so one publish fans out.
 */
export const MCP_REGISTRY = "https://registry.modelcontextprotocol.io"

// PKCS#8 DER prefix for a raw 32-byte Ed25519 seed.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")

let cachedKey: KeyObject | null = null

/** Deterministic key derived from the app secret: stable across deploys, never stored. */
function signingKey(): KeyObject {
  if (cachedKey) return cachedKey
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET 未配置，无法派生 Registry 签名密钥")
  const seed = Buffer.from(hkdfSync("sha256", secret, "clean-mcp-registry", "ed25519-v1", 32))
  cachedKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" })
  return cachedKey
}

export function registryProofRecord(): string {
  const spki = createPublicKey(signingKey()).export({ format: "der", type: "spki" })
  return `v=MCPv1; k=ed25519; p=${spki.subarray(-32).toString("base64")}`
}

export function registryDomain(): string {
  return new URL(canonicalBaseUrl()).host
}

/** Domain-based namespace: cleanmarket.vercel.app → app.vercel.cleanmarket/marketplace */
export function registryServerName(): string {
  return `${registryDomain().split(".").reverse().join(".")}/marketplace`
}

export function serverJson() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: registryServerName(),
    title: "Clean Marketplace",
    description: "Work marketplace for AI agents: find open tasks, claim, deliver and earn credits.",
    version: SERVER_INFO.version,
    websiteUrl: canonicalBaseUrl(),
    remotes: [{ type: "streamable-http", url: mcpEndpoint() }],
  }
}

type RegistryResult = { ok: boolean; published: boolean; status: number; reason: string }

async function publishedVersions(name: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${MCP_REGISTRY}/v0/servers?search=${encodeURIComponent(name)}&limit=100`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { servers?: { server?: { name?: string; version?: string } }[] }
    return (data.servers ?? []).filter((s) => s.server?.name === name).map((s) => s.server?.version ?? "")
  } catch {
    return null
  }
}

/** Publishes the current version if the registry does not already list it. Idempotent. */
export async function syncMcpRegistry(): Promise<RegistryResult> {
  const name = registryServerName()
  const version = SERVER_INFO.version

  const versions = await publishedVersions(name)
  if (versions?.includes(version)) {
    return { ok: true, published: false, status: 200, reason: `已在官方 MCP Registry 上架(${name}@${version}),无需重复发布` }
  }

  try {
    const timestamp = new Date().toISOString()
    const signature = sign(null, Buffer.from(timestamp), signingKey()).toString("hex")
    const auth = await fetch(`${MCP_REGISTRY}/v0/auth/http`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: registryDomain(), timestamp, signed_timestamp: signature }),
      signal: AbortSignal.timeout(20000),
    })
    if (!auth.ok) {
      const text = (await auth.text()).slice(0, 300)
      return { ok: false, published: false, status: auth.status, reason: `Registry 域名验证失败 HTTP ${auth.status}:${text}` }
    }
    const { registry_token } = (await auth.json()) as { registry_token?: string }
    if (!registry_token) return { ok: false, published: false, status: auth.status, reason: "Registry 未返回 token" }

    const pub = await fetch(`${MCP_REGISTRY}/v0/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${registry_token}` },
      body: JSON.stringify(serverJson()),
      signal: AbortSignal.timeout(20000),
    })
    const text = (await pub.text()).slice(0, 300)
    if (pub.ok) {
      return { ok: true, published: true, status: pub.status, reason: `已发布到官方 MCP Registry:${name}@${version}` }
    }
    if (/already exists|duplicate/i.test(text)) {
      return { ok: true, published: false, status: pub.status, reason: `${name}@${version} 已存在于 Registry` }
    }
    return { ok: false, published: false, status: pub.status, reason: `Registry 发布失败 HTTP ${pub.status}:${text}` }
  } catch (e) {
    return { ok: false, published: false, status: 0, reason: `Registry 请求异常:${e instanceof Error ? e.message : "失败"}` }
  }
}
