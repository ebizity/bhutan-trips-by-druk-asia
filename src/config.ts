export interface Config {
  /** Base URL of the Druk Asia v1 API, without a trailing slash. */
  baseUrl: string;
  /** Agent Bot API key sent as the `x-api-key` header. */
  apiKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = (env.DRUKASIA_API_BASE_URL ?? "https://api.bhutan.pro")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = (env.DRUKASIA_API_KEY ?? "").trim();
  return { baseUrl, apiKey };
}
