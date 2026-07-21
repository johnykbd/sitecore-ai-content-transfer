/**
 * Content Transfer API wrapper (/sitecore/api/content/transfer/v1).
 *
 * Runs against BOTH hosts:
 *   - SOURCE: create transfer, poll status, download chunks, delete transfer
 *   - DESTINATION: upload chunks, complete chunk set (returns the .raif name)
 *
 * Request/response shapes verified against a working shell script based on
 * the official Sitecore walkthrough.
 */
import { SitecoreClient, SitecoreApiError } from "./client";
import { sitecoreConfig } from "./config";
import type { SelectedItem, MigrationOptions } from "../types";

const ct = sitecoreConfig.contentTransfer;

export interface ChunkSetMetadata {
  ChunkSetId: string;
  ChunkCount: number;
  [key: string]: unknown;
}

export interface TransferStatusResponse {
  State?: string; // "Pending" | "Running" | "Completed" | "Failed"
  ChunkSetsMetadata?: ChunkSetMetadata[];
  [key: string]: unknown;
}

export interface CompleteChunkSetResponse {
  ContentTransferFileName?: string;
  [key: string]: unknown;
}

/** Map UI options onto the API's DataTrees entries. */
export function buildDataTrees(items: SelectedItem[], options: MigrationOptions) {
  return items.map((i) => ({
    ItemPath: i.path,
    Scope: i.includeDescendants ? "ItemAndDescendants" : "SingleItem",
    MergeStrategy: options.overwriteExisting ? "OverrideExistingItem" : "KeepExistingItem",
  }));
}

export class ContentTransferApi {
  constructor(private client: SitecoreClient) {}

  /**
   * Initiate a transfer on the source. The TransferId is CLIENT-generated;
   * the API replies 202 Accepted (any other status is a failure).
   */
  async createTransfer(
    transferId: string,
    items: SelectedItem[],
    options: MigrationOptions,
    database: string
  ) {
    const res = await this.client.raw(`${ct.base}${ct.transfers}`, {
      method: "POST",
      json: {
        TransferId: transferId,
        Configuration: {
          DataTrees: buildDataTrees(items, options),
          Database: database,
        },
      },
    });
    if (res.status !== 202) {
      throw new SitecoreApiError(
        `Initiate transfer failed (HTTP ${res.status}, expected 202). ` +
          `If the error mentions existing/concurrent transfers, delete leftover transfers ` +
          `from earlier runs first. Response: ${res.text.slice(0, 500)}`,
        res.status,
        res.text
      );
    }
    return res;
  }

  /** Poll transfer/package build status on the source. */
  getStatus(transferId: string) {
    return this.client.request<TransferStatusResponse>(
      `${ct.base}${ct.transferStatus(transferId)}`
    );
  }

  /** Download one chunk from the source; IsMedia comes from Content-Disposition. */
  async downloadChunk(transferId: string, chunkSetId: string, chunk: number) {
    const { data, headers } = await this.client.downloadBinary(
      `${ct.base}${ct.chunk(transferId, chunkSetId, chunk)}`
    );
    const disposition = headers.get("content-disposition") ?? "";
    const isMedia = /IsMedia=([a-zA-Z]+)/i.exec(disposition)?.[1]?.toLowerCase() === "true";
    return { data, isMedia };
  }

  /** Upload one chunk to the destination (PUT, expects 201 Created). */
  async uploadChunk(
    transferId: string,
    chunkSetId: string,
    chunk: number,
    data: ArrayBuffer,
    isMedia: boolean
  ) {
    const res = await this.client.uploadBinary(
      `${ct.base}${ct.chunk(transferId, chunkSetId, chunk)}?isMedia=${isMedia}`,
      data
    );
    if (res.status !== 201) {
      throw new SitecoreApiError(
        `Upload of chunk ${chunk} failed (HTTP ${res.status}, expected 201). ` +
          `Response: ${res.text.slice(0, 500)}`,
        res.status,
        res.text
      );
    }
    return res;
  }

  /**
   * Complete the chunk set on the destination. Returns the .raif blob name
   * (ContentTransferFileName) that the Item Transfer API consumes next.
   */
  async completeChunkSet(transferId: string, chunkSetId: string): Promise<string> {
    const res = await this.client.raw<CompleteChunkSetResponse>(
      `${ct.base}${ct.completeChunkSet(transferId, chunkSetId)}`,
      { method: "POST", headers: { "Content-Length": "0" } }
    );
    const body = typeof res.body === "object" && res.body !== null ? res.body : undefined;
    if (!body) {
      throw new SitecoreApiError(
        `Complete-chunk-set response is not valid JSON (HTTP ${res.status}). Likely causes: ` +
          `expired token (~15 min lifetime), wrong TransferId/ChunkSetId, or the chunk set was ` +
          `already completed by a prior run. Response: ${res.text.slice(0, 500)}`,
        res.status,
        res.text
      );
    }
    const raif = body.ContentTransferFileName;
    if (!raif) {
      throw new SitecoreApiError(
        `Failed to get .raif file name from complete response: ${res.text.slice(0, 500)}`,
        res.status,
        res.text
      );
    }
    return raif;
  }

  /** Delete a transfer (cleanup). 2xx and 404 both count as "gone". */
  async deleteTransfer(transferId: string): Promise<number> {
    const res = await this.client.raw(`${ct.base}${ct.transfer(transferId)}`, {
      method: "DELETE",
      headers: { "Content-Length": "0" },
    });
    return res.status;
  }
}
