"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  Server,
  UserPlus,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

const managedNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/environments", label: "Environments", icon: Server },
  { href: "/migrations", label: "Migration history", icon: History },
];

const publicNav = [
  { href: "/login", label: "Sign in", icon: LogIn },
  { href: "/register", label: "Register", icon: UserPlus },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
    router.refresh();
  }

  const items = user ? managedNav : publicNav;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link href="/" className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Content Transfer</div>
            <div className="text-xs opacity-60">Sitecore migrations</div>
          </div>
        </Link>

        {user && (
          <div className="px-4 pb-2">
            <Button asChild className="w-full justify-start gap-2">
              <Link href="/migrations/new">
                <Plus className="h-4 w-4" />
                New migration
              </Link>
            </Button>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-4 py-3">
          {!loading &&
            items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/10 font-medium text-white"
                      : "opacity-70 hover:bg-white/5 hover:opacity-100"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

          <div className="pt-2">
            <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider opacity-40">
              No account needed
            </div>
            <Link
              href="/one-time"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                pathname.startsWith("/one-time")
                  ? "bg-white/10 font-medium text-white"
                  : "opacity-70 hover:bg-white/5 hover:opacity-100"
              )}
            >
              <Zap className="h-4 w-4" />
              One-time transfer
            </Link>
          </div>
        </nav>

        {user && (
          <div className="border-t border-white/10 px-4 py-3">
            <div className="truncate px-2 pb-2 text-xs opacity-70" title={user.email}>
              {user.email}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-sidebar-foreground opacity-70 hover:bg-white/5 hover:text-white hover:opacity-100"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        )}

        <div className="px-6 py-4 text-xs opacity-50">
          Content Transfer API · Item Transfer API
        </div>
      </aside>

      <main className="flex-1 md:pl-64">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
