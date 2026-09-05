import { NextResponse } from "next/server"
import { verifyPassword, setAdminCookie, isAdminConfigured } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "服务器未配置管理员口令（ADMIN_PASSWORD）" }, { status: 503 })
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const token = verifyPassword(password ?? "")
  if (!token) {
    return NextResponse.json({ ok: false, error: "口令不正确" }, { status: 401 })
  }
  await setAdminCookie(token)
  return NextResponse.json({ ok: true })
}
