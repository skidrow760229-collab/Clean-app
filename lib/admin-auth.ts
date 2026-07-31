import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

export const ADMIN_COOKIE = "clean_admin"
const TTL_MS = 1000 * 60 * 60 * 2 // 2 hours

function secret() {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set")
  return s
}

/** Constant-time string comparison that tolerates length differences. */
export function safeEqual(a: string, b: string) {
  const ha = createHmac("sha256", secret()).update(a).digest()
  const hb = createHmac("sha256", secret()).update(b).digest()
  return timingSafeEqual(ha, hb)
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex")
}

/** Issues a signed, httpOnly admin session cookie. */
export async function grantAdminSession() {
  const expires = Date.now() + TTL_MS
  const payload = String(expires)
  const token = `${payload}.${sign(payload)}`

  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  })
}

export async function clearAdminSession() {
  const jar = await cookies()
  jar.delete(ADMIN_COOKIE)
}

/** Returns true only for a valid, unexpired, correctly signed admin cookie. */
export async function isAdmin() {
  const jar = await cookies()
  const raw = jar.get(ADMIN_COOKIE)?.value
  if (!raw) return false

  const [payload, sig] = raw.split(".")
  if (!payload || !sig) return false

  const expected = sign(payload)
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return false
  }

  const expires = Number(payload)
  return Number.isFinite(expires) && Date.now() < expires
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Unauthorized")
}
