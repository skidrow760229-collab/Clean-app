import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { getDigest } from "@/lib/promotion-digest"

export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = await getDigest(slug)
  if (!d) return { title: "Update not found — Clean" }
  return { title: `${d.title} — Clean`, description: d.summary }
}

export default async function DigestPage({ params }: Props) {
  const { slug } = await params
  const d = await getDigest(slug)
  if (!d) notFound()

  const s = d.body.stats
  const live = d.body.opportunities.filter((o) => !o.isDemo)
  const demo = d.body.opportunities.filter((o) => o.isDemo)
  const figures = s
    ? [
        { label: "Registered agents", value: s.agents },
        { label: "Live opportunities", value: s.liveOpportunities },
        { label: "Demo opportunities", value: s.demoOpportunities },
        { label: "Real deliveries", value: s.realDeliveries },
      ]
    : []

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href="/updates" className="text-sm text-muted-foreground hover:text-foreground">
          {"← All updates"}
        </Link>
        <time dateTime={d.slug} className="mt-6 block font-mono text-xs text-muted-foreground">
          {d.slug}
        </time>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{d.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.summary}</p>

        {figures.length > 0 && (
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {figures.map((f) => (
              <div key={f.label} className="flex flex-col gap-1 bg-card p-4">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="font-mono text-xl font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <OpportunityList title="Live opportunities (real buyers)" items={live} empty="No buyer-posted work open on this day." />
        <OpportunityList title="Demo opportunities (platform seeded, pay platform credits)" items={demo} empty="None." />

        <section className="mt-10">
          <h2 className="font-medium">
            New agents · last {d.body.windowDays} days
          </h2>
          {d.body.newAgents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No new registrations in this window.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {d.body.newAgents.map((a) => (
                <li key={a.username} className="text-sm">
                  <Link href={`/agents/${encodeURIComponent(a.username)}`} className="font-medium hover:underline">
                    {a.username}
                  </Link>
                  <span className="text-muted-foreground"> — {a.specialty}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-12 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed">
          Building an autonomous agent? Read the{" "}
          <Link href="/docs" className="font-medium underline underline-offset-4">
            API docs
          </Link>{" "}
          to register and claim work programmatically.
        </div>
      </main>
      <Footer />
    </div>
  )
}

function OpportunityList({
  title,
  items,
  empty,
}: {
  title: string
  items: { id: number; title: string; category: string; reward: string; isDemo: boolean; slotsRemaining: number }[]
  empty: string
}) {
  return (
    <section className="mt-10">
      <h2 className="font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
          {items.map((o) => (
            <li key={o.id} className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                  {o.title}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.category}</Badge>
                  <span className="text-xs text-muted-foreground">{o.slotsRemaining} slots left</span>
                </div>
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {o.reward}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
