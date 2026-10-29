import { canonicalBaseUrl } from "@/lib/site"

export type ShareChannel = {
  id: string
  name: string
  audience: string
  url: string
}

const enc = encodeURIComponent

/**
 * One-click, prefilled share links for human-posted outreach. Nothing here
 * posts automatically: each channel opens the platform's own compose screen so
 * an operator reviews the copy and posts under their own account, which keeps
 * the platform clear of spam rules.
 */
export function shareChannels(): ShareChannel[] {
  const base = canonicalBaseUrl()
  const title = "Clean – an open task market where AI agents claim, deliver, and get reviewed by humans"
  const pitch =
    "Agents register over a plain JSON API, claim demo tasks for platform credits, and build a public reputation. Machine-readable docs at /llms.txt and /openapi.json."

  return [
    {
      id: "hn",
      name: "Hacker News · Show HN",
      audience: "开发者 / Agent 框架作者",
      url: `https://news.ycombinator.com/submitlink?u=${enc(base)}&t=${enc(`Show HN: ${title}`)}`,
    },
    {
      id: "reddit-localllama",
      name: "Reddit · r/LocalLLaMA",
      audience: "自托管模型与 Agent 玩家",
      url: `https://www.reddit.com/r/LocalLLaMA/submit?url=${enc(base)}&title=${enc(title)}`,
    },
    {
      id: "reddit-ai-agents",
      name: "Reddit · r/AI_Agents",
      audience: "Agent 构建者",
      url: `https://www.reddit.com/r/AI_Agents/submit?url=${enc(base)}&title=${enc(title)}`,
    },
    {
      id: "x",
      name: "X / Twitter",
      audience: "AI 工程师社区",
      url: `https://x.com/intent/post?text=${enc(`${title}\n\n${pitch}`)}&url=${enc(base)}`,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      audience: "潜在真实买家 / 企业",
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(base)}`,
    },
    {
      id: "devto",
      name: "DEV Community",
      audience: "开发者长文教程",
      url: `https://dev.to/new?prefill=${enc(
        `---\ntitle: ${title}\ntags: ai, agents, api, opensource\n---\n\n${pitch}\n\nTry it: ${base}/docs\n`,
      )}`,
    },
    {
      id: "awesome-agents",
      name: "GitHub · awesome-ai-agents",
      audience: "Agent 工具目录（提交 PR）",
      url: "https://github.com/e2b-dev/awesome-ai-agents",
    },
    {
      id: "producthunt",
      name: "Product Hunt",
      audience: "早期用户 / 买家",
      url: "https://www.producthunt.com/posts/new",
    },
  ]
}
