import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { loadEnvFile } from "./env.js";
import { DrukAsiaClient } from "./client.js";
import { registerTools } from "./tools.js";
import { MemoryStore } from "./oauth/store.js";
import { OAuthProvider } from "./oauth/provider.js";
import { oauthUiRoutes } from "./oauth/routes.js";

loadEnvFile();

const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
const BASE_URL = (process.env.DRUKASIA_API_BASE_URL ?? "https://api.bhutan.pro").replace(/\/+$/, "");
const PUBLIC_BASE_URL = (process.env.MCP_PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const SERVER_NAME = "Bhutan Trips by Druk Asia";
const SERVER_VERSION = "1.0.0";

const store = new MemoryStore();
const issuerUrl = new URL(PUBLIC_BASE_URL);
let provider: OAuthProvider;
try {
  provider = new OAuthProvider(store, issuerUrl);
} catch (err) {
  // Fail closed: refuse to start without a strong token-signing secret.
  console.error(`Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// OAuth authorization server: metadata, /authorize, /token, /register, /revoke,
// plus protected-resource metadata for /mcp.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl,
    baseUrl: issuerUrl,
    scopesSupported: ["mcp"],
    resourceServerUrl: new URL(`${PUBLIC_BASE_URL}/mcp`),
    resourceName: SERVER_NAME,
  }),
);

// Login UI + user signup.
app.use(oauthUiRoutes(store, PUBLIC_BASE_URL, BASE_URL));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: SERVER_NAME });
});

const protectedMetadataUrl = getOAuthProtectedResourceMetadataUrl(
  new URL(`${PUBLIC_BASE_URL}/mcp`),
);

/**
 * Resolve the caller's Druk Asia API key from either:
 *  - a legacy direct key (`x-api-key` header or `Authorization: Bearer da_live_...`), or
 *  - an OAuth access token (JWT) whose subject maps to a registered user's key.
 */
async function resolveApiKey(req: express.Request): Promise<string | undefined> {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();

  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.startsWith("da_live_")) return token;
    try {
      const info = await provider.verifyAccessToken(token);
      const userId = info.extra?.userId as string | undefined;
      const user = userId ? store.users.get(userId) : undefined;
      return user?.drukasiaApiKey;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

app.post("/mcp", async (req, res) => {
  const apiKey = await resolveApiKey(req);
  if (!apiKey) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${protectedMetadataUrl}"`);
    res.status(401).json({
      error: "Unauthorized. Provide a Druk Asia API key or an OAuth access token.",
    });
    return;
  }

  try {
    const client = new DrukAsiaClient({ baseUrl: BASE_URL, apiKey });
    const mcp = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerTools(mcp, client);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    else res.end();
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed" });
});

app.listen(PORT, () => {
  console.error(`${SERVER_NAME} hosted MCP server listening on http://0.0.0.0:${PORT}`);
  console.error(`MCP: POST /mcp | Health: GET /health`);
  console.error(`OAuth AS metadata: ${PUBLIC_BASE_URL}/.well-known/oauth-authorization-server`);
  console.error(`Protected resource metadata: ${protectedMetadataUrl}`);
  console.error(`Upstream API: ${BASE_URL}`);
});
