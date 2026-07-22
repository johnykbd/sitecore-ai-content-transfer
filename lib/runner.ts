/**
 * Migration runner — orchestrates the full transfer pipeline, mirroring the
 * verified end-to-end flow:
 *
 *   PHASE 1 — Content Transfer API (both hosts, same paths)
 *     1. create transfer on SOURCE (client-generated TransferId, expect 202)
 *     2. poll SOURCE status until State=Completed → ChunkSetsMetadata
 *     3. per chunk: download from SOURCE, PUT to DESTINATION (expect 201)
 *     4. complete chunk set on DESTINATION → .raif blob name
 *     5. delete transfer on SOURCE (cleanup)
 *
 *   PHASE 2 — Item Transfer API (DESTINATION only)
 *     6. poll blob until BlobState=Uploaded
 *     7. start consume, poll monitor until BlobState=Consumed
 *        (Consumed = ACCEPTED for import, NOT proof of completion!)
 *     8. CONFIRM: poll GET /transfers until the entry with this run's
 *        SourceName reports TransferState=Finished; cross-check the detail
 *        endpoint's ValidationErrors + item counts
 *     9. delete blob only on confirmed success
 *
 * Final status:
 *   completed            Finished + no ValidationErrors + counts match
 *   completedWithIssues  Finished but ValidationErrors / count mismatch
 *   unconfirmed          Consumed but never reported Finished — NOT success
 *   failed               any hard failure along the way
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
import { ItemTransferApi, type TransferListEntry } from "./sitecore/item-transfer";
import { getAccessToken } from "./sitecore/auth";
import { sitecoreConfig } from "./sitecore/config";

const STEP_DEFS: { id: string; label: string; description: string }[] = [
  { id: "validate", label: "Validate configuration", description: "Check environments, items and options" },
  { id: "auth-source", label: "Authenticate source", description: "Verify credentials for the source environment" },
  { id: "auth-destination", label: "Authenticate destination", description: "Verify credentials for the destination environment" },
  { id: "create-transfer", label: "Create transfer", description: "Initiate transfer on source (Content Transfer API, expect 202)" },
  { id: "build-package", label: "Build transfer package", description: "Source assembles the chunk set (poll until State=Completed)" },
  { id: "transfer-chunks", label: "Transfer chunks", description: "Download each chunk from source, upload to destination (expect 201)" },
  { id: "complete-chunkset", label: "Complete chunk set", description: "Assemble the .raif blob on the destination; clean up source transfer" },
  { id: "consume", label: "Consume package", description: "Item Transfer API: blob Uploaded → start import → BlobState=Consumed" },
  { id: "confirm", label: "Confirm completion", description: "Require TransferState=Finished + clean ValidationErrors + matching counts" },
  { id: "cleanup", label: "Clean up", description: "Delete the .raif blob (only after confirmed success)" },
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
  /** Step currently running — HTTP call logs attach to this step. */
  currentStepId = "init";

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
    this.currentStepId = id;
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

  async warnStep(id: string, detail: string) {
    const s = this.step(id);
    s.status = "completed";
    s.finishedAt = new Date().toISOString();
    s.detail = detail;
    await this.save();
    await this.log("warn", id, `${s.label}: ${detail}`);
  }

  async skipStep(id: string, detail: string) {
    const s = this.step(id);
    s.status = "skipped";
    s.detail = detail;
    await this.save();
    await this.log("warn", id, `Skipped: ${s.label} — ${detail}`);
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
      migration.status = "completed";
    } else {
      const envs = await resolveEnvs(migration);
      const outcome = await runLiveTransfer(ctx, envs);
      migration.status = outcome;
    }
    migration.finishedAt = new Date().toISOString();
    await ctx.save();
    if (migration.status === "completed") {
      await ctx.log("success", "done", `Migration "${migration.name}" CONFIRMED complete (TransferState=Finished, clean validation). Remember: items still need to be PUBLISHED to appear live.`);
    } else if (migration.status === "completedWithIssues") {
      await ctx.log("warn", "done", `Migration "${migration.name}" reports Finished, but the transfer detail flags problems (validation errors or count mismatch). Do NOT treat this as a clean success — inspect the logs above.`);
    } else if (migration.status === "unconfirmed") {
      await ctx.log("warn", "done", `Migration "${migration.name}" NOT CONFIRMED: the blob was accepted (Consumed) but the API never reported TransferState=Finished. Do not assume the items are visible in the destination tree.`);
    }
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
function makeHttpLogger(ctx: MigrationContext): SitecoreCallLogger {
  return (call) => {
    const summary = call.error
      ? `${call.method} ${call.url} → ${call.status ?? "ERR"} ${call.statusText ?? ""} (${call.durationMs}ms) — ${call.error}`
      : `${call.method} ${call.url} → ${call.status ?? "-"} ${call.statusText ?? ""} (${call.durationMs}ms)`;
    void ctx.log(call.error ? "warn" : "debug", ctx.currentStepId, summary.trim(), {
      request: call.requestBody,
      response: call.responseBody,
    });
  };
}

