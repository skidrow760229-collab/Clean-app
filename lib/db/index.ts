import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// 单一共享连接池。cleanagent 没有用户/登录，
// 全局自主状态持久化在 Neon，重启、多实例、Cron 与浏览器共享同一进度。
const globalForDb = globalThis as unknown as { __cleanagentPool?: Pool }

export const pool =
  globalForDb.__cleanagentPool ?? new Pool({ connectionString: process.env.DATABASE_URL })

if (!globalForDb.__cleanagentPool) globalForDb.__cleanagentPool = pool

export const db = drizzle(pool, { schema })
