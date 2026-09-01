import { pool } from "@/lib/db"

// 从共享数据库读取 Clean app 的真实成效数据。
// - 真实用户：neon_auth.user（Clean 的注册用户落表）
// - 真实交易：public.transactions（Clean 记录交易的规范落点）
// 这些是真实数据，不是模拟；在 Clean 尚未产生数据前会如实显示为 0。

export interface RealStats {
  realUsersTotal: number
  realUsersThisWeek: number
  realTransactionsTotal: number
  realTransactionsToday: number
  realVolumeUsd: number
  weekStartedAt: number
}

export async function getRealStats(weekStartedAt: number): Promise<RealStats> {
  const weekStartIso = new Date(weekStartedAt).toISOString()
  const todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

  try {
    const [users, tx] = await Promise.all([
      pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE "createdAt" >= $1)::int AS this_week
         FROM neon_auth."user"`,
        [weekStartIso],
      ),
      pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE created_at >= $1)::int AS today,
           COALESCE(sum(amount_usd), 0)::float AS volume
         FROM public.transactions`,
        [todayStartIso],
      ),
    ])

    return {
      realUsersTotal: users.rows[0]?.total ?? 0,
      realUsersThisWeek: users.rows[0]?.this_week ?? 0,
      realTransactionsTotal: tx.rows[0]?.total ?? 0,
      realTransactionsToday: tx.rows[0]?.today ?? 0,
      realVolumeUsd: tx.rows[0]?.volume ?? 0,
      weekStartedAt,
    }
  } catch (err) {
    console.log("[v0] getRealStats error:", err instanceof Error ? err.message : err)
    return {
      realUsersTotal: 0,
      realUsersThisWeek: 0,
      realTransactionsTotal: 0,
      realTransactionsToday: 0,
      realVolumeUsd: 0,
      weekStartedAt,
    }
  }
}