/* ------------------------------------------------------------------ */
/* Live transfer — mirrors the verified shell-script flow               */
/* ------------------------------------------------------------------ */
type LiveOutcome = "completed" | "completedWithIssues" | "unconfirmed";

async function runLiveTransfer(
  ctx: MigrationContext,
  envs: { source: EnvironmentProfile; destination: EnvironmentProfile }
): Promise<LiveOutcome> {
  const m = ctx.migration;
  const { source, destination } = envs;
  const { intervalMs, maxAttempts } = sitecoreConfig.polling;
  const database = sitecoreConfig.database;
  const httpLogger = makeHttpLogger(ctx);

  // 1. validate
  await ctx.startStep("validate");
  await ctx.completeStep(
    "validate",
    `${m.items.length} item(s), db=${database}, merge=${m.options.overwriteExisting ? "OverrideExistingItem" : "KeepExistingItem"}`
  );

  // 2-3. auth
  await ctx.startStep("auth-source");
  await getAccessToken(source, httpLogger);
  await ctx.completeStep("auth-source", source.baseUrl);

  await ctx.startStep("auth-destination");
  await getAccessToken(destination, httpLogger);
  await ctx.completeStep("auth-destination", destination.baseUrl);

  const sourceClient = new SitecoreClient(source, httpLogger);
  const destClient = new SitecoreClient(destination, httpLogger);
  const sourceCt = new ContentTransferApi(sourceClient);
  const destCt = new ContentTransferApi(destClient); // chunk upload/complete use CT paths on the DESTINATION host
  const destIt = new ItemTransferApi(destClient);

  // Client-generated transfer id (lowercase uuid, like the script's uuidgen)
  const transferId = randomUUID().toLowerCase();
  m.transferId = transferId;
  await ctx.save();

  // Best-effort cleanup helper for failures after the transfer was created
  const cleanupSourceTransfer = async () => {
    try {
      const code = await sourceCt.deleteTransfer(transferId);
      await ctx.log("info", "cleanup", `Best-effort DELETE of source transfer ${transferId} → HTTP ${code}`);
    } catch {
      /* best effort */
    }
  };

  try {
    // 4. create transfer on source (expects 202)
    await ctx.startStep("create-transfer");
    await sourceCt.createTransfer(transferId, m.items, m.options, database);
    await ctx.log("info", "create-transfer", `Transfer initiated (202 Accepted). TransferId=${transferId}`, {
      DataTrees: m.items.map((i) => i.path),
      Database: database,
    });
    if (m.options.includeRelatedItems) {
      await ctx.log("warn", "create-transfer", "Note: the Content Transfer API has no separate 'related items' switch — related item handling follows the Scope/MergeStrategy of each data tree.");
    }
    await ctx.completeStep("create-transfer", `Transfer ${transferId}`);

    // 5. poll build status until State=Completed
    await ctx.startStep("build-package");
    let state = "";
    let chunkSets: { ChunkSetId: string; ChunkCount: number }[] = [];
    for (let i = 1; i <= maxAttempts; i++) {
      const status = await sourceCt.getStatus(transferId);
      state = String(status.State ?? "");
      await ctx.log("info", "build-package", `Attempt ${i}: State=${state || "<none>"}`, status);
      if (state === "Completed") {
        chunkSets = (status.ChunkSetsMetadata ?? []).map((c) => ({
          ChunkSetId: String(c.ChunkSetId),
          ChunkCount: Number(c.ChunkCount),
        }));
        break;
      }
      if (state === "Failed") {
        throw new Error(`Transfer failed on source: ${JSON.stringify(status).slice(0, 500)}`);
      }
      await sleep(intervalMs);
    }
    if (state !== "Completed") throw new Error(`Package build did not complete within ${maxAttempts} attempts (last State=${state || "<none>"})`);
    if (!chunkSets.length) throw new Error("Source reported Completed but returned no ChunkSetsMetadata");
    const totalChunks = chunkSets.reduce((n, c) => n + c.ChunkCount, 0);
    await ctx.completeStep("build-package", `${chunkSets.length} chunk set(s), ${totalChunks} chunk(s)`);

    // 6. transfer chunks: download from source, PUT to destination (expect 201)
    await ctx.startStep("transfer-chunks");
    let movedBytes = 0;
    for (const cs of chunkSets) {
      for (let chunk = 0; chunk < cs.ChunkCount; chunk++) {
        const { data, isMedia } = await sourceCt.downloadChunk(transferId, cs.ChunkSetId, chunk);
        movedBytes += data.byteLength;
        await ctx.log("info", "transfer-chunks", `Chunk ${chunk} downloaded from source: ${data.byteLength} bytes, IsMedia=${isMedia}`);
        await destCt.uploadChunk(transferId, cs.ChunkSetId, chunk, data, isMedia);
        await ctx.log("info", "transfer-chunks", `Chunk ${chunk} uploaded to destination (201 Created)`);
      }
    }
    m.packageSizeBytes = movedBytes;
    await ctx.save();
    await ctx.completeStep("transfer-chunks", `${totalChunks} chunk(s), ${movedBytes} bytes`);

    // 7. complete chunk set(s) on destination → .raif name; clean up source
    await ctx.startStep("complete-chunkset");
    // Standard case is a single chunk set → a single .raif blob.
    const raifFiles: string[] = [];
    for (const cs of chunkSets) {
      const raif = await destCt.completeChunkSet(transferId, cs.ChunkSetId);
      raifFiles.push(raif);
      await ctx.log("info", "complete-chunkset", `.raif blob created on destination: ${raif}`);
    }
    m.raifFile = raifFiles[0];
    await ctx.save();
    await cleanupSourceTransfer();
    await ctx.completeStep("complete-chunkset", raifFiles.join(", "));

    // ---- PHASE 2: Item Transfer API ----
    const outcomes: LiveOutcome[] = [];
    for (const raif of raifFiles) {
      outcomes.push(await consumeAndConfirm(ctx, destIt, raif, database));
    }
    // Worst outcome wins
    if (outcomes.includes("unconfirmed")) return "unconfirmed";
    if (outcomes.includes("completedWithIssues")) return "completedWithIssues";
    return "completed";
  } catch (err) {
    await cleanupSourceTransfer();
    throw err;
  }
}

