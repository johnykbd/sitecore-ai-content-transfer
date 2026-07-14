/**
 * Item Transfer API wrapper — runs against the DESTINATION environment.
 * Docs: https://api-docs.sitecore.com/sai/item-transfer-api
 *
 * Responsible for uploading the .raif transfer package, consuming it into
 * the destination content tree, and inspecting transferred items.
 */
import { SitecoreClient } from "./client";
import { sitecoreConfig } from "./config";

const it = sitecoreConfig.itemTransfer;

export interface UploadPackageResponse {
  packageId?: string;
  id?: string;
  [key: string]: unknown;
}

export interface ConsumeStatusResponse {
  status?: string;
  state?: string;
  progress?: number;
  itemsConsumed?: number;
  message?: string;
  [key: string]: unknown;
}

export class ItemTransferApi {
  constructor(private client: SitecoreClient) {}

  /** Upload a .raif transfer package to the destination environment. */
  uploadPackage(pkg: ArrayBuffer, fileName: string) {
    const form = new FormData();
    form.append("package", new Blob([pkg], { type: "application/octet-stream" }), fileName);
    return this.client.request<UploadPackageResponse>(`${it.base}${it.packages}`, {
      method: "POST",
      body: form,
    });
  }

  /** Trigger consumption of an uploaded package into the content tree. */
  consumePackage(packageId: string, overwriteExisting: boolean) {
    return this.client.request(`${it.base}${it.consume(packageId)}`, {
      method: "POST",
      json: { overwriteExisting },
    });
  }

  /** Poll consumption status. */
  getConsumeStatus(packageId: string) {
    return this.client.request<ConsumeStatusResponse>(
      `${it.base}${it.consumeStatus(packageId)}`
    );
  }

  /** Inspect items contained in a transferred package. */
  getPackageItems(packageId: string) {
    return this.client.request(`${it.base}${it.items(packageId)}`);
  }

  /** List transfer sources registered on the destination. */
  getSources() {
    return this.client.request(`${it.base}${it.sources}`);
  }
}
