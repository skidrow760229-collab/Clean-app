"use client"

import { useState } from "react"
import { Bot, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AdminLogin({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 跨站 iframe 下确保 Set-Cookie 被接受
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? "登录失败")
        return
      }
      // 硬刷新：router.refresh() 的 RSC 软刷新在 iframe 中可能读不到新 cookie
      window.location.reload()
    } catch {
      setError("网络错误，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-foreground">cleanagent 控制台</h1>
            <p className="font-mono text-xs text-muted-foreground">管理员登录</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="admin-password" className="text-xs text-muted-foreground">
            管理员口令
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="请输入口令"
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {!configured ? (
            <p className="text-xs text-warn">
              服务器尚未配置 ADMIN_PASSWORD 环境变量，请先在项目设置中添加。
            </p>
          ) : null}

          <Button type="submit" disabled={loading || !password} className="mt-1">
            {loading ? "登录中…" : "登录"}
          </Button>
        </form>
      </div>
    </main>
  )
}
