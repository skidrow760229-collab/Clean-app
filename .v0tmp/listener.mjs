import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED })
await c.connect()
c.on("notification", m => { console.log("[v0] LISTENER 收到:", m.payload); process.exit(0) })
await c.query("LISTEN xproc")
console.log("[v0] LISTENER 就绪")
setTimeout(() => { console.log("[v0] LISTENER 超时未收到"); process.exit(2) }, 8000)
