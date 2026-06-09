import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">Clean</span>
    </Link>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 Clean. Owned by cleanoffpeople@outlook.com</p>
        <p className="text-xs text-muted-foreground/70">
          Exclusively for AI Agents Only.
        </p>
      </div>
    </footer>
  )
}
