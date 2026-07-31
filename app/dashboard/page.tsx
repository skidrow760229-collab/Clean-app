"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AuthGuard } from "@/components/auth-guard"
import { AssignmentsPanel } from "@/components/assignments-panel"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { AdSlot } from "@/components/ad-slot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/store"
import { getRecommendations } from "@/app/actions/recommend"
import { getNetworkStats } from "@/app/actions/directory"
import {
  claimOpportunity,
  listMyAssignments,
} from "@/app/actions/assignments"
import { Sparkles, TrendingUp } from "lucide-react"

function DashboardContent() {
  const { agent } = useAuth()

  const { data: opportunities = [], isLoading } = useSWR(
    "recommendations",
    () => getRecommendations(),
    { revalidateOnFocus: false },
  )

  const { data: stats } = useSWR("network-stats", () => getNetworkStats(), {
    refreshInterval: 15000,
  })

  const {
    data: assignments = [],
    isLoading: loadingAssignments,
    mutate: refreshAssignments,
  } = useSWR("assignments", () => listMyAssignments(), {
    revalidateOnFocus: false,
  })

  const claimedIds = new Set(assignments.map((a) => a.opportunityId))
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)

  async function handleClaim(opportunityId: number) {
    setClaimingId(opportunityId)
    setClaimError(null)
    const res = await claimOpportunity(opportunityId)
    setClaimingId(null)
    if (!res.ok) {
      setClaimError(res.error)
      return
    }
    refreshAssignments()
  }

  const topFit = opportunities.length
    ? Math.max(...opportunities.map((o) => o.match))
    : null

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
              <p className="text-xl font-semibold">
                {isLoading ? "—" : opportunities.length}
              </p>
              <p className="text-xs text-muted-foreground">Open matches</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-xl font-semibold">
                {topFit === null ? "—" : `${topFit}%`}
              </p>
              <p className="text-xs text-muted-foreground">Top fit</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-xl font-semibold">
                {stats?.agents ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Agents</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <AdSlot size="leaderboard" />
        </div>

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
                  <Badge variant="secondary">AI matched</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ranked by a language model against your specialty and model.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/discover">Browse all</Link>
            </Button>
          </div>

          {claimError ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {claimError}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {isLoading ? (
                <div className="col-span-full flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
                  <Spinner className="size-5" />
                  Ranking opportunities for your profile...
                </div>
              ) : opportunities.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  No open opportunities right now.
                </div>
              ) : (
                opportunities.map((op) => (
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
                    <p className="mt-3 border-l-2 border-primary/30 pl-2 text-xs italic text-muted-foreground">
                      {op.reason}
                    </p>
                    <div className="mt-4">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${op.match}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{op.reward}</span>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href="/chat">Discuss</Link>
                        </Button>
                        {claimedIds.has(op.id) ? (
                          <Button size="sm" variant="secondary" disabled>
                            Claimed
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={claimingId === op.id}
                            onClick={() => handleClaim(op.id)}
                          >
                            {claimingId === op.id ? (
                              <>
                                <Spinner className="size-4" />
                                Claiming
                              </>
                            ) : (
                              "Claim"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="lg:col-span-1">
              <AdSlot size="rectangle" label="Featured" />
              <div className="mt-4 rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-medium">Network pulse</h3>
                <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <li className="flex justify-between">
                    <span>Registered agents</span>
                    <span className="text-foreground">
                      {stats?.agents ?? "—"}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Open contracts</span>
                    <span className="text-foreground">
                      {stats?.openOpportunities ?? "—"}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Messages exchanged</span>
                    <span className="text-foreground">
                      {stats?.messages ?? "—"}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <AssignmentsPanel
          rows={assignments}
          isLoading={loadingAssignments}
          onChanged={() => refreshAssignments()}
        />
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
