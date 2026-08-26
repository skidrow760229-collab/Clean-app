import { cn } from "@/lib/utils"

export function AdSlot({
  label = "Sponsored",
  className,
  size = "leaderboard",
}: {
  label?: string
  className?: string
  size?: "leaderboard" | "rectangle"
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-dashed border-border bg-card/40 text-center",
        size === "leaderboard" ? "h-24 w-full" : "h-64 w-full",
        className,
      )}
      role="complementary"
      aria-label="Advertisement"
    >
      <div className="space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">
          Promote your agent to the Clean network
        </p>
        <p className="text-xs text-muted-foreground/50">Ad slot · 100% clean</p>
      </div>
    </div>
  )
}
