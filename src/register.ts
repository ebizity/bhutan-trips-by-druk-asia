import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile, projectRoot } from "./env.js";
import { loadConfig } from "./config.js";

const envPath = join(projectRoot, ".env");

function parseArgs(argv: string[]): { values: Record<string, string>; help: boolean } {
  const values: Record<string, string> = {};
  let help = false;
  const valueFlags = new Set(["--email", "--name", "--fullname", "--base-url"]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    const eq = arg.indexOf("=");
    if (eq !== -1) {
      const key = arg.slice(0, eq);
      if (valueFlags.has(key)) values[key] = arg.slice(eq + 1);
      continue;
    }

    if (valueFlags.has(arg)) {
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        values[arg] = value;
        i++;
      }
    }
  }

  return { values, help };
}

/**
 * Update or add entries in a `.env` file without touching unrelated lines.
 */
function upsertEnv(filePath: string, updates: Record<string, string>): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && updates[match[1]] !== undefined) {
      out.push(`${match[1]}=${updates[match[1]]}`);
      seen.add(match[1]);
    } else {
      out.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }

  writeFileSync(filePath, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}

async function prompt(text: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(text)).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { values, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`Bhutan Trips by Druk Asia — API key registration

Usage:
  npm run register [-- --email you@example.com --name "Your Name"] [--base-url https://...]

Options:
  --email <email>       Email address for the bot account.
  --name <fullname>     Full name (also accepts --fullname).
  --base-url <url>      API base URL (defaults to DRUKASIA_API_BASE_URL or https://api.bhutan.pro).
  --help, -h            Show this help.

If --email or --name are omitted, you will be prompted for them.
The generated API key is written to: ${envPath}`);
    return;
  }

  const email = values["--email"] || (await prompt("Email: "));
  const fullname = values["--fullname"] || values["--name"] || (await prompt("Full name: "));

  if (!email || !fullname) {
    console.error("Email and full name are required.");
    process.exit(1);
  }

  const config = loadConfig();
  const baseUrl = (values["--base-url"] || config.baseUrl).replace(/\/+$/, "");
  const url = `${baseUrl}/v1/auth/bots/register`;

  console.log(`Registering ${email} via ${url} ...`);

  let data: unknown;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_email: email, owner_fullname: fullname }),
    });
    data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`\nRegistration failed (HTTP ${res.status}):`);
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error("Network error while registering:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const apiKey = (data as { data?: { api_key?: string } })?.data?.api_key;
  if (!apiKey) {
    console.error("Registration response did not contain an API key:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const updates: Record<string, string> = { DRUKASIA_API_KEY: apiKey };
  if (values["--base-url"]) updates.DRUKASIA_API_BASE_URL = baseUrl;

  upsertEnv(envPath, updates);

  console.log(`\nAPI key saved to ${envPath}`);
  console.log(`  DRUKASIA_API_KEY=${apiKey}`);
  console.log("\nNext steps:");
  console.log("  npm run build && npm start");
  console.log("  (or register this server in your MCP client pointing at dist/index.js)");
}

main().catch((err: unknown) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
