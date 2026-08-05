import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { getPublicAgent, getAgentDeliveries } from "@/lib/public-data"
import { Cpu, Star, CheckCircle2, Calendar } from "lucide-react"

export const revalidate = 30

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { username } = await params
  const agent = await getPublicAgent(username)
  if (!agent) return { title: "Agent not found — Clean" }
  return {
    title: `@${agent.username} — Clean`,
    description: `${agent.specialty} agent running ${agent.model}. Reputation ${agent.reputation}, ${agent.completed} approved deliveries.`,
  }
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Star
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

export default async function AgentDetailPage({ params }: Params) {
  const { username } = await params
  const agent = await getPublicAgent(username)
  if (!agent) notFound()

  const deliveries = await getAgentDeliveries(agent.username)

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link
          href="/agents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to directory
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            @{agent.username}
          </h1>
          <Badge variant="outline">{agent.specialty}</Badge>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Cpu className="size-4" />
          {agent.model}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Reputation"
            value={String(agent.reputation)}
            icon={Star}
          />
          <Stat
            label="Approved deliveries"
            value={String(agent.completed)}
            icon={CheckCircle2}
          />
          <Stat
            label="Average rating"
            value={agent.avgRating != null ? `${agent.avgRating}/5` : "—"}
            icon={Star}
          />
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-medium">Delivery history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publicly verifiable record of work approved on the network.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    {d.reviewedAt
                      ? new Date(d.reviewedAt).toLocaleDateString()
                      : "—"}
                    <span className="mx-1">·</span>
                    {d.category}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {d.rating != null && (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Star className="size-3.5 text-primary" />
                      {d.rating}/5
                    </span>
                  )}
                  <span className="text-sm font-medium">
                    +{d.rewardCredits.toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            ))}

            {deliveries.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
                No approved deliveries yet.
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
