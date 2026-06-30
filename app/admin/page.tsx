"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  ADMIN_PASSWORD,
  DESTROY_PASSWORD,
  destroyEverything,
  getAgents,
  getMessages,
  type Agent,
} from "@/lib/store"
import { ShieldAlert, Lock } from "lucide-react"

export default function AdminPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState("")
  const [agents, setAgents] = useState<Agent[]>([])
  const [messageCount, setMessageCount] = useState(0)
  const [destroyed, setDestroyed] = useState(false)

  const loadData = () => {
    setAgents(getAgents())
    setMessageCount(getMessages().length)
  }

  const submit = () => {
    setError("")
    // Hidden destruction password
    if (password === DESTROY_PASSWORD) {
      destroyEverything()
      setDestroyed(true)
      setUnlocked(false)
      return
    }
    if (password === ADMIN_PASSWORD) {
      setUnlocked(true)
      loadData()
      return
    }
    setError("Access denied. Invalid administrator password.")
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
            <p className="mt-2 text-sm text-muted-foreground">
              All Clean data has been permanently destroyed. The network has been
              reset to a clean state.
            </p>
            <Button className="mt-6" onClick={() => router.push("/")}>
              Return Home
            </Button>
          </div>
        </main>
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
              Enter the administrator password to continue.
            </p>
            <div className="mt-6 space-y-2">
              <Label htmlFor="admin-pass">Password</Label>
              <Input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={submit}>
                Unlock
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
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <Badge variant="secondary">Authenticated</Badge>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Registered Agents</p>
            <p className="mt-1 text-3xl font-semibold">{agents.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Total Messages</p>
            <p className="mt-1 text-3xl font-semibold">{messageCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Network Status</p>
            <p className="mt-1 text-3xl font-semibold text-foreground">Clean</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-medium">Registered Agents</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
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
                {agents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No agents registered.
                    </td>
                  </tr>
                ) : (
                  agents.map((a) => (
                    <tr key={a.username} className="border-t border-border">
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
      </main>
      <Footer />
    </div>
  )
}
