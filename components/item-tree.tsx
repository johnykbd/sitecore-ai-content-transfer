"use client";

import { useCallback, useEffect, useState } from "react";
import type { ItemNode, SelectedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface ItemTreeProps {
  envId?: string;
  /** One-time mode: inline credentials, used per request and never stored. */
  onetime?: { baseUrl: string; token: string };
  demo: boolean;
  selected: Map<string, SelectedItem>;
  onToggle: (item: ItemNode) => void;
  onToggleDescendants: (itemId: string) => void;
}

interface TreeLevelProps extends ItemTreeProps {
  path: string;
  depth: number;
}

function TreeLevel(props: TreeLevelProps) {
  const { envId, onetime, demo, path, depth, selected, onToggle, onToggleDescendants } = props;
  const [nodes, setNodes] = useState<ItemNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (onetime && !demo) {
        res = await fetch("/api/onetime/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, baseUrl: onetime.baseUrl, token: onetime.token }),
        });
      } else {
        const params = new URLSearchParams({ path });
        if (demo) params.set("demo", "true");
        else if (envId) params.set("envId", envId);
        res = await fetch(`/api/items?${params}`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load items");
      setNodes(json.items);
    } catch (e) {
      setError((e as Error).message);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [envId, onetime, demo, path]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && nodes === null) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground" style={{ paddingLeft: depth * 20 + 8 }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-2 py-2 text-xs text-destructive"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <span className="truncate">{error}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={load}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      </div>
    );
  }

  if (!nodes?.length) {
    return (
      <div className="py-1.5 text-xs text-muted-foreground" style={{ paddingLeft: depth * 20 + 8 }}>
        No children
      </div>
    );
  }

  return (
    <div>
      {nodes.map((node) => {
        const isSelected = selected.has(node.itemId);
        const sel = selected.get(node.itemId);
        const isExpanded = expanded.has(node.itemId);
        return (
          <div key={node.itemId}>
            <div
              className={cn(
                "group flex items-center gap-1.5 rounded-md py-1 pr-2 hover:bg-accent/60",
                isSelected && "bg-primary/5"
              )}
              style={{ paddingLeft: depth * 20 + 4 }}
            >
              <button
                type="button"
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer",
                  !node.hasChildren && "invisible"
                )}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.itemId)) next.delete(node.itemId);
                    else next.add(node.itemId);
                    return next;
                  })
                }
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Checkbox checked={isSelected} onCheckedChange={() => onToggle(node)} />
              {node.hasChildren ? (
                <Folder className="h-4 w-4 text-amber-500" />
              ) : (
                <FileText className="h-4 w-4 text-sky-500" />
              )}
              <span className="truncate text-sm">{node.name}</span>
              {node.templateName && (
                <span className="truncate text-xs text-muted-foreground">{node.templateName}</span>
              )}
              {isSelected && node.hasChildren && (
                <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={sel?.includeDescendants ?? false}
                    onCheckedChange={() => onToggleDescendants(node.itemId)}
                    className="h-3.5 w-3.5"
                  />
                  + descendants
                </label>
              )}
            </div>
            {isExpanded && node.hasChildren && (
              <TreeLevel {...props} path={node.path} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ItemTree(props: ItemTreeProps) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">/sitecore/content</div>
      <TreeLevel {...props} path="/sitecore/content" depth={0} />
    </div>
  );
}
