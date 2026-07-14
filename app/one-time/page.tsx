"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ItemNode, LogEntry, Migration, SelectedItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ItemTree } from "@/components/item-tree";
import { MigrationTimeline } from "@/components/migration-timeline";
import { LogViewer } from "@/components/log-viewer";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight,
  EyeOff,
  FlaskConical,
  Loader2,
  Plus,
  RotateCcw,
  Rocket,
  ShieldOff,
  Trash2,
} from "lucide-react";

interface EnvInput {
  name: string;
  baseUrl: string;
  token: string;
}

export default function OneTimeMigrationPage() {
  const [name, setName] = useState("");
  const [source, setSource] = useState<EnvInput>({ name: "Source", baseUrl: "", token: "" });
  const [destination, setDestination] = useState<EnvInput>({
    name: "Destination",
    baseUrl: "",
    token: "",
  });
  const [demoTree, setDemoTree] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [manualPath, setManualPath] = useState("");
  const [options, setOptions] = useState({
    overwriteExisting: true,
    includeRelatedItems: true,
    publishAfterTransfer: false,
    dryRun: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [migration, setMigration] = useState<Migration | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onetimeCreds = useMemo(
    () =>
      source.baseUrl && source.token
        ? { baseUrl: source.baseUrl, token: source.token }
        : undefined,
    [source.baseUrl, source.token]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  function toggleItem(node: ItemNode) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(node.itemId)) next.delete(node.itemId);
      else
        next.set(node.itemId, {
          itemId: node.itemId,
          path: node.path,
          name: node.name,
          includeDescendants: node.hasChildren,
        });
      return next;
    });
  }

  function toggleDescendants(itemId: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const item = next.get(itemId);
      if (item) next.set(itemId, { ...item, includeDescendants: !item.includeDescendants });
      return next;
    });
  }

  function addManual() {
    if (!manualPath.trim()) return toast.error("Enter an item path.");
    const path = manualPath.trim();
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(`path:${path}`, {
        itemId: "",
        path,
        name: path.split("/").filter(Boolean).pop() ?? path,
        includeDescendants: true,
      });
      return next;
    });
    setManualPath("");
  }

  function poll(id: string) {
    void (async () => {
      try {
        const res = await fetch(`/api/onetime/migrations/${id}`);
        if (!res.ok) return;
        const json = await res.json();
        setMigration(json.migration);
        setLogs(json.logs);
        if (json.migration.status === "running" || json.migration.status === "pending") {
          pollRef.current = setTimeout(() => poll(id), 1500);
        }
      } catch {
        pollRef.current = setTimeout(() => poll(id), 3000);
      }
    })();
  }

  async function start() {
    if (!source.baseUrl || !destination.baseUrl)
      return toast.error("Both environment URLs are required.");
    if (!options.dryRun && (!source.token || !destination.token))
      return toast.error("Access tokens are required for both environments (or enable dry run).");
    if (!selected.size) return toast.error("Select at least one item.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/onetime/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || `One-time: ${source.name || "Source"} → ${destination.name || "Destination"}`,
          source,
          destination,
          items: Array.from(selected.values()),
          options,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to start migration");
      setMigration(json);
      setLogs([]);
      poll(json.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setMigration(null);
    setLogs([]);
  }

  /* ------------- run view ------------- */
  if (migration) {
    const completedSteps = migration.steps.filter((s) => s.status === "completed").length;
    const progress = Math.round((completedSteps / migration.steps.length) * 100);
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
              {migration.items.length} item(s)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> New one-time transfer
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <EyeOff className="h-4 w-4 shrink-0" />
          Session-only migration: credentials and logs live in memory and are not saved. Copy the
          log below if you need to keep it.
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
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">Session log</CardTitle>
              <CardDescription>Held in memory only — not persisted to disk</CardDescription>
            </CardHeader>
            <CardContent>
              <LogViewer logs={logs} autoScroll={migration.status === "running"} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ------------- setup view ------------- */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">One-time migration</h1>
        <p className="text-sm text-muted-foreground">
          Quick transfer without an account. Provide environment URLs and access tokens — nothing
          is stored, and logs are kept only for this session.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-700 dark:text-sky-400">
        <ShieldOff className="h-4 w-4 shrink-0" />
        Zero persistence: tokens stay in this session only and are never written to disk or
        database. No migration history is kept.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            ["Source", source, setSource],
            ["Destination", destination, setDestination],
          ] as const
        ).map(([label, env, setEnv]) => (
          <Card key={label}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4 text-primary" /> {label} environment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Label</Label>
                <Input
                  placeholder={label}
                  value={env.name}
                  onChange={(e) => setEnv({ ...env, name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Base URL *</Label>
                <Input
                  placeholder="https://xmc-....sitecorecloud.io"
                  value={env.baseUrl}
                  onChange={(e) => setEnv({ ...env, baseUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Access token *</Label>
                <Input
                  type="password"
                  placeholder="Bearer token (JWT)"
                  value={env.token}
                  onChange={(e) => setEnv({ ...env, token: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Content to transfer</CardTitle>
              <CardDescription>
                Add items by path, or browse the source tree using your token.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={demoTree} onCheckedChange={(v) => setDemoTree(!!v)} />
                Demo tree
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTree((v) => !v)}
                disabled={!demoTree && !onetimeCreds}
              >
                {showTree ? "Hide tree" : "Browse tree"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showTree && (
            <ItemTree
              onetime={onetimeCreds}
              demo={demoTree}
              selected={selected}
              onToggle={toggleItem}
              onToggleDescendants={toggleDescendants}
            />
          )}

          <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="ot-path">Add item by path</Label>
              <Input
                id="ot-path"
                placeholder="/sitecore/content/Home"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManual()}
              />
            </div>
            <Button variant="secondary" onClick={addManual}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {selected.size > 0 && (
            <div className="space-y-1">
              {Array.from(selected.entries()).map(([key, item]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-md border bg-secondary/40 px-3 py-1.5 text-sm"
                >
                  <span className="truncate font-mono text-xs">{item.path}</span>
                  {item.includeDescendants && (
                    <Badge variant="secondary" className="shrink-0">
                      + descendants
                    </Badge>
                  )}
                  <button
                    className="ml-auto shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Map(prev);
                        next.delete(key);
                        return next;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["overwriteExisting", "Overwrite existing items"],
                ["includeRelatedItems", "Include related items"],
                ["publishAfterTransfer", "Publish after transfer"],
                ["dryRun", "Dry run (simulation)"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40",
                  options[key] && "border-primary/50 bg-primary/5"
                )}
              >
                <Checkbox
                  checked={options[key]}
                  onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: !!v }))}
                />
                <span className="flex items-center gap-2 text-sm font-medium">
                  {label}
                  {key === "dryRun" && <FlaskConical className="h-3.5 w-3.5 text-amber-500" />}
                </span>
              </label>
            ))}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="grid max-w-sm flex-1 gap-1.5 pr-4">
              <Label htmlFor="ot-name">Migration name (optional)</Label>
              <Input
                id="ot-name"
                placeholder="One-time transfer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button size="lg" onClick={start} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Start transfer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
