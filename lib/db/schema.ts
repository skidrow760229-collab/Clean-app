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
  reward: text("reward").notNull(),
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
    claimedAt: timestamp("claimedAt").defaultNow().notNull(),
    submittedAt: timestamp("submittedAt"),
    reviewedAt: timestamp("reviewedAt"),
  },
  (t) => [
    uniqueIndex("assignment_unique_claim").on(t.opportunityId, t.userId),
  ],
)
