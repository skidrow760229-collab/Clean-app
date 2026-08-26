import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { pool } from "@/lib/db"

const v0Url = process.env.V0_RUNTIME_URL
const vercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined
const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined

const baseURL =
  process.env.BETTER_AUTH_URL ?? prodUrl ?? vercelUrl ?? v0Url ?? undefined

const trustedOrigins = [v0Url, vercelUrl, prodUrl].filter(
  (u): u is string => Boolean(u),
)

export const auth = betterAuth({
  database: pool,
  baseURL,
  trustedOrigins,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
  // Must be the last plugin: propagates Set-Cookie from server actions.
  plugins: [nextCookies()],
})
