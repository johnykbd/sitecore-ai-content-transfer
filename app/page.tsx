"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EnvironmentProfile, Migration } from "@/lib/types";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";

function Landing() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ArrowLeftRight className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Sitecore Content Transfer</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Move content between Sitecore environments using the Content Transfer and Item Transfer
          APIs. Choose how you want to work:
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col border-amber-500/30">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Zap className="h-5 w-5" />
            </div>
            <CardTitle>One-time migration</CardTitle>
            <CardDescription>
              No account needed. Paste your environment URLs and access tokens — they stay in your
              session only and are never written to disk. Logs are not saved.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button asChild variant="outline" className="w-full">
              <Link href="/one-time">
                Start a one-time transfer <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col border-primary/30">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle>Fully managed</CardTitle>
            <CardDescription>
              Register with email &amp; password. Save unlimited environments (client ID/secret or
              token, encrypted at rest in SQLite) and keep full migration history with logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid grid-cols-2 gap-3">
            <Button asChild className="w-full">
              <Link href="/register">Register</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        Managed credentials are AES-256-GCM encrypted; one-time credentials never touch storage.
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [migrations, setMigrations] = useState<Migration[] | null>(null);
  const [envs, setEnvs] = useState<EnvironmentProfile[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      const [m, e] = await Promise.all([
        fetch("/api/migrations").then((r) => r.json()),
        fetch("/api/environments").then((r) => r.json()),
      ]);
      if (active) {
        setMigrations(Array.isArray(m) ? m : []);
        setEnvs(Array.isArray(e) ? e : []);
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) return <Landing />;

  const loading = migrations === null || envs === null;
  const completed = migrations?.filter((m) => m.status === "completed").length ?? 0;
  const unconfirmed = migrations?.filter((m) => m.status === "unconfirmed").length ?? 0;
  const failed = migrations?.filter((m) => m.status === "failed").length ?? 0;
  const runningList = migrations?.filter((m) => m.status === "running") ?? [];
  const recent = migrations?.slice(0, 5) ?? [];

  const stats = [
    { label: "Environments", value: envs?.length ?? 0, icon: Server, color: "text-sky-500" },
    { label: "Running", value: runningList.length, icon: Loader2, color: "text-primary" },
    { label: "Completed", value: completed, icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Unconfirmed", value: unconfirmed, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {user.email} · fully-managed mode with saved environments and history.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/migrations/new">
            <Plus className="h-4 w-4" /> New migration
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary">
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold leading-none">{s.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {envs.length < 2 && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex items-center gap-3">
                  <ArrowLeftRight className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">Get started</p>
                    <p className="text-sm text-muted-foreground">
                      Add your source and destination environments, then run your first migration
                      (try a dry run first).
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link href="/environments">
                    Set up environments <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Recent migrations</CardTitle>
                <CardDescription>Latest transfers and their status</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/migrations">
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No migrations yet.
                </p>
              ) : (
                <div className="divide-y">
                  {recent.map((m) => (
                    <Link
                      key={m.id}
                      href={`/migrations/${m.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.sourceEnvName} → {m.destinationEnvName} ·{" "}
                          {new Date(m.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