/** Phase 2 for one .raif blob: consume, then CONFIRM against the transfers list. */
async function consumeAndConfirm(
  ctx: MigrationContext,
  destIt: ItemTransferApi,
  raif: string,
  database: string
): Promise<LiveOutcome> {
  const m = ctx.migration;
  const { intervalMs, maxAttempts } = sitecoreConfig.polling;

  // 8a. wait for blob to be Uploaded
  await ctx.startStep("consume");
  let blobState = "";
  for (let i = 1; i <= maxAttempts; i++) {
    const res = await destIt.getBlobState(raif);
    const body = typeof res.body === "object" && res.body !== null ? res.body : undefined;
    blobState = String(body?.BlobState ?? "");
    await ctx.log("info", "consume", `Blob check attempt ${i}: BlobState=${blobState || "<none>"} (HTTP ${res.status})`, body ?? res.text);
    if (blobState === "Uploaded") break;
    await sleep(intervalMs);
  }
  if (blobState !== "Uploaded") {
    throw new Error(`Blob '${raif}' never reached 'Uploaded' state (last: ${blobState || "<none>"})`);
  }

  // 8b. start consumption
  const { response: consumeRes, monitorUrl } = await destIt.startConsume(database, raif);
  await ctx.log("info", "consume", `Consume started (HTTP ${consumeRes.status}). Monitoring: ${monitorUrl}`, consumeRes.body ?? consumeRes.text);

  // 8c. poll until the blob is accepted. Per the official walkthrough the
  // monitor reports BlobState=Consumed (or Transferred on some versions) on a
  // clean run; TransferredWithErrors is a TERMINAL partial-success state and
  // any non-null Error is a hard failure.
  const ACCEPTED_STATES = ["Consumed", "Transferred"];
  let consumed = "";
  for (let i = 1; i <= maxAttempts; i++) {
    const res = await destIt.getMonitor(monitorUrl);
    const body = typeof res.body === "object" && res.body !== null ? res.body : undefined;
    consumed = String(body?.BlobState ?? "");
    const error = body?.Error ? String(body.Error) : "";
    await ctx.log("info", "consume", `Monitor attempt ${i}: BlobState=${consumed || "<none>"}${error ? `, Error=${error}` : ""}`, body ?? res.text);
    if (error || consumed === "TransferredWithErrors") {
      throw new Error(`Item transfer failed: ${error || "TransferredWithErrors (partial success — review ValidationErrors in the transfer detail)"}. Full response: ${res.text.slice(0, 500)}`);
    }
    if (ACCEPTED_STATES.includes(consumed)) break;
    await sleep(intervalMs);
  }
  if (!ACCEPTED_STATES.includes(consumed)) {
    throw new Error(`Item transfer did not reach 'Consumed' within timeout (last BlobState: ${consumed || "<none>"})`);
  }
  await ctx.warnStep("consume", `BlobState=${consumed} — blob ACCEPTED for import. This is NOT proof the import finished; confirming next…`);

  // 9. CONFIRM real completion via the transfers list (the only reliable signal)
  await ctx.startStep("confirm");
  let matched: TransferListEntry | undefined;
  let confirmedState = "";
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const list = await destIt.listTransfers();
      matched = (list.Transfers ?? []).find((t) => t.SourceName === raif);
      confirmedState = matched ? String(matched.TransferState ?? "") : "";
      await ctx.log(
        "info",
        "confirm",
        matched
          ? `Attempt ${i}: matched Id=${matched.Id}, TransferState=${confirmedState || "<none>"}`
          : `Attempt ${i}: no transfers-list entry yet for SourceName=${raif}`
      );
      if (confirmedState === "Finished" || confirmedState === "Failed") break;
    } catch (e) {
      await ctx.log("warn", "confirm", `Transfers list poll failed: ${(e as Error).message}`);
    }
    await sleep(intervalMs);
  }
  m.confirmedTransferState = confirmedState || "<no matching entry>";
  await ctx.save();

  if (confirmedState === "Failed") {
    throw new Error(`Item transfer FAILED (TransferState=Failed) for ${raif}`);
  }

  if (confirmedState !== "Finished") {
    // Not a success, not a hard failure — the API never reported completion.
    await ctx.warnStep(
      "confirm",
      `NOT CONFIRMED: TransferState=${confirmedState || "<no matching entry>"} after ${maxAttempts} attempts (expected 'Finished'). Blob shows Consumed, but do not assume the items are in the destination tree.`
    );
    await ctx.skipStep("cleanup", `Blob '${raif}' left on destination for inspection (completion unconfirmed).`);
    return "unconfirmed";
  }

  // Cross-check the detail endpoint (may return 500 — tolerate and fall back)
  let hasValidationErrors = false;
  let countsMismatch = false;
  if (matched?.Id) {
    const detail = await destIt.getTransferDetail(matched.Id);
    const body = typeof detail.body === "object" && detail.body !== null ? detail.body : undefined;
    if (detail.status === 200 && body) {
      const validation = body.ValidationErrors;
      const total = typeof body.TotalItemsCount === "number" ? body.TotalItemsCount : undefined;
      const transferred = typeof body.TransferredItemsCount === "number" ? body.TransferredItemsCount : undefined;
      hasValidationErrors = Array.isArray(validation) && validation.length > 0;
      countsMismatch = total !== undefined && transferred !== undefined && total !== transferred;
      if (typeof transferred === "number") m.itemsTransferred = transferred;
      if (typeof total === "number") m.itemsTotal = total;
      await ctx.save();
      await ctx.log("info", "confirm", `Detail: TotalItemsCount=${total ?? "<none>"}, TransferredItemsCount=${transferred ?? "<none>"}, ValidationErrors=${hasValidationErrors ? JSON.stringify(validation).slice(0, 300) : "none"}`);
    } else {
      await ctx.log("warn", "confirm", `Transfer detail lookup failed (HTTP ${detail.status}) — falling back to the transfers-list TransferState. ValidationErrors/item counts could not be checked this run.`);
    }
  }

  if (hasValidationErrors || countsMismatch) {
    await ctx.warnStep(
      "confirm",
      `TransferState=Finished, BUT ${hasValidationErrors ? "ValidationErrors present" : ""}${hasValidationErrors && countsMismatch ? " and " : ""}${countsMismatch ? `count mismatch (${m.itemsTransferred}/${m.itemsTotal})` : ""} — some items may have silently failed.`
    );
    await ctx.skipStep("cleanup", `Blob '${raif}' left on destination for inspection.`);
    return "completedWithIssues";
  }

  await ctx.completeStep("confirm", `TransferState=Finished, no ValidationErrors${m.itemsTotal ? `, ${m.itemsTransferred}/${m.itemsTotal} items` : ""}`);

  // 10. cleanup — only on confirmed clean success
  await ctx.startStep("cleanup");
  const del = await destIt.deleteBlob(raif);
  await ctx.log("info", "cleanup", `DELETE blob '${raif}' → HTTP ${del.status}`);
  await ctx.completeStep("cleanup", `Blob '${raif}' removed`);
  await ctx.log("warn", "done", "Reminder: transferred items still need to be PUBLISHED to appear live. If an item is invisible in the tree, verify the parent hierarchy exists in the destination with MATCHING item IDs.");
  return "completed";
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
    "create-transfer": `Transfer sim-${m.id.slice(0, 8)} (202 simulated)`,
    "build-package": `1 chunk set, ${m.items.length} item(s) packaged`,
    "transfer-chunks": `${fakePackageSize} bytes moved`,
    "complete-chunkset": `sim-${m.id.slice(0, 8)}.raif`,
    consume: "BlobState=Consumed (simulated)",
    confirm: "TransferState=Finished, no ValidationErrors (simulated)",
    cleanup: "Blob removed (simulated)",
  };

  m.transferId = `sim-${m.id.slice(0, 8)}`;
  m.raifFile = `sim-${m.id.slice(0, 8)}.raif`;

  for (const step of m.steps) {
    await ctx.startStep(step.id);
    await sleep(800 + Math.random() * 1200);
    if (step.id === "transfer-chunks") {
      for (const item of m.items) {
        await ctx.log("info", step.id, `Packaging ${item.path}${item.includeDescendants ? " (+ descendants)" : ""}`);
        await sleep(300);
      }
      m.packageSizeBytes = fakePackageSize;
    }
    if (step.id === "consume") {
      for (const item of m.items) {
        await ctx.log("info", step.id, `Importing ${item.path} into ${m.destinationEnvName}`);
        await sleep(300);
      }
      m.itemsTransferred = m.items.length;
      m.itemsTotal = m.items.length;
    }
    await ctx.completeStep(step.id, details[step.id]);
  }
  m.confirmedTransferState = "Finished (simulated)";
}
