"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import {
  releaseAssignment,
  submitDeliverable,
  type AssignmentRow,
} from "@/app/actions/assignments"
import { CheckCircle2, Clock, Send, XCircle } from "lucide-react"

const STATUS_META: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  claimed: {
    label: "In progress",
    icon: Clock,
    className: "text-muted-foreground",
  },
  submitted: { label: "Under review", icon: Send, className: "text-primary" },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Changes requested",
    icon: XCircle,
    className: "text-destructive",
  },
}

export function AssignmentsPanel({
  rows,
  isLoading,
  onChanged,
}: {
  rows: AssignmentRow[]
  isLoading: boolean
  onChanged: () => void
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(id: number) {
    setBusyId(id)
    setError(null)
    const res = await submitDeliverable(id, draft)
    setBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpenId(null)
    setDraft("")
    onChanged()
  }

  async function handleRelease(id: number) {
    setBusyId(id)
    setError(null)
    const res = await releaseAssignment(id)
    setBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged()
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card/40 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">My Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Claim work, submit a deliverable, then wait for review.
          </p>
        </div>
        <Badge variant="secondary">{rows.length} active</Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
          <Spinner className="size-5" />
          Loading your tasks...
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          You haven&apos;t claimed any tasks yet. Claim one from Active
          Opportunities above to get started.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {rows.map((row) => {
            const meta = STATUS_META[row.status] ?? STATUS_META.claimed
            const StatusIcon = meta.icon
            const busy = busyId === row.id

            return (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{row.category}</Badge>
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${meta.className}`}
                      >
                        <StatusIcon className="size-3.5" />
                        {meta.label}
                      </span>
                    </div>
                    <h3 className="mt-2 font-medium leading-snug">
                      {row.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.reward}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {row.status !== "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setError(null)
                          setDraft(row.deliverable ?? "")
                          setOpenId(openId === row.id ? null : row.id)
                        }}
                      >
                        {row.status === "claimed" ? "Deliver" : "Revise"}
                      </Button>
                    ) : null}
                    {row.status !== "approved" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleRelease(row.id)}
                      >
                        Release
                      </Button>
                    ) : null}
                  </div>
                </div>

                {row.reviewNote ? (
                  <p className="mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Reviewer:
                    </span>{" "}
                    {row.reviewNote}
                  </p>
                ) : null}

                {row.status === "approved" && row.deliverable ? (
                  <p className="mt-3 whitespace-pre-wrap rounded-md bg-secondary/50 p-3 text-sm text-muted-foreground">
                    {row.deliverable}
                  </p>
                ) : null}

                {openId === row.id ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <label
                      htmlFor={`deliverable-${row.id}`}
                      className="text-sm font-medium"
                    >
                      Deliverable
                    </label>
                    <Textarea
                      id={`deliverable-${row.id}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={4}
                      placeholder="Summarise your output, or paste a link to the artifact..."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => handleSubmit(row.id)}
                      >
                        {busy ? (
                          <>
                            <Spinner className="size-4" />
                            Submitting
                          </>
                        ) : (
                          "Submit for review"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
