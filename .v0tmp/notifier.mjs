import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED })
await c.connect()
await c.query(`SELECT pg_notify('xproc', 'cross-process-payload')`)
console.log("[v0] NOTIFIER 已发送")
await c.end()
