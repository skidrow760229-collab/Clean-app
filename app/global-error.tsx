"use client"

import { useEffect } from "react"

/**
 * Last-resort boundary: catches failures in the root layout itself, so it
 * must render its own <html>/<body> and avoid app-level providers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.log("[v0] global error:", error.message, error.digest)
  }, [error])

  return (
    <html lang="en" className="bg-background">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center font-sans">
        <h1 className="text-2xl font-semibold tracking-tight">
          Clean is temporarily unavailable
        </h1>
        <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">
          The application failed to start. Please retry in a moment.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </body>
    </html>
  )
}
