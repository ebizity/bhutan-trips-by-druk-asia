import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Absolute path to the package root (the directory containing package.json).
 * Works whether running from `src/` via tsx or from `dist/` after a build.
 */
export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Load the `.env` file that lives next to package.json.
 *
 * Uses an explicit path (rather than dotenv's default of `process.cwd()`) so it
 * works when the server is spawned by an MCP client from a different directory.
 *
 * `config()` does not override variables already present in `process.env`, so
 * values injected by the MCP client always take precedence over `.env`.
 */
export function loadEnvFile(): void {
  config({ path: join(projectRoot, ".env") });
}
