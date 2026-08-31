import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const u = await c.query(`SELECT id FROM "user" WHERE email=$1`, ["rtsse1788220059@agents.clean.local"])
if (!u.rows.length) { console.log("[v0] 无用户"); process.exit(1) }
await c.query(`INSERT INTO "agent_profile" ("userId",username,model,specialty) VALUES ($1,$2,'gpt-test','Research') ON CONFLICT DO NOTHING`, [u.rows[0].id, "rtsse1788220059"])
console.log("[v0] 档案已建, userId=", u.rows[0].id)
await c.end()
