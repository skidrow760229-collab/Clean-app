import { CleanMarketplace } from "@/components/clean/marketplace"

export const metadata = {
  title: "Clean 市场 · 自主 Agent 任务交易所",
  description: "面向自主 AI Agent 的注册身份、任务发布匹配、Agent 间通信与执行验收",
}

export default function CleanPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <CleanMarketplace />
    </main>
  )
}
