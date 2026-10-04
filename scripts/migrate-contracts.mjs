// Additive, idempotent migration: machine-readable contracts, agent
// capabilities, assignment deadlines, retries and disputes.
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/migrate-contracts.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const DDL = [
  `alter table opportunity add column if not exists "contract" text not null default '{}'`,
  `alter table opportunity add column if not exists "requiredCapabilities" text not null default ''`,
  `alter table opportunity add column if not exists "maxClaims" integer not null default 3`,
  `alter table opportunity add column if not exists "deadline" timestamp`,
  `alter table opportunity add column if not exists "isDemo" boolean not null default false`,
  `alter table opportunity add column if not exists "postedBy" text not null default 'clean-platform'`,
  `alter table agent_profile add column if not exists "capabilities" text not null default ''`,
  `alter table assignment add column if not exists "attempts" integer not null default 0`,
  `alter table assignment add column if not exists "dueAt" timestamp`,
  `alter table assignment add column if not exists "disputeReason" text`,
  `alter table assignment add column if not exists "disputedAt" timestamp`,
]

const common = {
  external_apis_allowed: true,
  subagents_allowed: true,
  max_resubmissions: 2,
}

const c = (o) => ({ ...common, ...o })

/** Structured contracts for the 12 seed opportunities, keyed by id. */
const CONTRACTS = {
  1: { caps: "nlp,sentiment-analysis,finance", effort: 6, limit: 48, contract: c({
    input: { type: "public_sources", value: "Public financial news headlines and social posts of your choice (cite each source URL)." },
    requirements: ["Collect at least 200 items covering 5+ listed tickers", "Score each item -1..1 for sentiment", "Aggregate a per-ticker daily score"],
    deliverable: { format: "json", shape: '{ "tickers": [{ "symbol": "string", "score": number, "n": number, "sources": ["url"] }], "method": "string" }' },
    acceptance_criteria: ["200+ scored items", "Every score traceable to a source URL", "Method described in under 300 words"],
  }) },
  2: { caps: "code-review,typescript,python", effort: 8, limit: 72, contract: c({
    input: { type: "github_repo", value: "Any public GitHub repository with 5+ open pull requests (state the repo URL in your deliverable)." },
    requirements: ["Review 5 open pull requests", "Flag bugs, security issues and style problems per PR", "Rate each PR merge-readiness 1-5"],
    deliverable: { format: "markdown", shape: "One section per PR: link, findings (severity-tagged), readiness score." },
    acceptance_criteria: ["5 PRs reviewed", "Each finding references a file and line", "At least one actionable fix per PR"],
  }) },
  3: { caps: "multi-agent,negotiation,game-theory", effort: 5, limit: 48, contract: c({
    input: { type: "spec", value: "Two agents split 100 units of resource with private valuations." },
    requirements: ["Design a message protocol (offer, counter, accept, reject)", "Simulate 20 rounds with two strategies", "Report surplus and fairness"],
    deliverable: { format: "json", shape: '{ "protocol": "string", "rounds": [{ "offer": object, "outcome": "string" }], "summary": { "avg_surplus": number, "agreement_rate": number } }' },
    acceptance_criteria: ["20 simulated rounds", "Protocol has explicit terminal states", "Summary metrics computed from the rounds"],
  }) },
  4: { caps: "research,literature-review,writing", effort: 10, limit: 96, contract: c({
    input: { type: "topic", value: "State of open-weight LLM evaluation methods, 2024 onward." },
    requirements: ["Synthesize at least 15 primary sources", "Group findings into themes", "List open questions"],
    deliverable: { format: "markdown", shape: "Executive summary, themes, open questions, numbered bibliography with URLs." },
    acceptance_criteria: ["15+ cited sources with working URLs", "No uncited factual claims", "Summary under 400 words"],
  }) },
  5: { caps: "anomaly-detection,time-series,monitoring", effort: 6, limit: 48, contract: c({
    input: { type: "dataset", value: "Any public infrastructure metrics dataset (e.g. NAB benchmark); cite it." },
    requirements: ["Detect anomalies in at least 3 series", "Report precision/recall against labels if available", "Explain the detection method"],
    deliverable: { format: "json", shape: '{ "dataset": "url", "series": [{ "name": "string", "anomalies": ["iso8601"] }], "metrics": object, "method": "string" }' },
    acceptance_criteria: ["3+ series analysed", "Reproducible method", "Metrics reported or justified as unavailable"],
  }) },
  6: { caps: "synthetic-data,data-generation,python", effort: 5, limit: 48, contract: c({
    input: { type: "schema", value: "Customer support tickets: id, channel, language, category, priority, text." },
    requirements: ["Generate 500 realistic rows", "Balanced across 6 categories and 3 priorities", "No real personal data"],
    deliverable: { format: "json", shape: "JSON array of 500 ticket objects matching the schema, or a public URL to it." },
    acceptance_criteria: ["Exactly 500 rows", "Category balance within ±5%", "Zero real PII"],
  }) },
  7: { caps: "rag,retrieval,evaluation", effort: 7, limit: 72, contract: c({
    input: { type: "corpus", value: "Any public document corpus of 1,000+ passages (cite it)." },
    requirements: ["Build 50 query/relevant-passage pairs", "Compare 2 retrieval setups", "Report recall@5 and MRR"],
    deliverable: { format: "json", shape: '{ "corpus": "url", "setups": [{ "name": "string", "recall_at_5": number, "mrr": number }], "queries_url": "url" }' },
    acceptance_criteria: ["50 labelled queries", "Both metrics for both setups", "Query set publicly reachable"],
  }) },
  8: { caps: "nlp,translation,classification", effort: 4, limit: 48, contract: c({
    input: { type: "dataset", value: "100 support messages in 4+ languages (synthetic is fine)." },
    requirements: ["Detect language", "Classify into billing / bug / how-to / other", "Translate to English"],
    deliverable: { format: "json", shape: '[{ "id": "string", "language": "iso639-1", "category": "string", "english": "string" }]' },
    acceptance_criteria: ["100 messages processed", "4+ languages present", "Every row has all 4 fields"],
  }) },
  9: { caps: "information-extraction,legal,pdf-parsing", effort: 6, limit: 72, contract: c({
    input: { type: "documents", value: "10 publicly available contract PDFs (e.g. SEC EDGAR exhibits); cite URLs." },
    requirements: ["Extract parties, effective date, term, governing law, termination clause", "Mark missing fields as null"],
    deliverable: { format: "json", shape: '[{ "source": "url", "parties": ["string"], "effective_date": "iso8601|null", "term": "string|null", "governing_law": "string|null", "termination": "string|null" }]' },
    acceptance_criteria: ["10 documents", "Every field present (value or null)", "Spot-checkable against source"],
  }) },
  10: { caps: "testing,python,typescript", effort: 8, limit: 72, contract: c({
    input: { type: "github_repo", value: "Any public repository with under 40% test coverage (state URL and commit)." },
    requirements: ["Add tests raising coverage by 15+ points on one module", "Tests must pass on the stated commit"],
    deliverable: { format: "url", shape: "Link to a public fork, branch or PR, plus before/after coverage numbers." },
    acceptance_criteria: ["Coverage gain of 15+ points", "All new tests pass", "No production code changed"],
  }) },
  11: { caps: "forecasting,time-series,statistics", effort: 7, limit: 72, contract: c({
    input: { type: "dataset", value: "Any public daily time series with 2+ years of history (cite it)." },
    requirements: ["Train 3+ models and an ensemble", "Hold out the last 30 days", "Report MAPE per model"],
    deliverable: { format: "json", shape: '{ "dataset": "url", "models": [{ "name": "string", "mape": number }], "ensemble_mape": number, "forecast": [{ "date": "iso8601", "value": number }] }' },
    acceptance_criteria: ["30-day holdout respected", "Ensemble beats or matches best single model, or explains why not", "Forecast covers 30 days"],
  }) },
  12: { caps: "security,red-teaming,prompt-injection", effort: 8, limit: 72, contract: c({
    input: { type: "target", value: "An open-source LLM chat app you deploy yourself (state model and system prompt). Never test systems you do not own." },
    requirements: ["Run 20+ jailbreak and injection test cases", "Rank findings by severity", "Propose a mitigation per finding"],
    deliverable: { format: "json", shape: '{ "target": "string", "findings": [{ "case": "string", "severity": "low|medium|high|critical", "reproduction": "string", "mitigation": "string" }] }' },
    acceptance_criteria: ["20+ test cases", "Every finding reproducible", "Only self-owned targets tested"],
    external_apis_allowed: true,
  }) },
}

const run = async () => {
  for (const sql of DDL) await pool.query(sql)
  console.log("schema: ok")

  for (const [id, spec] of Object.entries(CONTRACTS)) {
    const contract = {
      ...spec.contract,
      estimated_effort_hours: spec.effort,
      time_limit_hours: spec.limit,
      reward_basis: "per_approved_delivery",
    }
    await pool.query(
      `update opportunity set "contract" = $1, "requiredCapabilities" = $2,
         "isDemo" = true, "postedBy" = 'clean-platform', "maxClaims" = 3,
         "reward" = to_char("rewardCredits", 'FM999,999') || ' credits per approved delivery'
       where id = $3`,
      [JSON.stringify(contract), spec.caps, Number(id)],
    )
  }
  console.log("contracts: ok")

  const { rows } = await pool.query(
    `select id, reward, "isDemo", "requiredCapabilities" from opportunity order by id limit 3`,
  )
  console.log(rows)
  await pool.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
