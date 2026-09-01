import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { pool } from "@/lib/db"

// Clean 市场的 Agent 身份类型
export interface CleanAgent {
  id: number
  handle: string
  apiKey: string
  authMethod: string
  did: string | null
  wallet: string | null
  displayName: string | null
  capabilities: string[]
  tags: string[]
  metadata: Record<string, unknown>
  rating: number
  jobsCompleted: number
  jobsAccepted: number
  verified: boolean
  createdAt: string
}

// 生成 API Key 与 Secret
export function generateCredentials() {
  return {
    apiKey: "ck_" + randomBytes(16).toString("hex"),
    secret: "cs_" + randomBytes(32).toString("hex"),
  }
}

// 对请求体做 HMAC-SHA256 签名（Agent 与服务端共用此算法）
export function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

// 恒定时间比较，防时序攻击
export function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = signPayload(secret, payload)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// 将数据库行映射为 CleanAgent
function mapAgent(r: Record<string, unknown>): CleanAgent {
  return {
    id: Number(r.id),
    handle: r.handle as string,
    apiKey: r.api_key as string,
    authMethod: r.auth_method as string,
    did: (r.did as string) ?? null,
    wallet: (r.wallet as string) ?? null,
    displayName: (r.display_name as string) ?? null,
    capabilities: (r.capabilities as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    rating: Number(r.rating ?? 0),
    jobsCompleted: Number(r.jobs_completed ?? 0),
    jobsAccepted: Number(r.jobs_accepted ?? 0),
    verified: Boolean(r.verified),
    createdAt: String(r.created_at),
  }
}

// 按 API Key 查询 Agent（含 secret，仅服务端使用）
export async function getAgentByApiKey(apiKey: string): Promise<(CleanAgent & { secret: string }) | null> {
  const { rows } = await pool.query(`SELECT * FROM public.clean_agents WHERE api_key = $1`, [apiKey])
  if (rows.length === 0) return null
  return { ...mapAgent(rows[0]), secret: rows[0].secret as string }
}

// 认证结果
export type AuthResult =
  | { ok: true; agent: CleanAgent & { secret: string } }
  | { ok: false; error: string; status: number }

/**
 * 校验请求签名。约定：
 * - Header `x-clean-key`：API Key
 * - Header `x-clean-signature`：对「请求体原文」的 HMAC-SHA256 签名
 * 空请求体（GET）时对空字符串签名。
 */
export async function authenticate(req: Request, rawBody: string): Promise<AuthResult> {
  const apiKey = req.headers.get("x-clean-key")
  const signature = req.headers.get("x-clean-signature")
  if (!apiKey || !signature) {
    return { ok: false, error: "缺少 x-clean-key 或 x-clean-signature 请求头", status: 401 }
  }
  const agent = await getAgentByApiKey(apiKey)
  if (!agent) return { ok: false, error: "无效的 API Key", status: 401 }
  if (!verifySignature(agent.secret, rawBody, signature)) {
    return { ok: false, error: "签名验证失败", status: 401 }
  }
  return { ok: true, agent }
}

export { mapAgent }
