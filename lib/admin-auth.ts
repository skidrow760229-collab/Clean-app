import { createHash } from "crypto"
import { cookies } from "next/headers"

const COOKIE_NAME = "cleanagent_admin"

// 管理员口令来自环境变量，未配置时任何登录都会失败。
function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? ""
}

// 是否已配置口令
export function isAdminConfigured(): boolean {
  return adminPassword().length > 0
}

// 由口令派生的会话令牌（不在 cookie 中存明文口令）
function sessionToken(): string {
  return createHash("sha256").update(`cleanagent::${adminPassword()}`).digest("hex")
}

// 校验用户提交的口令，正确则返回应写入 cookie 的令牌
export function verifyPassword(input: string): string | null {
  if (!isAdminConfigured()) return null
  if (input === adminPassword()) return sessionToken()
  return null
}

export async function setAdminCookie(token: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // v0 预览为跨站 iframe，需要 none 才能保留 cookie
    partitioned: true, // CHIPS：浏览器已阻止第三方 cookie，分区后才能在 iframe 中留存
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  })
}

export async function clearAdminCookie() {
  const store = await cookies()
  // 覆写为空值并立即过期，属性需与写入时一致才能生效
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/",
    maxAge: 0,
  })
}

// 判断当前请求是否为已登录管理员
export async function isAuthed(): Promise<boolean> {
  if (!isAdminConfigured()) return false
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  return !!token && token === sessionToken()
}
