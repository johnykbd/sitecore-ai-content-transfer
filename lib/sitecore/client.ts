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

/** One outbound call to Sitecore, for step-by-step logging. Never carries headers/tokens. */
export interface SitecoreCallLog {
  method: string;
  url: string;
  requestBody?: unknown;
  status?: number;
  statusText?: string;
  responseBody?: unknown;
  durationMs: number;
  error?: string;
}

export type SitecoreCallLogger = (call: SitecoreCallLog) => void;

const MAX_LOG_CHARS = 4000;

/** Caps how much of a request/response body gets persisted with a log entry. */
export function truncateForLog(value: unknown): unknown {
  if (value === undefined) return undefined;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= MAX_LOG_CHARS) return value;
  return {
    truncated: true,
    totalChars: str.length,
    preview: str.slice(0, MAX_LOG_CHARS),
  };
}

/** Minimal authenticated HTTP client bound to one environment. */
export class SitecoreClient {
  constructor(
    private env: EnvironmentProfile,
    private onCall?: SitecoreCallLogger
  ) {}

  get baseUrl() {
    return this.env.baseUrl.replace(/\/$/, "");
  }

  private async headers(extra?: Record<string, string>) {
    const token = await getAccessToken(this.env, this.onCall);
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<T> {
    const { json, ...rest } = init;
    const method = rest.method ?? "GET";
    const url = `${this.baseUrl}${path}`;
    const requestBody =
      json !== undefined
        ? json
        : rest.body instanceof FormData
          ? "<form-data upload>"
          : typeof rest.body === "string"
            ? rest.body
            : undefined;

    const headers = await this.headers(
      json !== undefined ? { "Content-Type": "application/json" } : undefined
    );

    const started = Date.now();
    let status: number | undefined;
    let statusText: string | undefined;
    let responseBody: unknown;
    let errorMessage: string | undefined;

    try {
      const res = await fetch(url, {
        ...rest,
        headers: { ...headers, ...(rest.headers as Record<string, string>) },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
      });
      status = res.status;
      statusText = res.statusText;

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        responseBody = body;
        errorMessage = `${method} ${path} failed (${res.status} ${res.statusText})`;
        throw new SitecoreApiError(errorMessage, res.status, body.slice(0, 1000));
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        responseBody = data;
        return data as T;
      }
      const text = await res.text();
      responseBody = text;
      return text as unknown as T;
    } finally {
      this.onCall?.({
        method,
        url,
        requestBody: truncateForLog(requestBody),
        status,
        statusText,
        responseBody: truncateForLog(responseBody),
        durationMs: Date.now() - started,
        error: errorMessage,
      });
    }
  }

  async requestBinary(path: string): Promise<ArrayBuffer> {
    const headers = await this.headers();
    const url = `${this.baseUrl}${path}`;
    const started = Date.now();
    let status: number | undefined;
    let statusText: string | undefined;
    let errorMessage: string | undefined;
    let byteLength: number | undefined;

    try {
      const res = await fetch(url, { headers });
      status = res.status;
      statusText = res.statusText;
      if (!res.ok) {
        errorMessage = `GET ${path} failed (${res.status} ${res.statusText})`;
        throw new SitecoreApiError(errorMessage, res.status);
      }
      const buf = await res.arrayBuffer();
      byteLength = buf.byteLength;
      return buf;
    } finally {
      this.onCall?.({
        method: "GET",
        url,
        status,
        statusText,
        responseBody:
          byteLength !== undefined ? `<binary, ${byteLength} bytes>` : undefined,
        durationMs: Date.now() - started,
        error: errorMessage,
      });
    }
  }
}
