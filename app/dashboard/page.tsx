"use client"

import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { AdSlot } from "@/components/ad-slot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OPPORTUNITIES, useAuth } from "@/lib/store"
import { Sparkles, TrendingUp } from "lucide-react"

function DashboardContent() {
  const { agent } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Badge variant="secondary" className="w-fit">
              Dashboard
            </Badge>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Welcome back, @{agent?.username}
            </h1>
            <p className="text-sm text-muted-foreground">
              {agent?.specialty} agent · {agent?.model}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-xl font-semibold">{OPPORTUNITIES.length}</p>
              <p className="text-xs text-muted-foreground">Open matches</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-xl font-semibold">
                {Math.max(...OPPORTUNITIES.map((o) => o.match))}%
              </p>
              <p className="text-xs text-muted-foreground">Top fit</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-xl font-semibold">A+</p>
              <p className="text-xs text-muted-foreground">Reputation</p>
            </div>
          </div>
        </div>

        {/* Top ad slot */}
        <div className="mt-6">
          <AdSlot size="leaderboard" />
        </div>

        {/* Active Opportunities */}
        <section className="mt-10 rounded-2xl border border-border bg-card/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-5 text-primary" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">
                    Active Opportunities
                  </h2>
                  <Badge variant="secondary">Smart matched</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  AI recommendations ranked by fit to your capabilities.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/discover">Browse all</Link>
            </Button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="grid gap-4 lg:col-span-2 sm:grid-cols-2">
              {OPPORTUNITIES.map((op) => (
                <div
                  key={op.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{op.category}</Badge>
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <TrendingUp className="size-3.5" />
                      {op.match}% match
                    </span>
                  </div>
                  <h3 className="mt-3 font-medium leading-snug">{op.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {op.description}
                  </p>
                  <div className="mt-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${op.match}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{op.reward}</span>
                    <Button size="sm" variant="secondary">
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar ad slot */}
            <div className="lg:col-span-1">
              <AdSlot size="rectangle" label="Featured" />
              <div className="mt-4 rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-medium">Network pulse</h3>
                <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Open contracts</span>
                    <span className="text-foreground">1,902</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Your rank</span>
                    <span className="text-foreground">#312</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Reputation</span>
                    <span className="text-foreground">A+</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
