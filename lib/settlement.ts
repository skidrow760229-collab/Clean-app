/**
 * Rules for agent-posted opportunities, whose payment happens off-platform.
 *
 * Clean never holds or moves money for this work. The poster states a price
 * (or "free") and how it will pay; poster and worker settle directly. Clean's
 * role is the record-keeper and referee: when the parties disagree about
 * whether the work was completed or whether payment is owed, either side's
 * evidence is put in front of Clean, which rules "payment_due" or "not_due".
 * Rulings are public and feed into the poster's payment record.
 *
 *   claimed ─submit─▶ submitted ─poster approve─▶ approved ─(off-platform pay)─▶ confirmed
 *                        │  └─poster reject─▶ rejected ─resubmit─▶ submitted
 *                        │                       └─dispute "rejection"─▶ disputed
 *                        └─(no review in 7 days) dispute "no_review"─▶ disputed
 *   approved (unpaid) ─dispute "non_payment"─▶ disputed
 *   disputed ─Clean rules─▶ payment_due: approved / awaiting_payment
 *                       └─▶ not_due:     closed (work) or not_due (payment)
 */

export const PRICING_MODELS = ["free", "fixed"] as const
export type PricingModel = (typeof PRICING_MODELS)[number] | "platform_credits"

export const DISPUTE_TYPES = ["rejection", "non_payment", "no_review"] as const
export type DisputeType = (typeof DISPUTE_TYPES)[number]

export const RULINGS = ["payment_due", "not_due"] as const
export type Ruling = (typeof RULINGS)[number]

export type SettlementStatus =
  | "none"
  | "awaiting_payment"
  | "paid_reported"
  | "confirmed"
  | "not_due"

/** A poster that hasn't reviewed a submission within this window can be disputed. */
export const REVIEW_WINDOW_HOURS = 168
export const RESPONSE_MIN = 10
export const RESPONSE_MAX = 1000
export const REFERENCE_MAX = 300

export type Pricing = {
  model: "free" | "fixed"
  amount: string | null
  currency: string | null
  settlementMethod: string | null
  settlementTerms: string | null
}

function cleanText(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/**
 * Validates the `pricing` object of a new opportunity. Free work needs no
 * settlement details; fixed-price work must say how much, in what, how and when.
 */
export function validatePricing(
  raw: unknown,
): { ok: true; pricing: Pricing } | { ok: false; issues: string[] } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: ["pricing is required: { model: 'free' | 'fixed', ... }"] }
  }
  const p = raw as Record<string, unknown>
  const model = p.model
  if (model !== "free" && model !== "fixed") {
    return { ok: false, issues: ["pricing.model must be 'free' or 'fixed'"] }
  }

  if (model === "free") {
    return {
      ok: true,
      pricing: {
        model,
        amount: null,
        currency: null,
        settlementMethod: null,
        settlementTerms: cleanText(p.settlement_terms, 300) || null,
      },
    }
  }

  const issues: string[] = []
  const amount = String(p.amount ?? "").trim()
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(amount) || Number(amount) <= 0) {
    issues.push("pricing.amount must be a positive decimal string, e.g. \"25\" or \"0.5\"")
  }
  const currency = cleanText(p.currency, 16).toUpperCase()
  if (!/^[A-Z0-9.\-]{2,16}$/.test(currency)) {
    issues.push("pricing.currency must be 2-16 letters/digits, e.g. USD, USDC, EUR, CNY")
  }
  const settlementMethod = cleanText(p.settlement_method, 300)
  if (settlementMethod.length < 3) {
    issues.push("pricing.settlement_method is required for fixed pricing, e.g. \"USDC on Base\"")
  }
  const settlementTerms = cleanText(p.settlement_terms, 300)
  if (settlementTerms.length < 3) {
    issues.push("pricing.settlement_terms is required for fixed pricing, e.g. \"within 3 days of approval\"")
  }
  if (issues.length) return { ok: false, issues }

  return {
    ok: true,
    pricing: {
      model,
      amount: amount.includes(".") ? amount.replace(/0+$/, "").replace(/\.$/, "") : amount,
      currency,
      settlementMethod,
      settlementTerms,
    },
  }
}

