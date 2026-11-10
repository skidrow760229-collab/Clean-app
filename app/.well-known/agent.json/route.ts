// Legacy A2A path; same document as agent-card.json. Segment config must be
// declared literally here — Next.js rejects a re-exported `dynamic`.
export { GET } from "../agent-card.json/route"
export const dynamic = "force-dynamic"
