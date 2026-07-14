/**
 * Central configuration for all Sitecore API endpoints.
 *
 * All paths are kept in one place so they can be adjusted easily against
 * the official docs:
 *   - https://api-docs.sitecore.com/sai/content-transfer-api  (runs on the SOURCE environment)
 *   - https://api-docs.sitecore.com/sai/item-transfer-api     (runs on the DESTINATION environment)
 *
 * Every value can be overridden with an environment variable.
 */

export const sitecoreConfig = {
  /** OAuth token endpoint (Sitecore Cloud). */
  authority: process.env.SITECORE_AUTHORITY ?? "https://auth.sitecorecloud.io",
  tokenPath: process.env.SITECORE_TOKEN_PATH ?? "/oauth/token",
  audience: process.env.SITECORE_AUDIENCE ?? "https://api.sitecorecloud.io",

  /** Content Transfer API (source environment) - creates and manages transfer packages. */
  contentTransfer: {
    base: process.env.SITECORE_CT_BASE ?? "/sitecore/api/content/transfer/v1",
    transfers: "/transfers", // POST create transfer, GET list
    transferStatus: (transferId: string) => `/transfers/${transferId}/status`,
    transferPackage: (transferId: string) => `/transfers/${transferId}/package`,
    transferChunks: (transferId: string) => `/transfers/${transferId}/chunks`,
    cancel: (transferId: string) => `/transfers/${transferId}/cancel`,
  },

  /** Item Transfer API (destination environment) - consumes transfer packages. */
  itemTransfer: {
    base: process.env.SITECORE_IT_BASE ?? "/sitecore/api/item/transfer/v1",
    packages: "/packages", // POST upload package
    consume: (packageId: string) => `/packages/${packageId}/consume`,
    consumeStatus: (packageId: string) => `/packages/${packageId}/status`,
    sources: "/sources", // GET/DELETE manage transfer sources
    items: (packageId: string) => `/packages/${packageId}/items`, // inspect transferred items
  },

  /** Authoring GraphQL API - used to browse the content tree in the item picker. */
  authoringGraphQL:
    process.env.SITECORE_AUTHORING_GQL ?? "/sitecore/api/authoring/graphql/v1",

  /** Polling behaviour. */
  polling: {
    intervalMs: Number(process.env.SITECORE_POLL_INTERVAL ?? 3000),
    maxAttempts: Number(process.env.SITECORE_POLL_MAX_ATTEMPTS ?? 200),
  },
};
