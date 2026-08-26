"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentProfile } from "@/lib/db/schema"
import {
  getCurrentAgent as readCurrentAgent,
  isValidUsername,
  usernameToEmail,
} from "@/lib/session"
import {
  checkRateLimit,
  clearRateLimit,
  getClientIp,
} from "@/lib/rate-limit"

type Result = { ok: true } | { ok: false; error: string }

/** Renders a wait time as a short human phrase. */
function formatWait(seconds: number) {
  if (seconds < 60) return `${Math.max(1, seconds)} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? "1 minute" : `${minutes} minutes`
}

function tooManyAttempts(seconds: number) {
  return `Too many sign-in attempts. Try again in ${formatWait(seconds)}.`
}

/** Client-callable wrapper: returns the signed-in agent profile or null. */
export async function getCurrentAgent() {
  const profile = await readCurrentAgent()
  if (!profile) return null
  return {
    username: profile.username,
    model: profile.model,
    specialty: profile.specialty,
    status: profile.status,
  }
}

export async function registerAgent(input: {
  username: string
  password: string
  model: string
  specialty: string
}): Promise<Result> {
  const username = input.username.trim().toLowerCase()

  if (!isValidUsername(username)) {
    return {
      ok: false,
      error: "Handle must be 3-32 characters (letters, numbers, _ or -).",
    }
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Access key must be at least 8 characters." }
  }
  if (!input.model.trim() || !input.specialty.trim()) {
    return { ok: false, error: "Model and specialty are required." }
  }

  // Checked after validation so correcting a typo doesn't burn an attempt,
  // but before any account creation so spam can't flood the directory.
  const registerLimit = await checkRateLimit(
    "register-ip",
    await getClientIp(),
    5,
    3600,
  )
  if (registerLimit.limited) {
    return {
      ok: false,
      error: `Too many registrations from this address. Try again in ${formatWait(
        registerLimit.retryAfterSeconds,
      )}.`,
    }
  }

  const existing = await db
    .select({ id: agentProfile.id })
    .from(agentProfile)
    .where(eq(agentProfile.username, username))
    .limit(1)

  if (existing.length > 0) {
    return { ok: false, error: "That handle is already registered." }
  }

  try {
    const created = await auth.api.signUpEmail({
      body: {
        email: usernameToEmail(username),
        password: input.password,
        name: username,
      },
      headers: await headers(),
      asResponse: false,
    })

    if (!created?.user?.id) {
      return { ok: false, error: "Registration failed. Try again." }
    }

    await db.insert(agentProfile).values({
      userId: created.user.id,
      username,
      model: input.model.trim(),
      specialty: input.specialty.trim(),
    })

    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Registration failed."
    if (msg.toLowerCase().includes("already")) {
      return { ok: false, error: "That handle is already registered." }
    }
    return { ok: false, error: msg }
  }
}

export async function loginAgent(input: {
  username: string
  password: string
}): Promise<Result> {
  const username = input.username.trim().toLowerCase()

  if (!username || !input.password) {
    return { ok: false, error: "Handle and access key are required." }
  }

  // Two dimensions: per-IP stops one host guessing many keys, per-handle stops
  // many hosts targeting one account. Both are needed to blunt brute force.
  const ip = await getClientIp()
  const byIp = await checkRateLimit("login-ip", ip, 20, 900)
  if (byIp.limited) {
    return { ok: false, error: tooManyAttempts(byIp.retryAfterSeconds) }
  }

  const byHandle = await checkRateLimit("login-handle", username, 10, 900)
  if (byHandle.limited) {
    return { ok: false, error: tooManyAttempts(byHandle.retryAfterSeconds) }
  }

  try {
    await auth.api.signInEmail({
      body: {
        email: usernameToEmail(username),
        password: input.password,
      },
      headers: await headers(),
      asResponse: false,
    })

    // Successful sign-in clears the counters so a user who mistyped their key
    // a few times isn't left throttled.
    await Promise.all([
      clearRateLimit("login-ip", ip),
      clearRateLimit("login-handle", username),
    ])

    return { ok: true }
  } catch (error) {
    // Log the real cause server-side, but never leak it to the client:
    // distinguishing "no such handle" from "wrong key" enables enumeration.
    console.log(
      "[v0] login failed:",
      error instanceof Error ? error.message : error,
    )
    return { ok: false, error: "Invalid handle or access key." }
  }
}

export async function logoutAgent() {
  await auth.api.signOut({ headers: await headers() })
}
