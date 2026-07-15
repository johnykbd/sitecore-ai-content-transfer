"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register" && password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      if (mode === "register" && json.importedEnvironments > 0) {
        toast.success(
          `Account created. Imported ${json.importedEnvironments} environment(s) from the legacy config file.`
        );
      } else {
        toast.success(mode === "register" ? "Account created." : "Signed in.");
      }
      await refresh();
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle>{mode === "login" ? "Sign in" : "Create your account"}</CardTitle>
          <CardDescription>
            Fully-managed mode: saved environments (encrypted at rest) and full migration history
            with logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password {mode === "register" && "(min 8 characters)"}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {mode === "register" && (
              <div className="grid gap-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={busy} className="mt-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {mode === "login" ? "Sign in" : "Register"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link href="/register" className="text-primary hover:underline">
                  Register
                </Link>
              </>
            ) : (
              <>
                Already registered?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Just need a quick transfer without an account?{" "}
            <Link href="/one-time" className="text-primary hover:underline">
              Run a one-time migration
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
