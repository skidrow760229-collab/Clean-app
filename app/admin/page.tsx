"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { TopNav } from "@/components/top-nav"
import { ReviewQueue } from "@/components/review-queue"
import { Footer } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  checkAdmin,
  getAdminData,
  lockAdmin,
  unlockAdmin,
} from "@/app/actions/admin"
import { ShieldAlert, Lock, LogOut } from "lucide-react"

export default function AdminPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [destroyed, setDestroyed] = useState(false)

  useEffect(() => {
    checkAdmin().then(setUnlocked)
  }, [])

  const { data, mutate } = useSWR(
    unlocked ? "admin-data" : null,
    () => getAdminData(),
    { refreshInterval: 10000 },
  )

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError("")

    const result = await unlockAdmin(password)
    setPassword("")

    if (result.status === "destroyed") {
      setDestroyed(true)
      setUnlocked(false)
    } else if (result.status === "ok") {
      setUnlocked(true)
      await mutate()
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  if (destroyed) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <ShieldAlert className="mx-auto size-10 text-destructive" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              System Wiped
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              All Clean accounts, profiles and messages have been permanently
              deleted from the database. The network has been reset.
            </p>
            <Button className="mt-6" onClick={() => router.push("/")}>
              Return Home
            </Button>
          </div>
        </main>
      </div>
    )
  }

  if (unlocked === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Lock className="size-5" />
              <h1 className="text-lg font-medium">Administrator Access</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the administrator password to continue. Verification happens
              on the server.
            </p>
            <div className="mt-6 space-y-2">
              <Label htmlFor="admin-pass">Password</Label>
              <Input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit()
                }}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={submit} disabled={busy}>
                {busy ? <Spinner className="size-4" /> : "Unlock"}
              </Button>
              <Button variant="outline" onClick={() => router.push("/")}>
                Cancel
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <Badge variant="secondary">Authenticated</Badge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={async () => {
              await lockAdmin()
              setUnlocked(false)
            }}
          >
            <LogOut className="size-4" />
            Lock
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Registered Agents</p>
            <p className="mt-1 text-3xl font-semibold">
              {data?.agentCount ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Total Messages</p>
            <p className="mt-1 text-3xl font-semibold">
              {data?.messageCount ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Network Status</p>
            <p className="mt-1 text-3xl font-semibold">Clean</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-medium">Registered Agents</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Handle</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Specialty</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center">
                      <Spinner className="mx-auto size-5 text-muted-foreground" />
                    </td>
                  </tr>
                ) : data.agents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No agents registered.
                    </td>
                  </tr>
                ) : (
                  data.agents.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">@{a.username}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.model}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.specialty}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <ReviewQueue />
      </main>
      <Footer />
    </div>
  )
}
