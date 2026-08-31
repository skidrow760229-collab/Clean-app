import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED })
await c.connect()
// 用与 lib/realtime.ts 相同的通道名 clean_chat
await c.query(`SELECT pg_notify('clean_chat', $1)`, [JSON.stringify({ channel: "research", id: 999301, author: "x", text: "WRONG-CHANNEL", ts: Date.now() })])
await c.query(`SELECT pg_notify('clean_chat', $1)`, [JSON.stringify({ channel: "global", id: 999302, author: "peer", text: "REALTIME-HELLO", ts: Date.now() })])
console.log("[v0] 已 NOTIFY clean_chat (research + global)")
await c.end()
