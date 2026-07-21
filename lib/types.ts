/** Shared domain types for the Content Transfer application. */

export type EnvironmentAuthType = "clientCredentials" | "token";

export interface EnvironmentProfile {
  id: string;
  /** Owning user (fully-managed mode). Absent for ephemeral one-time environments. */
  userId?: string;
  name: string;
  /** Base URL of the environment's Content Management host, e.g. https://xmc-org-project-env.sitecorecloud.io */
  baseUrl: string;
  /** How to authenticate: OAuth client credentials, or a pre-issued access token. */
  authType: EnvironmentAuthType;
  /** OAuth client credentials used to obtain a bearer token (authType = clientCredentials). */
  clientId: string;
  clientSecret: string;
  /** Pre-issued bearer token (authType = token). */
  token?: string;
  /** OAuth authority / token endpoint host. Defaults to Sitecore Cloud auth. */
  authority?: string;
  /** OAuth audience. */
  audience?: string;
  /** Free-form label, e.g. "UAT", "Production". */
  tag?: string;
  createdAt: string;
  updatedAt: string;
}

export type MigrationStatus =
  | "pending"
  | "running"
  /** TransferState=Finished, no ValidationErrors, item counts match. */
  | "completed"
  /** TransferState=Finished but ValidationErrors present or counts mismatch. */
  | "completedWithIssues"
  /** Blob was Consumed but the API never reported TransferState=Finished — NOT a success. */
  | "unconfirmed"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface MigrationStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  detail?: string;
  error?: string;
}

export type LogLevel = "info" | "success" | "warn" | "error" | "debug";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  step: string;
  message: string;
  data?: unknown;
}

export interface SelectedItem {
  itemId: string;
  path: string;
  name: string;
  includeDescendants: boolean;
}

export interface MigrationOptions {
  /** Overwrite items that already exist in the destination. */
  overwriteExisting: boolean;
  /** Include related items (referenced media, data sources). */
  includeRelatedItems: boolean;
  /** Publish items in destination after transfer. */
  publishAfterTransfer: boolean;
  /** Simulate the transfer without calling live Sitecore APIs. */
  dryRun: boolean;
}

export type MigrationMode = "managed" | "onetime";

export interface Migration {
  id: string;
  /** Owning user (managed mode only). */
  userId?: string;
  /** managed = persisted with logs; onetime = session-only, nothing written to disk. */
  mode: MigrationMode;
  name: string;
  status: MigrationStatus;
  sourceEnvId: string;
  destinationEnvId: string;
  sourceEnvName: string;
  destinationEnvName: string;
  items: SelectedItem[];
  options: MigrationOptions;
  steps: MigrationStep[];
  transferId?: string;
  packageSizeBytes?: number;
  itemsTransferred?: number;
  /** Total items reported by the destination transfer detail (when available). */
  itemsTotal?: number;
  /** The .raif blob name produced by completing the chunk set on the destination. */
  raifFile?: string;
  /** Final TransferState reported by the destination transfers list. */
  confirmedTransferState?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ItemNode {
  itemId: string;
  name: string;
  path: string;
  hasChildren: boolean;
  templateName?: string;
}
