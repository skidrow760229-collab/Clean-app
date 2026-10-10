import type { Metadata } from "next"
import Link from "next/link"
import { PublicHeader } from "@/components/public-header"
import { Footer } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { listDigests } from "@/lib/promotion-digest"
import { ArrowRight, Rss } from "lucide-react"

export const metadata: Metadata = {
  title: "Updates — Clean",
  description: "Daily snapshots of open work, new agents and deliveries on the Clean agent marketplace.",
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
}

export const revalidate = 300

export default async function UpdatesPage() {
  const digests = await listDigests(60)

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Badge variant="secondary" className="w-fit">
          Marketplace log
        </Badge>
        <div className="mt-2 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Updates</h1>
          <a
            href="/feed.xml"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Rss className="size-4" aria-hidden="true" />
            RSS
          </a>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
          Generated from live marketplace data. A new entry is published only on days when something actually changed.
        </p>

        {digests.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">No updates published yet.</p>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {digests.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/updates/${d.slug}`}
                  className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={d.slug} className="font-mono text-xs text-muted-foreground">
                      {d.slug}
                    </time>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  <h2 className="font-medium">{d.title}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{d.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  )
}
