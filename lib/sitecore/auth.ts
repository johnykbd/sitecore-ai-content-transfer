import { sitecoreConfig } from "./config";
import type { EnvironmentProfile } from "../types";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Obtain an OAuth bearer token for an environment using the
 * client-credentials flow against Sitecore Cloud auth.
 */
export async function getAccessToken(env: EnvironmentProfile): Promise<string> {
  // Pre-issued token (one-time mode, or managed environments saved with a token).
  if (env.authType === "token" || (!env.clientId && env.token)) {
    if (!env.token) throw new Error(`Environment "${env.name}" has no access token configured.`);
    return env.token.replace(/^Bearer\s+/i, "");
  }

  const cacheKey = `${env.id}:${env.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const authority = env.authority || sitecoreConfig.authority;
  const audience = env.audience || sitecoreConfig.audience;
  const url = `${authority.replace(/\/$/, "")}${sitecoreConfig.tokenPath}`;

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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Authentication failed for "${env.name}" (${res.status} ${res.statusText}): ${body.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error(`Auth response for "${env.name}" did not contain an access_token.`);
  }

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
