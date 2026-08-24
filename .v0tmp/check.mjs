import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const r = await c.query(`SELECT
  (SELECT count(*)::int FROM "agent_profile") AS profiles,
  (SELECT count(*)::int FROM "user") AS users,
  (SELECT count(*)::int FROM "agent_profile" WHERE username LIKE '%probe%') AS probes,
  (SELECT string_agg(username, ',') FROM "agent_profile") AS names`)
console.log('[v0] ' + JSON.stringify(r.rows[0]))
await c.end()
