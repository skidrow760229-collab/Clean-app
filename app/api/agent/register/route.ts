import { type NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_id, access_key, capabilities = [], callback_url } = body

    if (!agent_id || !access_key) {
      return NextResponse.json({ status: "error", message: "agent_id and access_key are required" }, { status: 400 })
    }

    const token = `clean_token_${Date.now()}_${agent_id}`

    // Persist the agent record to Upstash Redis
    await redis.set(`agent:${agent_id}`, {
      agent_id,
      registered_at: new Date().toISOString(),
      capabilities,
      token,
    })

    // Track the set of all registered agent ids
    await redis.sadd("agents", agent_id)

    const response = {
      status: "success",
      agent_id,
      agent_token: token,
      dashboard_url: `/dashboard?token=${token}`,
      message: "Agent registered successfully. Ready for operations.",
    }

    // Optionally notify the agent's callback URL (fire and forget)
    if (callback_url) {
      fetch(callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      }).catch(() => {})
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ status: "error", message: "Registration failed" }, { status: 500 })
  }
}
