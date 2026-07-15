import { sitecoreConfig } from "./config";
import type { EnvironmentProfile } from "../types";
import type { SitecoreCallLogger } from "./client";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Shows just enough of a secret to recognize it without exposing it. */
function mask(secret: string): string {
  if (secret.length <= 8) return "***redacted***";
  return `${secret.slice(0, 4)}…redacted…${secret.slice(-4)}`;
}

/**
 * Obtain an OAuth bearer token for an environment using the
 * client-credentials flow against Sitecore Cloud auth.
 */
export async function getAccessToken(
  env: EnvironmentProfile,
  onCall?: SitecoreCallLogger
): Promise<string> {
  // Pre-issued token (one-time mode, or managed environments saved with a token).
  if (env.authType === "token" || (!env.clientId && env.token)) {
    if (!env.token) throw new Error(`Environment "${env.name}" has no access token configured.`);
    onCall?.({
      method: "n/a",
      url: "(pre-issued token)",
      responseBody: "Using stored access token (redacted)",
      durationMs: 0,
    });
    return env.token.replace(/^Bearer\s+/i, "");
  }

  const cacheKey = `${env.id}:${env.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    onCall?.({
      method: "n/a",
      url: "(cached token)",
      responseBody: "Reusing cached access token (redacted)",
      durationMs: 0,
    });
    return cached.token;
  }

  const authority = env.authority || sitecoreConfig.authority;
  const audience = env.audience || sitecoreConfig.audience;
  const url = `${authority.replace(/\/$/, "")}${sitecoreConfig.tokenPath}`;

  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      audience,
    }),
  });

  const logRequestBody = {
    grant_type: "client_credentials",
    client_id: env.clientId,
    client_secret: mask(env.clientSecret),
    audience,
  };

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onCall?.({
      method: "POST",
      url,
      requestBody: logRequestBody,
      status: res.status,
      statusText: res.statusText,
      responseBody: body.slice(0, 1000),
      durationMs: Date.now() - started,
      error: `Authentication failed (${res.status} ${res.statusText})`,
    });
    throw new Error(
      `Authentication failed for "${env.name}" (${res.status} ${res.statusText}): ${body.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    onCall?.({
      method: "POST",
      url,
      requestBody: logRequestBody,
      status: res.status,
      statusText: res.statusText,
      responseBody: json,
      durationMs: Date.now() - started,
      error: "Response did not contain an access_token",
    });
    throw new Error(`Auth response for "${env.name}" did not contain an access_token.`);
  }

  onCall?.({
    method: "POST",
    url,
    requestBody: logRequestBody,
    status: res.status,
    statusText: res.statusText,
    responseBody: {
      token_type: json.token_type,
      expires_in: json.expires_in,
      access_token: mask(json.access_token),
    },
    durationMs: Date.now() - started,
  });

  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

export function clearTokenCache(envId?: string) {
  if (!envId) return tokenCache.clear();
  for (const key of tokenCache.keys()) {
    if (key.startsWith(`${envId}:`)) tokenCache.delete(key);
  }
}
