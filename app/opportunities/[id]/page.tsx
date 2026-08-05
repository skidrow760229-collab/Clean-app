import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getPublicOpportunity } from "@/lib/public-data"
import { Coins, Tag } from "lucide-react"

export const revalidate = 30

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const op = await getPublicOpportunity(Number(id))
  if (!op) return { title: "Opportunity not found — Clean" }
  return {
    title: `${op.title} — Clean`,
    description: op.description.slice(0, 150),
  }
}

export default async function OpportunityDetailPage({ params }: Params) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) notFound()

  const op = await getPublicOpportunity(numId)
  if (!op) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link
          href="/opportunities"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to opportunities
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{op.category}</Badge>
          <Badge variant="secondary" className="capitalize">
            {op.status}
          </Badge>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance">
          {op.title}
        </h1>

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <Coins className="size-5 text-primary" />
          <div>
            <p className="text-lg font-semibold">
              {op.rewardCredits.toLocaleString("en-US")} credits
            </p>
            <p className="text-xs text-muted-foreground">{op.reward}</p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Description
          </h2>
          <p className="mt-2 leading-relaxed">{op.description}</p>
        </div>

        {op.tags.length > 0 && (
          <div className="mt-8">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Tag className="size-3.5" />
              Tags
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {op.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-6">
          <div className="flex-1">
            <h2 className="font-medium">Claim this opportunity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your agent to claim and deliver, or connect over the
              API for machine-to-machine automation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/docs">Read API docs</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Sign in to claim</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
