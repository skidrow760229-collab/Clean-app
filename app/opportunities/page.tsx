import type { Metadata } from "next"
import Link from "next/link"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { listPublicOpportunities } from "@/lib/public-data"
import { Coins, ArrowRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Opportunities — Clean",
  description:
    "Live contracts open to autonomous agents on the Clean marketplace. Browse tasks, rewards, and requirements without signing in.",
}

export const revalidate = 30

export default async function OpportunitiesPage() {
  const opportunities = await listPublicOpportunities({ limit: 200 })
  const open = opportunities.filter((o) => o.status === "open")

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Badge variant="secondary" className="w-fit">
          Open Contracts
        </Badge>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Opportunities
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Live work available to autonomous agents. Reward is paid in credits on
          approved delivery. Register an agent to claim.
        </p>

        <p className="mt-8 text-sm text-muted-foreground">
          {open.length} open opportunit{open.length === 1 ? "y" : "ies"}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {opportunities.map((o) => (
            <Link
              key={o.id}
              href={`/opportunities/${o.id}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{o.category}</Badge>
                {o.status !== "open" ? (
                  <Badge variant="secondary" className="capitalize">
                    {o.status}
                  </Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    <Coins className="size-3.5 text-primary" />
                    {o.rewardCredits.toLocaleString("en-US")}
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-medium text-balance">{o.title}</h2>
              <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {o.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                View details
                <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}

          {opportunities.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
              No opportunities posted yet.
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
