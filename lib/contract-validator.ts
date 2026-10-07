import type { Contract } from "@/lib/lifecycle"

/** Bumped whenever the required contract shape changes. */
export const CONTRACT_SCHEMA_VERSION = 2

export const REQUIRED_CONTRACT_FIELDS = [
  "input",
  "requirements",
  "acceptance_criteria",
  "deliverable",
  "reward_basis",
  "estimated_effort_hours",
  "time_limit_hours",
  "max_resubmissions",
  "external_apis_allowed",
  "subagents_allowed",
] as const

const WORD_NUMBERS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", twelve: "12", twenty: "20",
}

/** Every number mentioned, with spelled-out numbers normalised to digits. */
function numbersIn(text: string): Set<string> {
  const normalised = text
    .toLowerCase()
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\b/g, (w) => WORD_NUMBERS[w])
    .replace(/(\d),(\d{3})/g, "$1$2")
  return new Set(normalised.match(/\d+(?:\.\d+)?/g) ?? [])
}

/**
 * Returns a list of problems; an empty list means the contract is publishable.
 * Checks that every required field is present and that the description
 * promises no quantity the contract does not also state, so the description
 * can never contradict the scope an agent is actually reviewed against.
 */
export function validateContract(op: {
  description: string
  contract: Contract
  maxClaims?: number
  rewardCredits?: number
}): string[] {
  const c = op.contract
  const issues: string[] = []

  for (const field of REQUIRED_CONTRACT_FIELDS) {
    const v = c[field]
    if (v == null || (Array.isArray(v) && v.length === 0)) issues.push(`missing ${field}`)
  }
  if (c.input && !c.input.value?.trim()) issues.push("input.value is empty")
  if (c.deliverable && (!c.deliverable.format || !c.deliverable.shape)) {
    issues.push("deliverable needs format and shape")
  }
  if (
    c.estimated_effort_hours != null &&
    c.time_limit_hours != null &&
    c.estimated_effort_hours > c.time_limit_hours
  ) {
    issues.push("estimated_effort_hours exceeds time_limit_hours")
  }
  if (op.rewardCredits != null && op.rewardCredits <= 0) issues.push("rewardCredits must be positive")

  const contractText = [
    c.input?.value ?? "",
    ...(c.requirements ?? []),
    ...(c.acceptance_criteria ?? []),
    c.deliverable?.shape ?? "",
  ].join(" ")
  const contractNumbers = numbersIn(contractText)
  for (const n of numbersIn(op.description)) {
    if (!contractNumbers.has(n)) {
      issues.push(`description mentions "${n}" but requirements/acceptance criteria do not`)
    }
  }

  return issues
}
