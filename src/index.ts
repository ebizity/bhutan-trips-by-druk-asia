#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnvFile } from "./env.js";
import { loadConfig } from "./config.js";
import { DrukAsiaClient } from "./client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const client = new DrukAsiaClient(config);

  const server = new McpServer({
    name: "Bhutan Trips by Druk Asia",
    version: "1.0.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so stdout remains reserved for the MCP protocol.
  console.error(`Bhutan Trips by Druk Asia MCP server started (base URL: ${config.baseUrl})`);
  if (!config.apiKey) {
    console.error(
      "WARNING: DRUKASIA_API_KEY is not set. All authenticated requests will fail with 401 Unauthorized.",
    );
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
