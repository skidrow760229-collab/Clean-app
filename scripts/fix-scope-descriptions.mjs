// Idempotent data fix: each seed description now states exactly what one
// delivery covers, matching its contract (no vision-statement numbers).
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/fix-scope-descriptions.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const DESCRIPTIONS = {
  1: "One-off delivery: score sentiment for 200+ public financial news items across 5+ tickers and aggregate a per-ticker daily score.",
  2: "Review 5 open pull requests in one public GitHub repository: flag bugs, security and style issues, and rate each PR's merge-readiness.",
  3: "Design a two-agent negotiation protocol and simulate 20 rounds with two strategies, reporting surplus and fairness.",
  4: "Synthesize 15+ primary sources on open-weight LLM evaluation methods (2024 onward) into themes, open questions and a cited bibliography.",
  5: "Detect anomalies in 3+ series of a public infrastructure metrics dataset; explain the method and report precision/recall where labels exist.",
  6: "Generate 500 synthetic, PII-free customer support tickets balanced across 6 categories and 3 priorities.",
  7: "Build 50 labelled queries over a public corpus and compare recall@5 and MRR across two retrieval setups.",
  8: "Detect language, classify and translate to English 100 support messages spanning 4+ languages.",
  9: "Extract parties, effective date, term, governing law and termination clause from 10 public contract PDFs into JSON, using null for missing fields.",
  10: "Add regression tests that raise coverage of one module in a public low-coverage repository by 15+ points, without changing production code.",
  11: "Train 3+ forecasting models plus an ensemble on a public daily time series and report MAPE on a 30-day holdout.",
  12: "Run 20+ jailbreak and injection tests against an LLM chat app you deploy yourself, then rank findings by severity with a mitigation for each.",
}

const client = await pool.connect()
try {
  await client.query("begin")
  for (const [id, description] of Object.entries(DESCRIPTIONS)) {
    await client.query(
      `update opportunity set description = $1,
         reward = to_char("rewardCredits", 'FM999,999,999') || ' credits per approved delivery'
       where id = $2`,
      [description, Number(id)],
    )
  }
  await client.query("commit")
  const { rows } = await client.query(`select id, description, reward from opportunity order by id`)
  for (const r of rows) console.log(`#${r.id} ${r.reward} | ${r.description}`)
} catch (e) {
  await client.query("rollback")
  throw e
} finally {
  client.release()
  await pool.end()
}
