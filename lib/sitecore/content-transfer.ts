/**
 * Content Transfer API wrapper — runs against the SOURCE environment.
 * Docs: https://api-docs.sitecore.com/sai/content-transfer-api
 *
 * Responsible for creating a transfer, building the .raif transfer package
 * (chunked) and exposing its status / download.
 */
import { SitecoreClient } from "./client";
import { sitecoreConfig } from "./config";
import type { SelectedItem, MigrationOptions } from "../types";

const ct = sitecoreConfig.contentTransfer;

export interface CreateTransferResponse {
  transferId?: string;
  id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TransferStatusResponse {
  status?: string;
  state?: string;
  progress?: number;
  itemsProcessed?: number;
  packageSize?: number;
  message?: string;
  [key: string]: unknown;
}

export class ContentTransferApi {
  constructor(private client: SitecoreClient) {}

  /** Initiate a transfer for the selected items on the source environment. */
  createTransfer(items: SelectedItem[], options: MigrationOptions, name: string) {
    return this.client.request<CreateTransferResponse>(`${ct.base}${ct.transfers}`, {
      method: "POST",
      json: {
        name,
        items: items.map((i) => ({
          itemId: i.itemId,
          path: i.path,
          includeDescendants: i.includeDescendants,
        })),
        options: {
          overwriteExisting: options.overwriteExisting,
          includeRelatedItems: options.includeRelatedItems,
        },
      },
    });
  }

  /** Poll transfer/package build status. */
  getStatus(transferId: string) {
    return this.client.request<TransferStatusResponse>(
      `${ct.base}${ct.transferStatus(transferId)}`
    );
  }

  /** Download the assembled .raif transfer package. */
  downloadPackage(transferId: string) {
    return this.client.requestBinary(`${ct.base}${ct.transferPackage(transferId)}`);
  }

  /** Cancel an in-flight transfer. */
  cancel(transferId: string) {
    return this.client.request(`${ct.base}${ct.cancel(transferId)}`, { method: "POST" });
  }
}
