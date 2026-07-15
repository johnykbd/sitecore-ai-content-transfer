/**
 * Migration runner — orchestrates the full transfer pipeline:
 *
 *   SOURCE (Content Transfer API)              DESTINATION (Item Transfer API)
 *   1. authenticate                            4. authenticate
 *   2. create transfer + build .raif package   5. upload package
 *   3. poll build status, download package     6. consume package into content tree
 *                                              7. poll consume status
 *
 * Two persistence modes:
 *   - managed: migration state + logs written to disk (data/), scoped to a user
 *   - onetime: everything lives in server memory only; tokens and logs are
 *     never written to disk
 */
import { randomUUID } from "crypto";
import type {
  EnvironmentProfile,
  LogEntry,
  LogLevel,
  Migration,
  MigrationMode,
  MigrationOptions,
  MigrationStep,
  SelectedItem,
} from "./types";
import { getEnvironment } from "./store/environments";
import { appendLog, getMigration, saveMigration } from "./store/migrations";
import {
  appendEphemeralLog,
  getEphemeralEnvs,
  getEphemeralMigration,
  putEphemeralMigration,
  saveEphemeralMigration,
} from "./store/ephemeral";
import { SitecoreClient, type SitecoreCallLogger } from "./sitecore/client";
import { ContentTransferApi } from "./sitecore/content-transfer";
import { ItemTransferApi } from "./sitecore/item-transfer";
import { getAccessToken } from "./sitecore/auth";
import { sitecoreConfig } from "./sitecore/config";

const STEP_DEFS: { id: string; label: string; description: string }[] = [
  { id: "validate", label: "Validate configuration", description: "Check environments, items and options" },
  { id: "auth-source", label: "Authenticate source", description: "Verify credentials for the source environment" },
  { id: "auth-destination", label: "Authenticate destination", description: "Verify credentials for the destination environment" },
  { id: "create-transfer", label: "Create transfer", description: "Initiate transfer on source via Content Transfer API" },
  { id: "build-package", label: "Build transfer package", description: "Source assembles the chunked .raif package" },
  { id: "download-package", label: "Download package", description: "Retrieve the .raif package from the source" },
  { id: "upload-package", label: "Upload to destination", description: "Push package to destination via Item Transfer API" },
  { id: "consume-package", label: "Consume package", description: "Import items into the destination content tree" },
  { id: "verify", label: "Verify & finalize", description: "Confirm consumption status and finish" },
];

export function buildSteps(): MigrationStep[] {
  return STEP_DEFS.map((s) => ({ ...s, status: "pending" }));
}

/* ------------------------------------------------------------------ */
/* Store abstraction: disk (managed) vs memory (one-time)              */
/* ------------------------------------------------------------------ */
interface RunnerStore {
  get(id: string): Promise<Migration | undefined>;
  save(migration: Migration): Promise<void>;
  log(id: string, entry: LogEntry): Promise<void>;
}

const managedStore: RunnerStore = {
  get: (id) => getMigration(id),
  save: (m) => saveMigration(m),
  log: (id, e) => appendLog(id, e),
};

const ephemeralStore: RunnerStore = {
  get: async (id) => getEphemeralMigration(id),
  save: async (m) => saveEphemeralMigration(m),
  log: async (id, e) => appendEphemeralLog(id, e),
};

function storeFor(mode: MigrationMode): RunnerStore {
  return mode === "onetime" ? ephemeralStore : managedStore;
}

