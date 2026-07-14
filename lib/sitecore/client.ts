import type { EnvironmentProfile } from "../types";
import { getAccessToken } from "./auth";

export class SitecoreApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string
  ) {
    super(message);
    this.name = "SitecoreApiError";
  }
}

/** Minimal authenticated HTTP client bound to one environment. */
export class SitecoreClient {
  constructor(private env: EnvironmentProfile) {}

  get baseUrl() {
    return this.env.baseUrl.replace(/\/$/, "");
  }

  private async headers(extra?: Record<string, string>) {
    const token = await getAccessToken(this.env);
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<T> {
    const { json, ...rest } = init;
    const headers = await this.headers(
      json !== undefined ? { "Content-Type": "application/json" } : undefined
    );

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...rest,
      headers: { ...headers, ...(rest.headers as Record<string, string>) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SitecoreApiError(
        `${rest.method ?? "GET"} ${path} failed (${res.status} ${res.statusText})`,
        res.status,
        body.slice(0, 1000)
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }

  async requestBinary(path: string): Promise<ArrayBuffer> {
    const headers = await this.headers();
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!res.ok) {
      throw new SitecoreApiError(
        `GET ${path} failed (${res.status} ${res.statusText})`,
        res.status
      );
    }
    return res.arrayBuffer();
  }
}
