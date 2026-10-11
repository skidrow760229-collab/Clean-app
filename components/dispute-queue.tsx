"use client"

import { useState } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { listDisputes, ruleDispute } from "@/app/actions/admin"

const TYPE_LABEL: Record<string, string> = {
  rejection: "Rejected work",
  no_review: "No review in 7 days",
  non_payment: "Approved but unpaid",
}

const QUESTION: Record<string, string> = {
  rejection: "Does the delivery meet the acceptance criteria?",
  no_review: "Does the delivery meet the acceptance criteria? (poster never reviewed)",
  non_payment: "Has the poster paid as agreed?",
}

export function DisputeQueue() {
  const { data: rows, isLoading, mutate } = useSWR("admin-disputes", () => listDisputes(), {
    revalidateOnFocus: false,
  })
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function rule(id: number, ruling: "payment_due" | "not_due") {
    setBusyId(id)
    setError(null)
    const res = await ruleDispute(id, ruling, notes[id] ?? "")
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
        <h2 className="text-lg font-medium">Settlement disputes</h2>
        <Badge variant="secondary">{rows?.length ?? 0} open</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Agent-posted work paid off-platform. Clean does not move money — rule whether payment is
        owed. Rulings are public and count toward the poster&apos;s payment record.
      </p>

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
          No open settlement disputes.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">{TYPE_LABEL[row.type] ?? row.type}</Badge>
                <span className="text-sm">
                  <span className="text-muted-foreground">poster</span> @{row.poster}
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">worker</span> @{row.worker}
                </span>
              </div>
              <h3 className="mt-2 font-medium leading-snug">{row.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.price}
                {row.settlementMethod ? ` · ${row.settlementMethod}` : ""}
                {row.settlementTerms ? ` · ${row.settlementTerms}` : ""}
              </p>

              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acceptance criteria
                  </dt>
                  <dd>
                    <ul className="list-disc pl-5">
                      {row.acceptanceCriteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Delivery
                  </dt>
                  <dd className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-secondary/50 p-3">
                    {row.deliverable ?? "—"}
                  </dd>
                </div>
                {row.reviewNote ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Poster&apos;s rejection note
                    </dt>
                    <dd>{row.reviewNote}</dd>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Worker&apos;s claim
                  </dt>
                  <dd>{row.reason}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Poster&apos;s response
                  </dt>
                  <dd className={row.posterResponse ? "" : "text-muted-foreground"}>
                    {row.posterResponse ?? "No response yet"}
                  </dd>
                </div>
                {row.paymentReference ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Reported payment reference
                    </dt>
                    <dd className="font-mono break-all">{row.paymentReference}</dd>
                  </div>
                ) : null}
              </dl>

              <p className="mt-4 text-sm font-medium">{QUESTION[row.type]}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Input
                  aria-label={`Ruling note for ${row.title}`}
                  placeholder="Reasoning shown to both parties (required)"
                  className="max-w-md"
                  value={notes[row.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                />
                <Button size="sm" disabled={busyId === row.id} onClick={() => rule(row.id, "payment_due")}>
                  Payment due
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => rule(row.id, "not_due")}
                >
                  Not due
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
