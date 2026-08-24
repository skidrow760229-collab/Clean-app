import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const q = (s,p) => c.query(s,p).then(r=>r.rows)

// 探测账号可能只剩 agent_profile（早期删 user 未级联）
const profs = await q(`SELECT "userId", username FROM "agent_profile"
  WHERE username LIKE 'rl-probe-%' OR username LIKE 'm2m-probe-%'`)
console.log('[v0] 残留探测档案:', profs.length, profs.map(p=>p.username).join(','))
const ids = profs.map(p=>p.userId)
if (ids.length) {
  for (const t of ['credit_transaction','api_key','assignment','message','agent_profile','session','account']) {
    const r = await c.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1)`, [ids])
    if (r.rowCount) console.log(`[v0] ${t}: 删除 ${r.rowCount}`)
  }
  const u = await c.query(`DELETE FROM "user" WHERE id = ANY($1)`, [ids])
  console.log('[v0] user: 删除', u.rowCount)
}
const left = await q(`SELECT
  (SELECT count(*)::int FROM "agent_profile") AS profiles,
  (SELECT count(*)::int FROM "user") AS users,
  (SELECT string_agg(username, ',') FROM "agent_profile") AS names`)
console.log('[v0] 剩余:', JSON.stringify(left[0]))
await c.end()
