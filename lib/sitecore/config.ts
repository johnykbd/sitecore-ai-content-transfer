/**
 * Central configuration for all Sitecore API endpoints.
 *
 * Paths verified against a working end-to-end shell script (based on the
 * official walkthrough: doc.sitecore.com → "Migrate content between
 * SitecoreAI environments"):
 *   - Content Transfer API base: /sitecore/api/content/transfer/v1
 *     (used on the SOURCE for create/status/chunk-download, and on the
 *      DESTINATION for chunk-upload/complete — same paths, different hosts)
 *   - Item Transfer API base:    /sitecore/shell/api/v3/ItemsTransfer
 *     (DESTINATION only: blob state, consume, transfers list/detail)
 *
 * Every value can still be overridden with an environment variable.
 */

export const sitecoreConfig = {
  /** OAuth token endpoint (Sitecore Cloud). */
  authority: process.env.SITECORE_AUTHORITY ?? "https://auth.sitecorecloud.io",
  tokenPath: process.env.SITECORE_TOKEN_PATH ?? "/oauth/token",
  audience: process.env.SITECORE_AUDIENCE ?? "https://api.sitecorecloud.io",

  /** Content Transfer API — chunk packaging & movement. */
  contentTransfer: {
    base: process.env.SITECORE_CT_BASE ?? "/sitecore/api/content/transfer/v1",
    transfers: "/transfers",
    transfer: (transferId: string) => `/transfers/${transferId}`,
    transferStatus: (transferId: string) => `/transfers/${transferId}/status`,
    chunk: (transferId: string, chunkSetId: string, chunk: number) =>
      `/transfers/${transferId}/chunksets/${chunkSetId}/chunks/${chunk}`,
    completeChunkSet: (transferId: string, chunkSetId: string) =>
      `/transfers/${transferId}/chunksets/${chunkSetId}/complete`,
  },

  /** Item Transfer API (destination environment) — imports the .raif blob. */
  itemTransfer: {
    base: process.env.SITECORE_IT_BASE ?? "/sitecore/shell/api/v3/ItemsTransfer",
    blob: (blobName: string) => `/sources/blobs/${blobName}`,
    startConsume: (database: string, blobName: string) =>
      `/transfers/databases/${database}/sources?blobName=${encodeURIComponent(blobName)}`,
    consumeMonitor: (database: string, blobName: string) =>
      `/transfers/databases/${database}/sources/${blobName}`,
    transfers: "/transfers",
    transferDetail: (id: string) => `/transfers/${encodeURIComponent(id)}`,
  },

  /** Default database for transfers. */
  database: process.env.SITECORE_DATABASE ?? "master",

  /** Authoring GraphQL API - used to browse the content tree in the item picker. */
  authoringGraphQL:
    process.env.SITECORE_AUTHORING_GQL ?? "/sitecore/api/authoring/graphql/v1",

  /** Polling behaviour. */
  polling: {
    intervalMs: Number(process.env.SITECORE_POLL_INTERVAL ?? 5000),
    maxAttempts: Number(process.env.SITECORE_POLL_MAX_ATTEMPTS ?? 60),
  },
};
