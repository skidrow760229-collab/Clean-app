"use client"

import { useState } from "react"
import useSWR from "swr"
import { Copy, Check, KeyRound, Wallet, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getMyWallet,
  listMyKeys,
  createMyKey,
  revokeMyKey,
} from "@/app/actions/keys"

type IssuedKey = { id: number; prefix: string; key: string }

function formatCredits(n: number) {
  return new Intl.NumberFormat("en-US").format(n)
}

export function AgentAccountPanel() {
  const wallet = useSWR("my-wallet", getMyWallet)
  const keys = useSWR("my-keys", listMyKeys)

  const [label, setLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setCreating(true)
    setError(null)
    const res = await createMyKey(label.trim() || "default")
    setCreating(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setIssued({ id: res.id, prefix: res.prefix, key: res.key })
    setLabel("")
    keys.mutate()
  }

  async function revoke(id: number) {
    await revokeMyKey(id)
    keys.mutate()
  }

  async function copyKey() {
    if (!issued) return
    await navigator.clipboard.writeText(issued.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const balance = wallet.data?.balance ?? 0
  const txns = wallet.data?.transactions ?? []
  const keyList = keys.data ?? []

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {/* Wallet */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wallet className="size-4" />
          Credit balance
        </div>
        <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">
          {formatCredits(balance)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            credits
          </span>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">
            Recent ledger
          </div>
          {txns.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No transactions yet. Approved deliveries pay out here.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {txns.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-muted-foreground">
                    {t.reason}
                  </span>
                  <span
                    className={
                      t.amount >= 0
                        ? "font-mono tabular-nums text-primary"
                        : "font-mono tabular-nums text-destructive"
                    }
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {formatCredits(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* API keys */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <KeyRound className="size-4" />
          API keys
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Authenticate machine-to-machine calls with{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            Authorization: Bearer clean_sk_…
          </code>
        </p>

        {issued && (
          <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground">
              New key — copy it now, it is shown only once:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                {issued.key}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey}>
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Input
            aria-label="Key label"
            placeholder="Label (e.g. prod-worker)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button size="sm" onClick={create} disabled={creating}>
            <Plus className="size-3.5" />
            Create
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <ul className="mt-3 space-y-1.5">
          {keyList.length === 0 && (
            <li className="text-sm text-muted-foreground">No keys yet.</li>
          )}
          {keyList.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <code className="font-mono text-xs">{k.prefix}…</code>
                <span className="ml-2 text-muted-foreground">{k.label}</span>
                {k.revoked && (
                  <span className="ml-2 text-xs text-destructive">revoked</span>
                )}
              </div>
              {!k.revoked && (
                <button
                  type="button"
                  aria-label={`Revoke key ${k.prefix}`}
                  onClick={() => revoke(k.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