type PricedOpportunity = {
  pricingModel: string
  priceAmount: string | null
  priceCurrency: string | null
  rewardCredits: number
  isDemo: boolean
}

export function isAgentPosted(o: { posterUserId: string | null }) {
  return o.posterUserId != null
}

/** Short human label for the price, used on cards, pages and the API. */
export function priceLabel(o: PricedOpportunity) {
  if (o.pricingModel === "free") return "Free"
  if (o.pricingModel === "fixed") {
    const n = Number(o.priceAmount)
    const amount = Number.isFinite(n)
      ? n.toLocaleString("en-US", { maximumFractionDigits: 8 })
      : o.priceAmount
    return `${amount} ${o.priceCurrency}`
  }
  const credits = o.rewardCredits.toLocaleString("en-US")
  return o.isDemo ? `${credits} platform credits` : `${credits} credits`
}

/** Initial settlement state when a delivery is approved. */
export function settlementOnApproval(pricingModel: string): SettlementStatus {
  return pricingModel === "fixed" ? "awaiting_payment" : "none"
}

export function disputeHistory(raw: string | null | undefined): DisputeType[] {
  return (raw ?? "").split(",").filter(Boolean) as DisputeType[]
}

type AgentPostedRow = {
  status: string
  attempts: number
  submittedAt: Date | null
  settlementStatus: string | null
  disputeHistory: string
  disputeResponse: string | null
}

export function reviewWindowPassed(submittedAt: Date | null, now = Date.now()) {
  return submittedAt != null && now - submittedAt.getTime() > REVIEW_WINDOW_HOURS * 3600_000
}

/** Which dispute (if any) the worker may raise in the current state. */
export function eligibleDispute(
  a: AgentPostedRow,
  pricingModel: string,
): DisputeType | null {
  const raised = disputeHistory(a.disputeHistory)
  let type: DisputeType | null = null
  if (a.status === "rejected") type = "rejection"
  else if (a.status === "submitted" && reviewWindowPassed(a.submittedAt)) type = "no_review"
  else if (
    a.status === "approved" &&
    pricingModel === "fixed" &&
    (a.settlementStatus === "awaiting_payment" || a.settlementStatus === "paid_reported")
  ) {
    type = "non_payment"
  }
  return type && !raised.includes(type) ? type : null
}

export type WorkerAction =
  | "submit"
  | "resubmit"
  | "release"
  | "dispute"
  | "confirm_payment_received"

export type PosterAction = "approve" | "reject" | "respond_to_dispute" | "report_paid"

export function workerActions(
  a: AgentPostedRow & { effectiveStatus: string },
  pricingModel: string,
  attemptsRemaining: number,
): WorkerAction[] {
  const actions: WorkerAction[] = []
  const s = a.effectiveStatus
  if (s === "claimed") actions.push("submit", "release")
  if (s === "rejected") {
    if (attemptsRemaining > 0) actions.push("resubmit")
    actions.push("release")
  }
  if (
    s === "approved" &&
    (a.settlementStatus === "awaiting_payment" || a.settlementStatus === "paid_reported")
  ) {
    actions.push("confirm_payment_received")
  }
  if (s !== "expired" && eligibleDispute(a, pricingModel)) actions.push("dispute")
  return actions
}

export function posterActions(a: AgentPostedRow & { effectiveStatus: string }): PosterAction[] {
  const s = a.effectiveStatus
  if (s === "submitted") return ["approve", "reject"]
  if (s === "disputed" && !a.disputeResponse) return ["respond_to_dispute"]
  if (s === "approved" && a.settlementStatus === "awaiting_payment") return ["report_paid"]
  return []
}

/**
 * Outcome of a Clean ruling, as the fields to write on the assignment.
 * "payment_due" means the work counts as accepted and the stated price is owed;
 * "not_due" means the rejection stands, or no further payment is owed.
 */
export function applyRuling(
  type: DisputeType,
  ruling: Ruling,
  pricingModel: string,
): { status: string; settlementStatus: SettlementStatus | null } {
  if (ruling === "payment_due") {
    return { status: "approved", settlementStatus: settlementOnApproval(pricingModel) }
  }
  if (type === "non_payment") return { status: "approved", settlementStatus: "not_due" }
  return { status: "closed", settlementStatus: null }
}
