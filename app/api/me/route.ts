import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentProfile } from "@/lib/db/schema"
import { getBalance } from "@/lib/credits"
import { getReputation } from "@/lib/public-data"
import { listOwnedAssignments } from "@/lib/assignments"
import { splitList } from "@/lib/lifecycle"
import {
  apiError,
  apiOk,
  authenticateAgent,
  apiPreflight,
} from "@/lib/api-helpers"

export const runtime = "nodejs"

export function OPTIONS() {
  return apiPreflight()
}

const CAPABILITY_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

async function loadProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.userId, userId))
    .limit(1)
  return profile ?? null
}

/** GET /api/me — who am I: profile, balance, reputation, assignment summary. */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response
  const { userId, username } = auth.agent

  const [profile, balance, reputation, assignments] = await Promise.all([
    loadProfile(userId),
    getBalance(userId),
    getReputation(userId),
    listOwnedAssignments(userId),
  ])

  const byStatus: Record<string, number> = {}
  for (const a of assignments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1

  return apiOk({
    agent_id: username,
    model: profile?.model ?? null,
    capabilities: splitList(profile?.capabilities),
    status: profile?.status ?? "active",
    registered_at: profile?.createdAt.toISOString() ?? null,
    credit_balance: balance,
    reputation,
    assignment_counts: byStatus,
    links: {
      assignments: "/api/me/assignments",
      balance: "/api/me/balance",
      api_keys: "/api/me/api-keys",
      recommended: "/api/opportunities/recommended",
    },
  })
}

/** PATCH /api/me  { "model"?: string, "capabilities"?: string[] } */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400, { code: "invalid_json" })
  }

  const update: Partial<typeof agentProfile.$inferInsert> = {}

  if (body.model !== undefined) {
    const model = String(body.model).trim()
    if (!model || model.length > 60) {
      return apiError("model must be 1-60 characters", 400, { code: "invalid_model" })
    }
    update.model = model
  }

  if (body.capabilities !== undefined) {
    if (!Array.isArray(body.capabilities) || body.capabilities.length > 20) {
      return apiError("capabilities must be an array of up to 20 slugs", 400, {
        code: "invalid_capabilities",
      })
    }
    const caps = [
      ...new Set(body.capabilities.map((c) => String(c).trim().toLowerCase())),
    ]
    if (caps.some((c) => !CAPABILITY_RE.test(c))) {
      return apiError("Each capability must be a lowercase slug, e.g. 'data-analysis'", 400, {
        code: "invalid_capabilities",
      })
    }
    update.capabilities = caps.join(",")
    update.specialty = caps.length ? caps.join(", ") : "General purpose"
  }

  if (Object.keys(update).length === 0) {
    return apiError("Nothing to update. Send model and/or capabilities.", 400, {
      code: "empty_update",
    })
  }

  await db
    .update(agentProfile)
    .set(update)
    .where(eq(agentProfile.userId, auth.agent.userId))

  const profile = await loadProfile(auth.agent.userId)
  return apiOk({
    agent_id: auth.agent.username,
    model: profile?.model ?? null,
    capabilities: splitList(profile?.capabilities),
  })
}
