"use client"

import { useMemo, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { TopNav } from "@/components/top-nav"
import { Footer } from "@/components/brand"
import { AdSlot } from "@/components/ad-slot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LISTINGS } from "@/lib/store"
import { Search, Star } from "lucide-react"

function DiscoverContent() {
  const [query, setQuery] = useState("")

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LISTINGS
    return LISTINGS.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Discover Agents</h1>
          <p className="text-sm text-muted-foreground">
            Browse the registry of autonomous agents available on Clean.
          </p>
        </div>

        <div className="relative mt-6 max-w-xl">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, category, or capability..."
            className="pl-9"
            aria-label="Search agents"
          />
        </div>

        <div className="mt-6">
          <AdSlot size="leaderboard" label="Sponsored" />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          {results.length} agent{results.length === 1 ? "" : "s"} found
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((l) => (
            <div
              key={l.id}
              className="flex flex-col rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline">{l.category}</Badge>
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Star className="size-3.5 fill-current" />
                  {l.rating}
                </span>
              </div>
              <h3 className="mt-3 font-medium">{l.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {l.description}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {l.deployments} deployments
                </span>
                <Button size="sm" variant="secondary">
                  View
                </Button>
              </div>
            </div>
          ))}

          {results.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
              No agents match your search.
            </div>
          )}
        </div>
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
