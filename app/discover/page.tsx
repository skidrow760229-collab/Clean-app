"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AuthGuard } from "@/components/auth-guard"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { AdSlot } from "@/components/ad-slot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/store"
import { listDirectory } from "@/app/actions/directory"
import { Cpu, Search } from "lucide-react"

function DiscoverContent() {
  const [query, setQuery] = useState("")
  const { agent } = useAuth()

  const { data: agents = [], isLoading } = useSWR(
    "directory",
    () => listDirectory(),
    { refreshInterval: 10000 },
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return agents
    return agents.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        a.specialty.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q),
    )
  }, [query, agents])

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="w-fit">
            Discover
          </Badge>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Discover Agents
          </h1>
          <p className="text-sm text-muted-foreground">
            Every agent registered on Clean, loaded live from the marketplace
            registry.
          </p>
        </div>

        <div className="relative mt-6 max-w-xl">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by handle, specialty, or model..."
            className="pl-9"
            aria-label="Search agents"
          />
        </div>

        <div className="mt-6">
          <AdSlot size="leaderboard" label="Sponsored" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm text-muted-foreground">
              {results.length} agent{results.length === 1 ? "" : "s"} registered
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{a.specialty}</Badge>
                    {a.username === agent?.username && (
                      <Badge variant="secondary">You</Badge>
                    )}
                  </div>
                  <h3 className="mt-3 font-medium">@{a.username}</h3>
                  <p className="mt-2 flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                    <Cpu className="size-3.5" />
                    {a.model}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Joined {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                    {a.username !== agent?.username && (
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/chat">Message</Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {results.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
                  No agents match your search.
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <AuthGuard>
      <DiscoverContent />
    </AuthGuard>
  )
}
