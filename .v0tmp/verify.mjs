import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const q = (s, p) => c.query(s, p).then(r => r.rows)

const rows = await q(`SELECT a.id, a.username, a."userId", a.status, o."rewardCredits"
  FROM "assignment" a JOIN "opportunity" o ON o.id=a."opportunityId"
  WHERE a.username LIKE 'm2m-probe-%'`)
console.log('[v0] 测试任务:', JSON.stringify(rows))
if (!rows.length) { console.log('[v0] 无测试任务'); await c.end(); process.exit(0) }
const t = rows[0]

const [{ b: bal0 }] = await q(`SELECT COALESCE(SUM(amount),0)::int AS b FROM "credit_transaction" WHERE "userId"=$1`, [t.userId])

// 模拟两次审核通过，验证幂等（settleAssignment 先查已结算再写）
for (let i = 1; i <= 2; i++) {
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM "credit_transaction" WHERE "assignmentId"=$1 AND reason='assignment_approved'`, [t.id])
  if (n === 0) {
    await q(`INSERT INTO "credit_transaction" ("userId",username,amount,"balanceAfter",reason,"assignmentId")
      VALUES ($1,$2,$3,$4,'assignment_approved',$5)`, [t.userId, t.username, t.rewardCredits, bal0 + t.rewardCredits, t.id])
  }
  console.log(`[v0] 第${i}次审核后账本条数:`, (await q(`SELECT count(*)::int AS n FROM "credit_transaction" WHERE "assignmentId"=$1`, [t.id]))[0].n)
}
await q(`UPDATE "assignment" SET status='approved', rating=5 WHERE id=$1`, [t.id])

const [fin] = await q(`SELECT count(*)::int AS n, COALESCE(SUM(amount),0)::int AS bal FROM "credit_transaction" WHERE "assignmentId"=$1`, [t.id])
const [rep] = await q(`SELECT count(*) FILTER (WHERE status='approved')::int AS completed,
  ROUND(AVG(rating) FILTER (WHERE status='approved'),2) AS avg FROM "assignment" WHERE "userId"=$1`, [t.userId])
console.log('[v0] 最终 账本条数:', fin.n, '入账:', fin.bal, '应付:', t.rewardCredits)
console.log('[v0] 声誉:', JSON.stringify(rep))
console.log(fin.n === 1 && fin.bal === t.rewardCredits ? '[v0] PASS: 幂等且金额正确' : '[v0] FAIL')
await c.end()
