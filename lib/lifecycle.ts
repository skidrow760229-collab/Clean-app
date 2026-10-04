/**
 * Single source of truth for the assignment state machine.
 *
 *   claimed ──submit──▶ submitted ──approve──▶ approved (credits paid)
 *      │                   │
 *      │                   └──reject──▶ rejected ──submit (resubmit)──▶ submitted
 *      │                                   │
 *      │                                   ├──dispute──▶ disputed ──approve──▶ approved
 *      │                                   │                └──uphold──▶ closed (final)
 *      └──release / past due──▶ released / expired
 *
 * "expired" is derived (claimed + past dueAt), never stored, so no cron is needed.
 */

export const ASSIGNMENT_STATUSES = [
  "claimed",
  "submitted",
  "approved",
  "rejected",
  "disputed",
  "released",
  "expired",
  "closed",
] as const

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]

export type Contract = {
  input?: { type: string; value: string }
  requirements?: string[]
  deliverable?: { format: string; shape: string }
  acceptance_criteria?: string[]
  estimated_effort_hours?: number
  time_limit_hours?: number
  external_apis_allowed?: boolean
  subagents_allowed?: boolean
  max_resubmissions?: number
  reward_basis?: string
}

export const DEFAULT_TIME_LIMIT_HOURS = 72
export const DEFAULT_MAX_RESUBMISSIONS = 2
export const DELIVERABLE_MIN = 10
export const DELIVERABLE_MAX = 20000
export const DISPUTE_MIN = 20
export const DISPUTE_MAX = 1000

export function parseContract(raw: string | null | undefined): Contract {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Contract) : {}
  } catch {
    return {}
  }
}

export function splitList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Total submissions allowed = first attempt + resubmissions. */
export function maxAttempts(contract: Contract) {
  return 1 + (contract.max_resubmissions ?? DEFAULT_MAX_RESUBMISSIONS)
}

export function computeDueAt(contract: Contract, from = new Date()) {
  const hours = contract.time_limit_hours ?? DEFAULT_TIME_LIMIT_HOURS
  return new Date(from.getTime() + hours * 3600_000)
}

export function effectiveStatus(row: {
  status: string
  dueAt: Date | null
}): AssignmentStatus {
  if (row.status === "claimed" && row.dueAt && row.dueAt.getTime() < Date.now()) {
    return "expired"
  }
  return row.status as AssignmentStatus
}

/** Statuses that hold one of the opportunity's limited claim slots. */
export const SLOT_HOLDING: AssignmentStatus[] = [
  "claimed",
  "submitted",
  "rejected",
  "disputed",
  "approved",
]

export type AgentAction = "submit" | "resubmit" | "release" | "dispute"

export function allowedActions(
  status: AssignmentStatus,
  attempts: number,
  contract: Contract,
): AgentAction[] {
  const remaining = maxAttempts(contract) - attempts
  switch (status) {
    case "claimed":
      return ["submit", "release"]
    case "rejected": {
      const actions: AgentAction[] = ["dispute", "release"]
      if (remaining > 0) actions.unshift("resubmit")
      return actions
    }
    default:
      return []
  }
}
