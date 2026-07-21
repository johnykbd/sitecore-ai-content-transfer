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

export interface RawResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  /** Parsed JSON when the body is JSON, otherwise the raw text. */
  body: T | string | null;
  text: string;
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

  /** Absolute URLs (e.g. Location-header monitor resources) pass through untouched. */
  private resolve(path: string) {
    return path.startsWith("http") ? path : `${this.baseUrl}${path}`;
  }

  /**
   * Raw request: never throws on non-2xx — callers check `status` themselves,
   * because this API pipeline treats specific codes (202, 201, 404…) as
   * meaningful signals rather than plain success/failure.
   */
  async raw<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<RawResponse<T>> {
    const { json, ...rest } = init;
    const method = rest.method ?? "GET";
    const url = this.resolve(path);
    const requestBody =
      json !== undefined
        ? json
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
      const text = await res.text().catch(() => "");
      let body: T | string | null = text || null;
      try {
        if (text) body = JSON.parse(text) as T;
      } catch {
        /* keep raw text */
      }
      responseBody = body;
      if (!res.ok) {
        errorMessage = `${method} ${url} → ${res.status} ${res.statusText}`;
      }
      return { status: res.status, ok: res.ok, headers: res.headers, body, text };
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

  /** Strict request: throws on non-2xx, returns parsed JSON. */
  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<T> {
    const res = await this.raw<T>(path, init);
    if (!res.ok) {
      throw new SitecoreApiError(
        `${init.method ?? "GET"} ${path} failed (HTTP ${res.status})`,
        res.status,
        res.text.slice(0, 1000)
      );
    }
    return res.body as T;
  }

  /** Binary download that also exposes response headers (Content-Disposition etc.). */
  async downloadBinary(path: string): Promise<{ data: ArrayBuffer; headers: Headers }> {
    const headers = await this.headers();
    const url = this.resolve(path);
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
        const body = await res.text().catch(() => "");
        errorMessage = `GET ${url} → ${res.status} ${res.statusText}`;
        throw new SitecoreApiError(
          `GET ${path} failed (HTTP ${res.status})`,
          res.status,
          body.slice(0, 1000)
        );
      }
      const buf = await res.arrayBuffer();
      byteLength = buf.byteLength;
      return { data: buf, headers: res.headers };
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

  /** Binary upload (PUT application/octet-stream). Returns the raw response. */
  async uploadBinary(path: string, data: ArrayBuffer): Promise<RawResponse> {
    const headers = await this.headers({ "Content-Type": "application/octet-stream" });
    const url = this.resolve(path);
    const started = Date.now();
    let status: number | undefined;
    let statusText: string | undefined;
    let responseBody: unknown;
    let errorMessage: string | undefined;

    try {
      const res = await fetch(url, { method: "PUT", headers, body: data });
      status = res.status;
      statusText = res.statusText;
      const text = await res.text().catch(() => "");
      let body: unknown = text || null;
      try {
        if (text) body = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      responseBody = body;
      if (!res.ok) errorMessage = `PUT ${url} → ${res.status} ${res.statusText}`;
      return { status: res.status, ok: res.ok, headers: res.headers, body, text };
    } finally {
      this.onCall?.({
        method: "PUT",
        url,
        requestBody: `<binary, ${data.byteLength} bytes>`,
        status,
        statusText,
        responseBody: truncateForLog(responseBody),
        durationMs: Date.now() - started,
        error: errorMessage,
      });
    }
  }
}
