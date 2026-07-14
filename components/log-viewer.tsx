"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const levelStyles: Record<LogEntry["level"], string> = {
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
  debug: "text-muted-foreground",
};

export function LogViewer({ logs, autoScroll = true }: { logs: LogEntry[]; autoScroll?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs.length, autoScroll]);

  if (!logs.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No log entries yet.
      </div>
    );
  }

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
      {logs.map((entry, i) => (
        <div key={i} className="flex gap-3 whitespace-pre-wrap break-all py-0.5">
          <span className="shrink-0 text-zinc-500">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
          <span className={cn("shrink-0 w-14 uppercase", levelStyles[entry.level])}>
            {entry.level}
          </span>
          <span className="shrink-0 w-36 truncate text-zinc-500">[{entry.step}]</span>
          <span>{entry.message}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
