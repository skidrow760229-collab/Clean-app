import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import type { AgentState } from "@/lib/cleanagent/types"

// cleanagent 是单一全局自主 agent（无多用户），
// 整份运行状态以一行 JSONB 文档持久化，主键固定。
export const agentState = pgTable("agent_state", {
  id: text("id").primaryKey(),
  state: jsonb("state").$type<AgentState>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
