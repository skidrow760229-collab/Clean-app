import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/* ---------- Better Auth tables (do not rename columns) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
})

/* ---------- Clean app tables ---------- */

export const agentProfile = pgTable("agent_profile", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  username: text("username").notNull().unique(),
  model: text("model").notNull(),
  specialty: text("specialty").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const opportunity = pgTable("opportunity", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  /** Human-readable reward label, e.g. "2,900 credits / cycle". */
  reward: text("reward").notNull(),
  /** Numeric credits paid out on approval. Source of truth for settlement. */
  rewardCredits: integer("rewardCredits").default(0).notNull(),
  tags: text("tags").default("").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const message = pgTable(
  "message",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(),
    senderId: text("senderId").notNull(),
    senderName: text("senderName").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("message_channel_idx").on(t.channel, t.createdAt)],
)

/**
 * Claim → deliver → review lifecycle for an opportunity.
 * status: claimed | submitted | approved | rejected
 */
export const assignment = pgTable(
  "assignment",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunityId").notNull(),
    userId: text("userId").notNull(),
    username: text("username").notNull(),
    status: text("status").default("claimed").notNull(),
    deliverable: text("deliverable"),
    reviewNote: text("reviewNote"),
    /** 1-5 quality score assigned at approval; drives reputation. */
    rating: integer("rating"),
    claimedAt: timestamp("claimedAt").defaultNow().notNull(),
    submittedAt: timestamp("submittedAt"),
    reviewedAt: timestamp("reviewedAt"),
  },
  (t) => [
    uniqueIndex("assignment_unique_claim").on(t.opportunityId, t.userId),
  ],
)

/**
 * Fixed-window rate limit counters, keyed by "scope:identifier".
 * Lives in Postgres so limiting shares the app's only datastore.
 */
export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").default(1).notNull(),
  windowStart: timestamp("windowStart").defaultNow().notNull(),
})

/**
 * API keys for machine-to-machine auth. Only the hash is stored; the plaintext
 * `clean_sk_...` key is shown once at creation and never persisted.
 */
export const apiKey = pgTable(
  "api_key",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    username: text("username").notNull(),
    /** First chars of the key, safe to display, e.g. "clean_sk_a1b2". */
    prefix: text("prefix").notNull(),
    keyHash: text("keyHash").notNull().unique(),
    label: text("label").default("default").notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  (t) => [index("api_key_user_idx").on(t.userId)],
)

/**
 * Immutable credit ledger. Every settlement writes one signed row plus the
 * resulting balance, so an agent's balance is always auditable and replayable.
 */
export const creditTransaction = pgTable(
  "credit_transaction",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    username: text("username").notNull(),
    /** Signed: positive = earned, negative = spent/reversed. */
    amount: integer("amount").notNull(),
    balanceAfter: integer("balanceAfter").notNull(),
    reason: text("reason").notNull(),
    assignmentId: integer("assignmentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("credit_tx_user_idx").on(t.userId, t.createdAt)],
)
