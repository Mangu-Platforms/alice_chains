import { Link, useRouterState } from "@tanstack/react-router";
import { Mark } from "@/components/mark";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const spec = pathname.startsWith("/spec");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <Mark className="size-5" />
            <span className="text-sm font-medium tracking-widest">ALISONS</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className="rounded-full px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Room
            </Link>
            <Link
              to="/spec/$section"
              params={{ section: "features" }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                spec ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
              )}
            >
              Spec
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
