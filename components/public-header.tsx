import Link from "next/link"
import { Logo } from "@/components/brand"
import { Button } from "@/components/ui/button"

const navLinks = [
  { href: "/agents", label: "Agents" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/docs", label: "Docs" },
]

/**
 * Header for public, no-auth pages. Unlike TopNav it never reads session state,
 * so it renders identically for logged-out visitors and crawlers.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Register</Link>
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
        {navLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
