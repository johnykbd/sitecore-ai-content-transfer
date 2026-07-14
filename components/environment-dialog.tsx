"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { KeyRound, Loader2, Ticket } from "lucide-react";
import type { EnvironmentAuthType } from "@/lib/types";

export interface EnvironmentFormValues {
  id?: string;
  name: string;
  baseUrl: string;
  authType: EnvironmentAuthType;
  clientId: string;
  clientSecret: string;
  token: string;
  authority?: string;
  audience?: string;
  tag?: string;
}

const empty: EnvironmentFormValues = {
  name: "",
  baseUrl: "",
  authType: "clientCredentials",
  clientId: "",
  clientSecret: "",
  token: "",
  authority: "",
  audience: "",
  tag: "",
};

export function EnvironmentDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<EnvironmentFormValues> | null;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<EnvironmentFormValues>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(initial ? { ...empty, ...initial } : empty);
  }, [initial, open]);

  const set = (key: keyof EnvironmentFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function save() {
    if (!values.name || !values.baseUrl) {
      toast.error("Name and base URL are required.");
      return;
    }
    if (values.authType === "clientCredentials" && !values.clientId) {
      toast.error("Client ID is required for client-credentials auth.");
      return;
    }
    if (values.authType === "token" && !values.token && !values.id) {
      toast.error("An access token is required for token auth.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save environment");
      toast.success(`Environment "${json.name}" saved.`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const authOptions: { value: EnvironmentAuthType; label: string; icon: typeof KeyRound }[] = [
    { value: "clientCredentials", label: "Client ID + secret", icon: KeyRound },
    { value: "token", label: "Access token", icon: Ticket },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{values.id ? "Edit environment" : "Add environment"}</DialogTitle>
          <DialogDescription>
            Connection profile for a Sitecore environment. Secrets and tokens are encrypted
            (AES-256-GCM) before being stored in the database and are never sent back to the
            browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="env-name">Name *</Label>
              <Input id="env-name" placeholder="UAT" value={values.name} onChange={set("name")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="env-tag">Tag</Label>
              <Input id="env-tag" placeholder="non-prod" value={values.tag} onChange={set("tag")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="env-url">Base URL (Content Management host) *</Label>
            <Input
              id="env-url"
              placeholder="https://xmc-org-project-env.sitecorecloud.io"
              value={values.baseUrl}
              onChange={set("baseUrl")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Authentication method</Label>
            <div className="grid grid-cols-2 gap-2">
              {authOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, authType: opt.value }))}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    values.authType === opt.value
                      ? "border-primary bg-primary/5 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {values.authType === "clientCredentials" ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="env-client">OAuth client ID *</Label>
                <Input id="env-client" value={values.clientId} onChange={set("clientId")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="env-secret">
                  OAuth client secret {values.id ? "(leave blank to keep)" : "*"}
                </Label>
                <Input
                  id="env-secret"
                  type="password"
                  value={values.clientSecret}
                  onChange={set("clientSecret")}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="env-token">
                Access token {values.id ? "(leave blank to keep)" : "*"}
              </Label>
              <Input
                id="env-token"
                type="password"
                placeholder="Bearer token for this environment"
                value={values.token}
                onChange={set("token")}
              />
              <p className="text-xs text-muted-foreground">
                Note: tokens usually expire — you may need to update this before each migration.
              </p>
            </div>
          )}

          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Advanced (auth overrides)
            </summary>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="env-authority">Authority</Label>
                <Input
                  id="env-authority"
                  placeholder="https://auth.sitecorecloud.io"
                  value={values.authority}
                  onChange={set("authority")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="env-audience">Audience</Label>
                <Input
                  id="env-audience"
                  placeholder="https://api.sitecorecloud.io"
                  value={values.audience}
                  onChange={set("audience")}
                />
              </div>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save environment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
