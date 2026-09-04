import { NextResponse } from "next/server"
import { probeDiscoveryEndpoints } from "@/lib/cleanagent/clean"
import { isAuthed } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

// 实时探测本应用对外发布的三个公开发现端点（真实外呼渠道）的可达性。（需管理员登录）
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000"
  const result = await probeDiscoveryEndpoints(base)
  return NextResponse.json({ base, checkedAt: Date.now(), ...result })
}
