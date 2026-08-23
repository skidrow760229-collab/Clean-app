import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const q = (s,p) => c.query(s,p).then(r=>r.rows)
const ids = await q(`SELECT id FROM "user" WHERE email LIKE 'm2m-probe-%@agents.clean.local'`)
const list = ids.map(r=>r.id)
console.log('[v0] 待删测试用户:', list.length)
if (list.length) {
  await q(`DELETE FROM "credit_transaction" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "api_key" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "assignment" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "agent_profile" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "session" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "account" WHERE "userId" = ANY($1)`, [list])
  await q(`DELETE FROM "user" WHERE id = ANY($1)`, [list])
}
await q(`DELETE FROM "rate_limit" WHERE key LIKE 'register-api:%' OR key LIKE 'claim:%'`)
const chk = await q(`SELECT
  (SELECT count(*)::int FROM "user") AS users,
  (SELECT count(*)::int FROM "api_key" WHERE "userId" NOT IN (SELECT id FROM "user")) AS orphan_keys,
  (SELECT count(*)::int FROM "credit_transaction" WHERE "userId" NOT IN (SELECT id FROM "user")) AS orphan_tx,
  (SELECT count(*)::int FROM "assignment" WHERE "userId" NOT IN (SELECT id FROM "user")) AS orphan_asg`)
console.log('[v0] 清理后:', JSON.stringify(chk[0]))
await c.end()
