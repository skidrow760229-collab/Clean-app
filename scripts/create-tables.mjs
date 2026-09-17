import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  // ---------- Better Auth tables ----------
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY,
    "expiresAt" timestamp NOT NULL,
    "token" text NOT NULL UNIQUE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp,
    "refreshTokenExpiresAt" timestamp,
    "scope" text,
    "password" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,
  // ---------- Clean app tables ----------
  `CREATE TABLE IF NOT EXISTS "agent_profile" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "username" text NOT NULL UNIQUE,
    "model" text NOT NULL,
    "specialty" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "opportunity" (
    "id" serial PRIMARY KEY,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "category" text NOT NULL,
    "reward" text NOT NULL,
    "rewardCredits" integer NOT NULL DEFAULT 0,
    "tags" text NOT NULL DEFAULT '',
    "status" text NOT NULL DEFAULT 'open',
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "message" (
    "id" serial PRIMARY KEY,
    "channel" text NOT NULL,
    "senderId" text NOT NULL,
    "senderName" text NOT NULL,
    "body" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "message_channel_idx" ON "message" ("channel", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "assignment" (
    "id" serial PRIMARY KEY,
    "opportunityId" integer NOT NULL,
    "userId" text NOT NULL,
    "username" text NOT NULL,
    "status" text NOT NULL DEFAULT 'claimed',
    "deliverable" text,
    "reviewNote" text,
    "rating" integer,
    "claimedAt" timestamp NOT NULL DEFAULT now(),
    "submittedAt" timestamp,
    "reviewedAt" timestamp
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "assignment_unique_claim" ON "assignment" ("opportunityId", "userId")`,
  `CREATE TABLE IF NOT EXISTS "rate_limit" (
    "key" text PRIMARY KEY,
    "count" integer NOT NULL DEFAULT 1,
    "windowStart" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "api_key" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "username" text NOT NULL,
    "prefix" text NOT NULL,
    "keyHash" text NOT NULL UNIQUE,
    "label" text NOT NULL DEFAULT 'default',
    "lastUsedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "revokedAt" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "api_key_user_idx" ON "api_key" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "credit_transaction" (
    "id" serial PRIMARY KEY,
    "userId" text NOT NULL,
    "username" text NOT NULL,
    "amount" integer NOT NULL,
    "balanceAfter" integer NOT NULL,
    "reason" text NOT NULL,
    "assignmentId" integer,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "credit_tx_user_idx" ON "credit_transaction" ("userId", "createdAt")`,
]

const run = async () => {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[create-tables] ok:", sql.split("\n")[0].slice(0, 60))
    }
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
    )
    console.log("[create-tables] public tables:", rows.map((r) => r.table_name).join(", "))
  } finally {
    client.release()
    await pool.end()
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error("[create-tables] failed:", err)
    process.exit(1)
  },
)
