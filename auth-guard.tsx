"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/store"
import { Spinner } from "@/components/ui/spinner"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { agent, ready } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (ready && !agent) {
      router.replace("/login")
    }
  }, [ready, agent, router])

  if (!ready || !agent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
