"use client";

import type { MigrationStep } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { Check, Loader2, Minus, X } from "lucide-react";

function StepIcon({ status }: { status: MigrationStep["status"] }) {
  const base = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2";
  switch (status) {
    case "completed":
      return (
        <div className={cn(base, "border-emerald-500 bg-emerald-500 text-white")}>
          <Check className="h-4 w-4" />
        </div>
      );
    case "running":
      return (
        <div className={cn(base, "border-primary bg-primary/10 text-primary")}>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      );
    case "failed":
      return (
        <div className={cn(base, "border-destructive bg-destructive text-white")}>
          <X className="h-4 w-4" />
        </div>
      );
    case "skipped":
      return (
        <div className={cn(base, "border-muted-foreground/30 text-muted-foreground")}>
          <Minus className="h-4 w-4" />
        </div>
      );
    default:
      return <div className={cn(base, "border-muted-foreground/30 bg-card")} />;
  }
}

export function MigrationTimeline({ steps }: { steps: MigrationStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const duration =
          step.startedAt && step.finishedAt
            ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
            : undefined;
        return (
          <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "absolute left-4 top-8 h-full w-0.5 -translate-x-1/2",
                  step.status === "completed" ? "bg-emerald-500/60" : "bg-border"
                )}
              />
            )}
            <StepIcon status={step.status} />
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    step.status === "pending" && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                {duration !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(duration)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {step.detail && (
                <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {step.detail}
                </p>
              )}
              {step.error && (
                <p className="mt-1 break-words rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {step.error}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
