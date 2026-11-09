import type { Config } from "./config.js";

/** Raised when the API responds with a non-2xx status code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Druk Asia API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/**
 * Minimal, typed client for the Druk Asia v1 API.
 *
 * Every request is authenticated with the `x-api-key` header. The webhook
 * endpoint (`POST /v1/da-payments/webhook`) is intentionally not exposed here
 * because it is a server-to-server callback signed with a private HMAC secret.
 */
export class DrukAsiaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), { method, headers, body });

    const text = await response.text();
    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Keep the raw text for non-JSON responses.
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, data);
    }

    return data as T;
  }
}
