"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { LogEntry, Migration } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { MigrationTimeline } from "@/components/migration-timeline";
import { LogViewer } from "@/components/log-viewer";
import { formatBytes, formatDuration } from "@/lib/utils";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useRequireAuth } from "@/lib/use-auth";

export default function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  useRequireAuth();
  const { id } = use(params);
  const [migration, setMigration] = useState<Migration | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/migrations/${id}`);
        if (res.status === 404) {
          if (active) setNotFound(true);
          return;
        }
        const json = await res.json();
        if (!active) return;
        setMigration(json.migration);
        setLogs(json.logs);
        const status = json.migration?.status;
        if (status === "running" || status === "pending") {
          timer = setTimeout(poll, 1500);
        }
      } catch {
        timer = setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Migration not found.</p>
        <Button asChild variant="outline">
          <Link href="/migrations">
            <ArrowLeft className="h-4 w-4" /> Back to history
          </Link>
        </Button>
      </div>
    );
  }

  if (!migration) {
    return (
      <div className="flex h-60 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const completedSteps = migration.steps.filter((s) => s.status === "completed").length;
  const progress = Math.round((completedSteps / migration.steps.length) * 100);
  const duration =
    migration.startedAt &&
    (migration.finishedAt
      ? new Date(migration.finishedAt).getTime() - new Date(migration.startedAt).getTime()
      : Date.now() - new Date(migration.startedAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{migration.name}</h1>
            <StatusBadge status={migration.status} />
            {migration.options.dryRun && <Badge variant="warning">Dry run</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {migration.sourceEnvName} → {migration.destinationEnvName} ·{" "}
            {migration.items.length} item(s) · created{" "}
            {new Date(migration.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/migrations">
              <ArrowLeft className="h-4 w-4" /> History
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/migrations/${migration.id}/log`} download>
              <Download className="h-4 w-4" /> Download log
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedSteps} of {migration.steps.length} steps complete
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Transfer ID</div>
              <div className="truncate font-mono text-xs">{migration.transferId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Package size</div>
              <div className="font-medium">
                {migration.packageSizeBytes ? formatBytes(migration.packageSizeBytes) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Items transferred</div>
              <div className="font-medium">{migration.itemsTransferred ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="font-medium">{duration ? formatDuration(duration) : "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {migration.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {migration.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress timeline</CardTitle>
            <CardDescription>Every step of the transfer pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <MigrationTimeline steps={migration.steps} />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Migration log</CardTitle>
              <CardDescription>
                Step-by-step record of every Sitecore API request and response (tokens redacted).
                Expand a line to see the raw payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogViewer logs={logs} autoScroll={migration.status === "running"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Items in this migration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {migration.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-secondary/40 px-3 py-1.5 text-sm"
                >
                  <span className="truncate font-mono text-xs">{item.path}</span>
                  {item.includeDescendants && (
                    <Badge variant="secondary" className="ml-auto shrink-0">
                      + descendants
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
