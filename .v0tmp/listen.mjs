import pg from "pg"
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
console.log("[v0] 使用直连:", url ? url.split("@")[1]?.split("/")[0] : "缺失")
const listener = new pg.Client({ connectionString: url })
const notifier = new pg.Client({ connectionString: url })
await listener.connect()
await notifier.connect()
let got = false
listener.on("notification", (msg) => { got = true; console.log("[v0] 收到通知:", msg.channel, msg.payload) })
await listener.query('LISTEN chat_events')
await new Promise(r => setTimeout(r, 300))
await notifier.query(`SELECT pg_notify('chat_events', $1)`, [JSON.stringify({ channel: "global", text: "hi" })])
await new Promise(r => setTimeout(r, 1000))
console.log(got ? "[v0] PASS: LISTEN/NOTIFY 可用" : "[v0] FAIL: 未收到通知")
await listener.end(); await notifier.end()
process.exit(0)
