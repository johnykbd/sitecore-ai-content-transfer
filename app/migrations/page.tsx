"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Migration } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDuration } from "@/lib/utils";
import { ArrowRight, Download, History, Loader2, Plus } from "lucide-react";
import { useRequireAuth } from "@/lib/use-auth";

export default function MigrationsPage() {
  const { user } = useRequireAuth();
  const [migrations, setMigrations] = useState<Migration[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      const res = await fetch("/api/migrations");
      const json = await res.json();
      if (active) setMigrations(Array.isArray(json) ? json : []);
    }
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Migration history</h1>
          <p className="text-sm text-muted-foreground">
            All migrations with their status and per-migration logs.
          </p>
        </div>
        <Button asChild>
          <Link href="/migrations/new">
            <Plus className="h-4 w-4" /> New migration
          </Link>
        </Button>
      </div>

      {migrations === null ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : migrations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <History className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">No migrations yet</p>
              <p className="text-sm text-muted-foreground">
                Start your first content transfer to see it here.
              </p>
            </div>
            <Button asChild>
              <Link href="/migrations/new">
                <Plus className="h-4 w-4" /> New migration
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {migrations.map((m) => {
            const duration =
              m.startedAt && m.finishedAt
                ? new Date(m.finishedAt).getTime() - new Date(m.startedAt).getTime()
                : undefined;
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/migrations/${m.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {m.name}
                      </Link>
                      <StatusBadge status={m.status} />
                      {m.options.dryRun && <Badge variant="warning">Dry run</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {m.sourceEnvName} → {m.destinationEnvName} · {m.items.length} item(s) ·{" "}
                      {new Date(m.createdAt).toLocaleString()}
                      {duration !== undefined && ` · ${formatDuration(duration)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/api/migrations/${m.id}/log`} download title="Download log">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/migrations/${m.id}`}>
                        Details <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
