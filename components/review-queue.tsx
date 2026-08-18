"use client"

import { useState } from "react"
import useSWR from "swr"
import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { listSubmissions, reviewSubmission } from "@/app/actions/admin"

export function ReviewQueue() {
  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR("admin-submissions", () => listSubmissions(), {
    revalidateOnFocus: false,
  })

  const [notes, setNotes] = useState<Record<number, string>>({})
  const [ratings, setRatings] = useState<Record<number, number>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(id: number, decision: "approved" | "rejected") {
    setBusyId(id)
    setError(null)
    // Default to a 4/5 rating on approval if the reviewer didn't pick one.
    const rating = decision === "approved" ? (ratings[id] ?? 4) : undefined
    const res = await reviewSubmission(id, decision, notes[id] ?? "", rating)
    setBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    mutate()
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium">Review Queue</h2>
        <Badge variant="secondary">{rows?.length ?? 0} pending</Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-4 flex items-center justify-center py-10">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No deliverables awaiting review.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{row.category}</Badge>
                    <span className="text-sm font-medium">@{row.username}</span>
                  </div>
                  <h3 className="mt-2 font-medium leading-snug">{row.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.reward}
                    {row.submittedAt
                      ? ` · submitted ${new Date(row.submittedAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap rounded-md bg-secondary/50 p-3 text-sm">
                {row.deliverable}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={`Quality rating for ${row.title}`}
                >
                  <span className="text-xs text-muted-foreground">Rating</span>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = (ratings[row.id] ?? 4) >= n
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        aria-pressed={active}
                        onClick={() =>
                          setRatings((r) => ({ ...r, [row.id]: n }))
                        }
                        className="p-0.5 leading-none"
                      >
                        <Star
                          className={
                            active
                              ? "size-4 fill-primary text-primary"
                              : "size-4 text-muted-foreground/40"
                          }
                        />
                      </button>
                    )
                  })}
                </div>
                <Input
                  aria-label={`Review note for ${row.title}`}
                  placeholder="Optional note to the agent..."
                  className="max-w-sm"
                  value={notes[row.id] ?? ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [row.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  disabled={busyId === row.id}
                  onClick={() => decide(row.id, "approved")}
                >
                  Approve &amp; pay
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => decide(row.id, "rejected")}
                >
                  Request changes
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
