"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EnvironmentProfile, ItemNode, SelectedItem } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ItemTree } from "@/components/item-tree";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  FlaskConical,
  Loader2,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { useRequireAuth } from "@/lib/use-auth";

const STEPS = ["Environments", "Select content", "Options & review"] as const;

export default function NewMigrationPage() {
  const { user } = useRequireAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [envs, setEnvs] = useState<EnvironmentProfile[]>([]);
  const [name, setName] = useState("");
  const [sourceEnvId, setSourceEnvId] = useState("");
  const [destinationEnvId, setDestinationEnvId] = useState("");
  const [demoTree, setDemoTree] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [manualPath, setManualPath] = useState("");
  const [manualId, setManualId] = useState("");
  const [options, setOptions] = useState({
    overwriteExisting: true,
    includeRelatedItems: true,
    publishAfterTransfer: false,
    dryRun: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/environments")
      .then((r) => r.json())
      .then((json) => setEnvs(Array.isArray(json) ? json : []));
  }, [user]);

  const sourceEnv = useMemo(() => envs.find((e) => e.id === sourceEnvId), [envs, sourceEnvId]);
  const destEnv = useMemo(
    () => envs.find((e) => e.id === destinationEnvId),
    [envs, destinationEnvId]
  );

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
    if (!manualPath.trim()) {
      toast.error("Enter an item path.");
      return;
    }
    const id = manualId.trim() || `path:${manualPath.trim()}`;
    const nameFromPath = manualPath.trim().split("/").filter(Boolean).pop() ?? manualPath;
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, {
        itemId: manualId.trim(),
        path: manualPath.trim(),
        name: nameFromPath,
        includeDescendants: true,
      });
      return next;
    });
    setManualPath("");
    setManualId("");
  }

  const canNext =
    step === 0
      ? sourceEnvId && destinationEnvId && sourceEnvId !== destinationEnvId
      : step === 1
        ? selected.size > 0
        : true;

  async function start() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            name ||
            `${sourceEnv?.name ?? "Source"} → ${destEnv?.name ?? "Destination"} (${new Date().toLocaleDateString()})`,
          sourceEnvId,
          destinationEnvId,
          items: Array.from(selected.values()),
          options,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to start migration");
      toast.success("Migration started.");
      router.push(`/migrations/${json.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New migration</h1>
        <p className="text-sm text-muted-foreground">
          Transfer content from one Sitecore environment to another.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-emerald-500 text-white"
                  : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i === step ? "font-medium" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose environments</CardTitle>
            <CardDescription>
              Content is packaged on the source with the Content Transfer API and consumed on the
              destination with the Item Transfer API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-1.5">
              <Label htmlFor="mig-name">Migration name</Label>
              <Input
                id="mig-name"
                placeholder="e.g. Homepage refresh UAT → PROD"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
              <div className="grid gap-1.5">
                <Label>Source environment</Label>
                <Select value={sourceEnvId} onValueChange={setSourceEnvId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {envs.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.tag ? `(${e.tag})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowLeftRight className="mx-auto mb-2 hidden h-5 w-5 text-muted-foreground md:block" />
              <div className="grid gap-1.5">
                <Label>Destination environment</Label>
                <Select value={destinationEnvId} onValueChange={setDestinationEnvId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {envs.map((e) => (
                      <SelectItem key={e.id} value={e.id} disabled={e.id === sourceEnvId}>
                        {e.name} {e.tag ? `(${e.tag})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {envs.length < 2 && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                You need at least two saved environments. Add them on the Environments page.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select content to transfer</CardTitle>
                <CardDescription>
                  Browse the source content tree, or add items manually by path.
                </CardDescription>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={demoTree} onCheckedChange={(v) => setDemoTree(!!v)} />
                Use demo tree
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <ItemTree
              envId={sourceEnvId}
              demo={demoTree}
              selected={selected}
              onToggle={toggleItem}
              onToggleDescendants={toggleDescendants}
            />

            <Separator />

            <div className="grid items-end gap-3 md:grid-cols-[2fr_1.5fr_auto]">
              <div className="grid gap-1.5">
                <Label htmlFor="manual-path">Add item by path</Label>
                <Input
                  id="manual-path"
                  placeholder="/sitecore/content/Home/Products"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="manual-id">Item ID (optional)</Label>
                <Input
                  id="manual-id"
                  placeholder="{GUID}"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={addManual}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {selected.size > 0 && (
              <div className="space-y-2">
                <Label>Selected items ({selected.size})</Label>
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Options & review</CardTitle>
            <CardDescription>Configure transfer behaviour and confirm the summary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3">
              {(
                [
                  ["overwriteExisting", "Overwrite existing items", "Replace items that already exist in the destination"],
                  ["includeRelatedItems", "Include related items", "Also transfer referenced media and data sources"],
                  ["publishAfterTransfer", "Publish after transfer", "Trigger a publish on the destination when done"],
                  ["dryRun", "Dry run (simulation)", "Walk through every step and produce full logs without calling live Sitecore APIs"],
                ] as const
              ).map(([key, label, desc]) => (
                <label
                  key={key}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40",
                    options[key] && "border-primary/50 bg-primary/5"
                  )}
                >
                  <Checkbox
                    checked={options[key]}
                    onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: !!v }))}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {label}
                      {key === "dryRun" && <FlaskConical className="h-3.5 w-3.5 text-amber-500" />}
                    </span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <Separator />

            <div className="grid gap-2 rounded-lg bg-secondary/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route</span>
                <span className="font-medium">
                  {sourceEnv?.name} → {destEnv?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{selected.size} selected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">{options.dryRun ? "Dry run (simulated)" : "Live transfer"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={start} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Start migration
          </Button>
        )}
      </div>
    </div>
  );
}
