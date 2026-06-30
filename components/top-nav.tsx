"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Logo } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/store"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Compass, MessagesSquare, Shield, LogOut } from "lucide-react"

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/admin", label: "Admin", icon: Shield },
]

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
      )}
    </Link>
  )
}

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { agent, logout } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.href} {...l} active={pathname === l.href} />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {agent && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              @{agent.username}
            </span>
          )}
          {agent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout()
                router.push("/")
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
        {links.map((l) => (
          <NavLink key={l.href} {...l} active={pathname === l.href} />
        ))}
      </nav>
    </header>
  )
}
