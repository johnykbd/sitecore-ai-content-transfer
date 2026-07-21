import { Badge } from "@/components/ui/badge";
import type { MigrationStatus } from "@/lib/types";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle, Ban } from "lucide-react";

export function StatusBadge({ status }: { status: MigrationStatus }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </Badge>
      );
    case "completedWithIssues":
      return (
        <Badge variant="warning">
          <AlertTriangle className="h-3 w-3" /> Finished with issues
        </Badge>
      );
    case "unconfirmed":
      return (
        <Badge variant="warning">
          <AlertTriangle className="h-3 w-3" /> Unconfirmed
        </Badge>
      );
    case "running":
      return (
        <Badge>
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary">
          <Ban className="h-3 w-3" /> Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <CircleDashed className="h-3 w-3" /> Pending
        </Badge>
      );
  }
}
