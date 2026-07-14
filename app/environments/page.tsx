"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { EnvironmentProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EnvironmentDialog,
  type EnvironmentFormValues,
} from "@/components/environment-dialog";
import { Globe, KeyRound, Loader2, Pencil, Plug, Plus, Server, Ticket, Trash2 } from "lucide-react";
import { useRequireAuth } from "@/lib/use-auth";

export default function EnvironmentsPage() {
  const { user } = useRequireAuth();
  const [envs, setEnvs] = useState<EnvironmentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<EnvironmentFormValues> | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/environments");
    const json = await res.json();
    setEnvs(Array.isArray(json) ? json : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function testConnection(env: EnvironmentProfile) {
    setTesting(env.id);
    try {
      const res = await fetch(`/api/environments/${env.id}/test`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        toast.success(`"${env.name}" authenticated successfully (${json.latencyMs}ms).`);
      } else {
        toast.error(`"${env.name}" connection failed: ${json.error}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(null);
    }
  }

  async function remove(env: EnvironmentProfile) {
    if (!confirm(`Delete environment "${env.name}"?`)) return;
    await fetch(`/api/environments/${env.id}`, { method: "DELETE" });
    toast.success(`Environment "${env.name}" deleted.`);
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
          <p className="text-sm text-muted-foreground">
            Saved Sitecore environment profiles used as migration sources and destinations.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add environment
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : envs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Server className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium">No environments yet</p>
              <p className="text-sm text-muted-foreground">
                Add your source and destination Sitecore environments to start migrating content.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add environment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {envs.map((env) => (
            <Card key={env.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{env.name}</CardTitle>
                    {env.tag && <Badge variant="secondary">{env.tag}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing({ ...env });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(env)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="flex items-center gap-1.5 break-all">
                  <Globe className="h-3.5 w-3.5 shrink-0" /> {env.baseUrl}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {env.authType === "token" ? (
                    <>
                      <Ticket className="h-3.5 w-3.5" />
                      <span>Access token (encrypted)</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-3.5 w-3.5" />
                      <span className="font-mono">{(env.clientId ?? "").slice(0, 18)}…</span>
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection(env)}
                  disabled={testing === env.id}
                >
                  {testing === env.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4" />
                  )}
                  Test connection
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EnvironmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={load}
      />
    </div>
  );
}