// Keep track of running migrations in this server process.
const running = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MigrationContext {
  constructor(
    public migration: Migration,
    private store: RunnerStore
  ) {}

  async log(level: LogLevel, step: string, message: string, data?: unknown) {
    await this.store.log(this.migration.id, {
      ts: new Date().toISOString(),
      level,
      step,
      message,
      data,
    });
  }

  async save() {
    await this.store.save(this.migration);
  }

  step(id: string): MigrationStep {
    const s = this.migration.steps.find((s) => s.id === id);
    if (!s) throw new Error(`Unknown step ${id}`);
    return s;
  }

  async startStep(id: string) {
    const s = this.step(id);
    s.status = "running";
    s.startedAt = new Date().toISOString();
    await this.save();
    await this.log("info", id, `Started: ${s.label}`);
  }

  async completeStep(id: string, detail?: string) {
    const s = this.step(id);
    s.status = "completed";
    s.finishedAt = new Date().toISOString();
    if (detail) s.detail = detail;
    await this.save();
    await this.log("success", id, `Completed: ${s.label}${detail ? ` — ${detail}` : ""}`);
  }

  async failStep(id: string, error: Error) {
    const s = this.step(id);
    s.status = "failed";
    s.finishedAt = new Date().toISOString();
    s.error = error.message;
    this.migration.status = "failed";
    this.migration.error = error.message;
    this.migration.finishedAt = new Date().toISOString();
    await this.save();
    await this.log("error", id, `Failed: ${s.label} — ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Creation                                                             */
/* ------------------------------------------------------------------ */

export async function createMigration(input: {
  name: string;
  sourceEnvId: string;
  destinationEnvId: string;
  items: SelectedItem[];
  options: MigrationOptions;
  userId: string;
}): Promise<Migration> {
  const [source, destination] = await Promise.all([
    getEnvironment(input.sourceEnvId, input.userId),
    getEnvironment(input.destinationEnvId, input.userId),
  ]);
  if (!source) throw new Error("Source environment not found");
  if (!destination) throw new Error("Destination environment not found");
  if (source.id === destination.id)
    throw new Error("Source and destination must be different environments");
  if (!input.items.length) throw new Error("Select at least one item to transfer");

  const migration: Migration = {
    id: randomUUID(),
    userId: input.userId,
    mode: "managed",
    name: input.name || `Migration ${new Date().toLocaleString()}`,
    status: "pending",
    sourceEnvId: source.id,
    destinationEnvId: destination.id,
    sourceEnvName: source.name,
    destinationEnvName: destination.name,
    items: input.items,
    options: input.options,
    steps: buildSteps(),
    createdAt: new Date().toISOString(),
  };
  await saveMigration(migration);
  await appendLog(migration.id, {
    ts: new Date().toISOString(),
    level: "info",
    step: "init",
    message: `Migration "${migration.name}" created: ${source.name} → ${destination.name}, ${input.items.length} item(s)${input.options.dryRun ? " [DRY RUN]" : ""}`,
    data: { items: input.items, options: input.options },
  });
  return migration;
}

export interface OneTimeEnvInput {
  name?: string;
  baseUrl: string;
  token: string;
}

export async function createOneTimeMigration(input: {
  name: string;
  source: OneTimeEnvInput;
  destination: OneTimeEnvInput;
  items: SelectedItem[];
  options: MigrationOptions;
}): Promise<Migration> {
  if (!input.source?.baseUrl || !input.destination?.baseUrl)
    throw new Error("Source and destination URLs are required");
  if (!input.options.dryRun && (!input.source.token || !input.destination.token))
    throw new Error("Access tokens are required for both environments");
  if (input.source.baseUrl.replace(/\/$/, "") === input.destination.baseUrl.replace(/\/$/, ""))
    throw new Error("Source and destination must be different environments");
  if (!input.items.length) throw new Error("Select at least one item to transfer");

  const now = new Date().toISOString();
  const makeEnv = (e: OneTimeEnvInput, fallback: string): EnvironmentProfile => ({
    id: randomUUID(),
    name: e.name || fallback,
    baseUrl: e.baseUrl.replace(/\/$/, ""),
    authType: "token",
    clientId: "",
    clientSecret: "",
    token: e.token,
    createdAt: now,
    updatedAt: now,
  });
  const source = makeEnv(input.source, "Source");
  const destination = makeEnv(input.destination, "Destination");

  const migration: Migration = {
    id: randomUUID(),
    mode: "onetime",
    name: input.name || `One-time transfer ${new Date().toLocaleString()}`,
    status: "pending",
    sourceEnvId: source.id,
    destinationEnvId: destination.id,
    sourceEnvName: source.name,
    destinationEnvName: destination.name,
    items: input.items,
    options: input.options,
    steps: buildSteps(),
    createdAt: now,
  };
  putEphemeralMigration(migration, { source, destination });
  appendEphemeralLog(migration.id, {
    ts: now,
    level: "info",
    step: "init",
    message: `One-time migration "${migration.name}" created (session only — no credentials or logs are saved to disk).`,
    data: { items: input.items, options: input.options },
  });
  return migration;
}

/* ------------------------------------------------------------------ */
/* Execution                                                            */
/* ------------------------------------------------------------------ */

/** Fire-and-forget start; progress is polled from the store. */
export function startMigration(id: string, mode: MigrationMode = "managed") {
  if (running.has(id)) return;
  running.add(id);
  void runMigration(id, mode).finally(() => running.delete(id));
}

async function resolveEnvs(migration: Migration) {
  if (migration.mode === "onetime") {
    const envs = getEphemeralEnvs(migration.id);
    if (!envs) throw new Error("One-time session expired — credentials no longer in memory");
    return envs;
  }
  const [source, destination] = await Promise.all([
    getEnvironment(migration.sourceEnvId),
    getEnvironment(migration.destinationEnvId),
  ]);
  if (!source || !destination) throw new Error("Environment profile missing");
  return { source, destination };
}

async function runMigration(id: string, mode: MigrationMode) {
  const store = storeFor(mode);
  const migration = await store.get(id);
  if (!migration || migration.status === "running") return;

  migration.status = "running";
  migration.startedAt = new Date().toISOString();
  await store.save(migration);

  const ctx = new MigrationContext(migration, store);

  try {
    if (migration.options.dryRun) {
      await runDrySimulation(ctx);
    } else {
      const envs = await resolveEnvs(migration);
      await runLiveTransfer(ctx, envs);
    }
    migration.status = "completed";
    migration.finishedAt = new Date().toISOString();
    await ctx.save();
    await ctx.log("success", "done", `Migration "${migration.name}" completed successfully.`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const runningStep = migration.steps.find((s) => s.status === "running");
    if (runningStep) {
      await ctx.failStep(runningStep.id, error);
    } else {
      migration.status = "failed";
      migration.error = error.message;
      migration.finishedAt = new Date().toISOString();
      await ctx.save();
      await ctx.log("error", "run", error.message);
    }
  }
}

/**
 * Every Sitecore HTTP call (request + response, tokens redacted) is logged
 * against whichever step is currently running, so the migration log reads
 * as a step-by-step record of exactly what was sent to/received from
 * Sitecore — useful for debugging without exposing credentials.
 */
function makeHttpLogger(ctx: MigrationContext, stepRef: { current: string }): SitecoreCallLogger {
  return (call) => {
    const summary = call.error
      ? `${call.method} ${call.url} → ${call.status ?? "ERR"} ${call.statusText ?? ""} (${call.durationMs}ms) — ${call.error}`
      : `${call.method} ${call.url} → ${call.status ?? "-"} ${call.statusText ?? ""} (${call.durationMs}ms)`;
    void ctx.log(call.error ? "warn" : "debug", stepRef.current, summary.trim(), {
      request: call.requestBody,
      response: call.responseBody,
    });
  };
}

/* ------------------------------------------------------------------ */
/* Live transfer against real Sitecore environments                    */
/* ------------------------------------------------------------------ */
async function runLiveTransfer(
  ctx: MigrationContext,
  envs: { source: EnvironmentProfile; destination: EnvironmentProfile }
) {
  const m = ctx.migration;
  const { source, destination } = envs;
  const stepRef = { current: "validate" };
  const httpLogger = makeHttpLogger(ctx, stepRef);

  // 1. validate
  await ctx.startStep("validate");
  await ctx.completeStep(
    "validate",
    `${m.items.length} item(s), overwrite=${m.options.overwriteExisting}, related=${m.options.includeRelatedItems}`
  );

  // 2-3. auth
  stepRef.current = "auth-source";
  await ctx.startStep("auth-source");
  await getAccessToken(source, httpLogger);
  await ctx.completeStep("auth-source", source.baseUrl);

  stepRef.current = "auth-destination";
  await ctx.startStep("auth-destination");
  await getAccessToken(destination, httpLogger);
  await ctx.completeStep("auth-destination", destination.baseUrl);

  const sourceApi = new ContentTransferApi(new SitecoreClient(source, httpLogger));
  const destApi = new ItemTransferApi(new SitecoreClient(destination, httpLogger));

  // 4. create transfer
  stepRef.current = "create-transfer";
  await ctx.startStep("create-transfer");
  const created = await sourceApi.createTransfer(m.items, m.options, m.name);
  const transferId = created.transferId ?? created.id;
  if (!transferId) throw new Error("Source did not return a transfer id");
  m.transferId = String(transferId);
  await ctx.save();
  await ctx.log("info", "create-transfer", `Transfer id: ${transferId}`, created);
  await ctx.completeStep("create-transfer", `Transfer ${transferId}`);

  // 5. poll package build
  stepRef.current = "build-package";
  await ctx.startStep("build-package");
  const buildStatus = await pollUntil(
    () => sourceApi.getStatus(m.transferId!),
    (s) => normalizeStatus(s.status ?? s.state),
    async (s, state) => {
      await ctx.log("info", "build-package", `Package build status: ${state}`, s);
    }
  );
  if (typeof buildStatus.packageSize === "number") {
    m.packageSizeBytes = buildStatus.packageSize;
  }
  if (typeof buildStatus.itemsProcessed === "number") {
    m.itemsTransferred = buildStatus.itemsProcessed;
  }
  await ctx.save();
  await ctx.completeStep("build-package");

  // 6. download package
  stepRef.current = "download-package";
  await ctx.startStep("download-package");
  const pkg = await sourceApi.downloadPackage(m.transferId!);
  m.packageSizeBytes = pkg.byteLength;
  await ctx.save();
  await ctx.completeStep("download-package", `${pkg.byteLength} bytes (.raif)`);

  // 7. upload to destination
  stepRef.current = "upload-package";
  await ctx.startStep("upload-package");
  const uploaded = await destApi.uploadPackage(pkg, `${m.transferId}.raif`);
  const packageId = uploaded.packageId ?? uploaded.id ?? m.transferId!;
  await ctx.log("info", "upload-package", `Destination package id: ${packageId}`, uploaded);
  await ctx.completeStep("upload-package", `Package ${packageId}`);

  // 8. consume
  stepRef.current = "consume-package";
  await ctx.startStep("consume-package");
  await destApi.consumePackage(String(packageId), m.options.overwriteExisting);
  const consumeStatus = await pollUntil(
    () => destApi.getConsumeStatus(String(packageId)),
    (s) => normalizeStatus(s.status ?? s.state),
    async (s, state) => {
      await ctx.log("info", "consume-package", `Consume status: ${state}`, s);
    }
  );
  if (typeof consumeStatus.itemsConsumed === "number") {
    m.itemsTransferred = consumeStatus.itemsConsumed;
  }
  await ctx.save();
  await ctx.completeStep("consume-package");

  // 9. verify
  stepRef.current = "verify";
  await ctx.startStep("verify");
  try {
    const items = await destApi.getPackageItems(String(packageId));
    await ctx.log("info", "verify", "Transferred items inspected on destination", items);
  } catch (e) {
    await ctx.log("warn", "verify", `Item inspection not available: ${(e as Error).message}`);
  }
  await ctx.completeStep("verify");
}

function normalizeStatus(status?: string): "pending" | "completed" | "failed" {
  const s = (status ?? "").toLowerCase();
  if (["completed", "complete", "succeeded", "success", "finished", "done"].includes(s))
    return "completed";
  if (["failed", "error", "cancelled", "canceled", "aborted"].includes(s)) return "failed";
  return "pending";
}

async function pollUntil<T>(
  fetcher: () => Promise<T>,
  classify: (result: T) => "pending" | "completed" | "failed",
  onTick?: (result: T, state: string) => Promise<void>
): Promise<T> {
  const { intervalMs, maxAttempts } = sitecoreConfig.polling;
  let last: T;
  for (let i = 0; i < maxAttempts; i++) {
    last = await fetcher();
    const state = classify(last);
    if (onTick) await onTick(last, state);
    if (state === "completed") return last;
    if (state === "failed") {
      throw new Error(`Remote operation failed: ${JSON.stringify(last).slice(0, 300)}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${maxAttempts} polling attempts`);
}

/* ------------------------------------------------------------------ */
/* Dry-run simulation — walks the same steps without live API calls    */
/* ------------------------------------------------------------------ */
async function runDrySimulation(ctx: MigrationContext) {
  const m = ctx.migration;
  await ctx.log("warn", "init", "Dry run enabled — no live Sitecore API calls will be made.");

  const fakePackageSize = 1024 * (200 + Math.floor(Math.random() * 4000));
  const details: Record<string, string> = {
    validate: `${m.items.length} item(s) validated`,
    "auth-source": `${m.sourceEnvName} (simulated token)`,
    "auth-destination": `${m.destinationEnvName} (simulated token)`,
    "create-transfer": `Transfer sim-${m.id.slice(0, 8)}`,
    "build-package": `${m.items.length} item(s) packaged`,
    "download-package": `${fakePackageSize} bytes (.raif)`,
    "upload-package": `Package sim-${m.id.slice(0, 8)} uploaded`,
    "consume-package": `${m.items.length} item(s) imported`,
    verify: "Simulation verified",
  };

  m.transferId = `sim-${m.id.slice(0, 8)}`;

  for (const step of m.steps) {
    await ctx.startStep(step.id);
    await sleep(800 + Math.random() * 1200);
    if (step.id === "build-package") {
      for (const item of m.items) {
        await ctx.log("info", step.id, `Packaging ${item.path}${item.includeDescendants ? " (+ descendants)" : ""}`);
        await sleep(300);
      }
      m.packageSizeBytes = fakePackageSize;
    }
    if (step.id === "consume-package") {
      for (const item of m.items) {
        await ctx.log("info", step.id, `Importing ${item.path} into ${m.destinationEnvName}`);
        await sleep(300);
      }
      m.itemsTransferred = m.items.length;
    }
    await ctx.completeStep(step.id, details[step.id]);
  }
}
