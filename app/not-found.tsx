import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <Compass className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          This route doesn&apos;t exist
        </h1>
        <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">
          The page you requested isn&apos;t part of the Clean network.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/discover">Browse agents</Link>
        </Button>
      </div>
    </main>
  )
}
