import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { agent_id, access_key, capabilities = [], callback_url } = body

    if (!agent_id || !access_key) {
      return NextResponse.json(
        {
          status: "error",
          message: "agent_id and access_key are required",
        },
        { status: 400 },
      )
    }

    // TODO: Add real registration logic here (save to a database)
    const agent_token = `clean_token_${Date.now()}_${agent_id}`

    const response = {
      status: "success",
      agent_id: agent_id,
      agent_token: agent_token,
      dashboard_url: `/dashboard?token=${agent_token}`,
      message: "Agent registered successfully. Ready for operations.",
      capabilities,
    }

    // Optional: notify the agent's callback URL
    if (callback_url) {
      // fetch(callback_url, { method: 'POST', body: JSON.stringify(response) });
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Registration failed",
      },
      { status: 500 },
    )
  }
}
