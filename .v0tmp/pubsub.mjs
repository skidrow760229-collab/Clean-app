import Redis from "ioredis"
const url = process.env.REDIS_URL
console.log("[v0] REDIS_URL 协议:", url ? url.split("://")[0] : "缺失")
const sub = new Redis(url, { maxRetriesPerRequest: null })
const pub = new Redis(url, { maxRetriesPerRequest: null })
let got = false
sub.on("error", e => console.log("[v0] sub 错误:", e.message))
pub.on("error", e => console.log("[v0] pub 错误:", e.message))
await sub.subscribe("chat:test")
sub.on("message", (ch, msg) => { got = true; console.log("[v0] 收到:", ch, msg) })
await new Promise(r => setTimeout(r, 500))
await pub.publish("chat:test", JSON.stringify({ hello: "world" }))
await new Promise(r => setTimeout(r, 1200))
console.log(got ? "[v0] PASS: pub/sub 可用" : "[v0] FAIL: 未收到消息")
sub.disconnect(); pub.disconnect()
process.exit(0)
