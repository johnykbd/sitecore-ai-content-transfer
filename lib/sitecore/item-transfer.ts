/**
 * Item Transfer API wrapper (/sitecore/shell/api/v3/ItemsTransfer).
 * Runs against the DESTINATION environment only.
 *
 * CRITICAL: BlobState=Consumed only means the destination ACCEPTED the blob
 * for import — it is NOT proof the item import finished. Real completion is
 * confirmed via GET /transfers (TransferState=Finished on the entry whose
 * SourceName matches this run's .raif name), then cross-checked against the
 * detail endpoint's ValidationErrors / TotalItemsCount / TransferredItemsCount.
 */
import { SitecoreClient } from "./client";
import { sitecoreConfig } from "./config";

const it = sitecoreConfig.itemTransfer;

export interface BlobStateResponse {
  BlobState?: string; // "Uploaded" | "Consumed" | "TransferredWithErrors" | ...
  Error?: string | null;
  SourceName?: string;
  Name?: string;
  [key: string]: unknown;
}

export interface TransferListEntry {
  Id: string;
  SourceName?: string;
  TransferState?: string; // "Unknown" | "Finished" | "Failed" | ...
  [key: string]: unknown;
}

export interface TransfersListResponse {
  Transfers?: TransferListEntry[];
  [key: string]: unknown;
}

export interface TransferDetailResponse {
  ValidationErrors?: unknown[] | null;
  TotalItemsCount?: number;
  TransferredItemsCount?: number;
  [key: string]: unknown;
}

export class ItemTransferApi {
  constructor(private client: SitecoreClient) {}

  /** Blob state on the destination (used both pre- and post-consume). */
  getBlobState(blobName: string) {
    return this.client.raw<BlobStateResponse>(`${it.base}${it.blob(blobName)}`);
  }

  /**
   * Start consumption of the .raif blob into the given database.
   * Returns the monitor URL: the Location header when present, otherwise the
   * constructed sources/{blobName} resource.
   */
  async startConsume(database: string, blobName: string) {
    const res = await this.client.raw(`${it.base}${it.startConsume(database, blobName)}`, {
      method: "POST",
      headers: { "Content-Length": "0" },
    });
    const location = res.headers.get("location");
    const monitorUrl = location || `${it.base}${it.consumeMonitor(database, blobName)}`;
    return { response: res, monitorUrl };
  }

  /** Poll the consume monitor resource (blob-shaped response). */
  getMonitor(monitorUrl: string) {
    return this.client.raw<BlobStateResponse>(monitorUrl);
  }

  /** List all item transfers on the destination (source of truth for completion). */
  listTransfers() {
    return this.client.request<TransfersListResponse>(`${it.base}${it.transfers}`);
  }

  /**
   * Per-transfer detail (ValidationErrors, item counts). This endpoint has
   * been observed returning HTTP 500 for valid Ids — callers must tolerate
   * failure and fall back to the list's TransferState.
   */
  getTransferDetail(id: string) {
    return this.client.raw<TransferDetailResponse>(`${it.base}${it.transferDetail(id)}`);
  }

  /** Delete the .raif blob (cleanup — only after CONFIRMED success). */
  deleteBlob(blobName: string) {
    return this.client.raw(`${it.base}${it.blob(blobName)}`, {
      method: "DELETE",
      headers: { "Content-Length": "0" },
    });
  }
}
