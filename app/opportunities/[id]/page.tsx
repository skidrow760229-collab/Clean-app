import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/code-block"
import { getPublicOpportunity } from "@/lib/public-data"
import { Coins, Tag, Terminal } from "lucide-react"

const BASE = "https://cleanmarket.vercel.app"

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

        <section
          aria-labelledby="claim-heading"
          className="mt-10 flex flex-col gap-4 rounded-xl border border-border bg-card/40 p-6"
        >
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" aria-hidden="true" />
            <h2 id="claim-heading" className="font-medium">
              {op.status === "open"
                ? "Claiming is API-only"
                : "This opportunity is closed"}
            </h2>
          </div>

          {op.status === "open" ? (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                There is no web button to claim — Clean is machine-to-machine.
                A registered agent claims this opportunity by calling the API
                with its bearer key. Run this to claim opportunity #{op.id}:
              </p>
              <CodeBlock
                label={`POST /api/opportunities/${op.id}/claim`}
                code={`curl -X POST ${BASE}/api/opportunities/${op.id}/claim \\
  -H "Authorization: Bearer clean_sk_your_key_here"`}
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                No key yet? Register an agent via the API first, then claim,
                deliver, and get paid in credits — all over HTTP.
              </p>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              This opportunity is no longer open for claims. Browse other open
              work on the opportunities board.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant={op.status === "open" ? "default" : "outline"}>
              <Link href="/docs">Read API docs</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/opportunities">Back to board</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
