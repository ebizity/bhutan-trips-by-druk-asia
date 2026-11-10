import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DrukAsiaClient } from "./client.js";
import { registerTools } from "./tools.js";
import { KvStore, type KvNamespaceLike } from "./oauth/kvStore.js";
import { WorkerOAuthService, normalizeBaseUrl } from "./oauth/workerAuth.js";
import { RateLimiter } from "./oauth/rateLimit.js";
import { DOCS_HTML } from "./docs.js";

const SERVER_NAME = "Bhutan Trips by Druk Asia";
const SERVER_VERSION = "1.0.0";

export interface WorkerEnv {
  DRUKASIA_API_BASE_URL?: string;
  MCP_PUBLIC_BASE_URL?: string;
  JWT_SECRET?: string;
  /** Comma-separated list of allowed browser origins (e.g. https://chatgpt.com). Empty = allow all. */
  CORS_ORIGINS?: string;
  AUTH_KV?: KvNamespaceLike;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function corsHeaders(request: Request, allowedOrigins: string[] | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-api-key, mcp-session-id, mcp-protocol-version",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
  const origin = request.headers.get("Origin");
  if (!allowedOrigins || allowedOrigins.length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function fetchHandler(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const allowedOrigins = (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders(request, allowedOrigins), ...extra },
    });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, allowedOrigins) });
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: SERVER_NAME });
  }

  // Public documentation page.
  if (request.method === "GET" && (url.pathname === "/docs" || url.pathname === "/docs/")) {
    return new Response(DOCS_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const baseUrl = (env.DRUKASIA_API_BASE_URL ?? "https://api.bhutan.pro").replace(/\/+$/, "");
  const publicBase = normalizeBaseUrl(env.MCP_PUBLIC_BASE_URL ?? url.origin);
  const store = env.AUTH_KV ? new KvStore(env.AUTH_KV) : null;
  let oauth: WorkerOAuthService | null = null;
  if (store) {
    try {
      oauth = new WorkerOAuthService(store, env, publicBase);
    } catch (err) {
      // Fail closed: never run the OAuth server (or accept tokens) with a weak secret.
      console.error("OAuth disabled:", err instanceof Error ? err.message : err);
      return json({ error: "Server is misconfigured. Please try again later." }, 503);
    }
  }
  const limiter = env.AUTH_KV ? new RateLimiter(env.AUTH_KV) : null;

  const rateLimit = async (name: string, max: number, windowSec: number): Promise<Response | null> => {
    if (!limiter) return null;
    const { allowed, retryAfterSec } = await limiter.hit(`${name}:${getClientIp(request)}`, max, windowSec);
    if (!allowed) {
      return json(
        { error: "Too many requests. Please try again later." },
        429,
        { "Retry-After": String(retryAfterSec) },
      );
    }
    return null;
  };

  // OAuth metadata
  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return oauth ? oauth.asMetadata() : json({ error: "OAuth is not configured (AUTH_KV missing)" }, 501);
  }
  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    return oauth ? oauth.prmMetadata() : json({ error: "OAuth is not configured (AUTH_KV missing)" }, 501);
  }

  if (oauth) {
    if (url.pathname === "/authorize" && request.method === "GET") {
      const limited = await rateLimit("authorize", 30, 60);
      if (limited) return limited;
      return oauth.authorize(request);
    }
    if (url.pathname === "/oauth/login" && request.method === "GET") return oauth.loginPage(request);
    if (url.pathname === "/oauth/signup" && request.method === "GET") return oauth.signupPage(request);
    if (url.pathname === "/oauth/signup" && request.method === "POST") {
      const limited = await rateLimit("register_user", 10, 3600);
      if (limited) return limited;
      return oauth.signupSubmit(request);
    }
    if (url.pathname === "/oauth/login" && request.method === "POST") {
      const limited = await rateLimit("login", 10, 60);
      if (limited) return limited;
      return oauth.loginSubmit(request);
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const limited = await rateLimit("token", 60, 60);
      if (limited) return limited;
      return oauth.token(request);
    }
    if (url.pathname === "/register" && request.method === "POST") {
      const limited = await rateLimit("register_client", 10, 3600);
      if (limited) return limited;
      return oauth.registerClient(request);
    }
    if (url.pathname === "/auth/register" && request.method === "POST") {
      const limited = await rateLimit("register_user", 10, 3600);
      if (limited) return limited;
      return oauth.registerUser(request);
    }
    if (url.pathname === "/revoke" && request.method === "POST") {
      const limited = await rateLimit("revoke", 30, 60);
      if (limited) return limited;
      return oauth.revoke(request);
    }
  }

  if (url.pathname === "/mcp" && request.method === "POST") {
    const apiKey = oauth ? await oauth.resolveApiKey(request) : undefined;
    if (!apiKey) {
      return json(
        { error: "Unauthorized. Provide a Druk Asia API key or an OAuth access token." },
        401,
        {
          "WWW-Authenticate": `Bearer resource_metadata="${publicBase}/.well-known/oauth-protected-resource/mcp"`,
        },
      );
    }

    try {
      const client = new DrukAsiaClient({ baseUrl, apiKey });
      const mcp = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
      registerTools(mcp, client);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });
      await mcp.connect(transport);
      const response = await transport.handleRequest(request);

      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders(request, allowedOrigins))) {
        headers.set(key, value);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (err) {
      console.error("MCP request failed:", err);
      return json({ error: "Internal server error" }, 500);
    }
  }

  if (url.pathname === "/mcp") {
    return json({ error: "Method not allowed" }, 405);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return fetchHandler(request, env);
  },
};
