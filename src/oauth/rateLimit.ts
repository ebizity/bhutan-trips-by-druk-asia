import type { KvNamespaceLike } from "./kvStore.js";

/**
 * Simple fixed-window rate limiter backed by KV.
 *
 * NOTE: KV read/increment is not atomic, so under heavy concurrency counts may
 * be slightly undercounted. For strict limits, use Cloudflare's RATELIMIT
 * binding or Durable Objects.
 */
export class RateLimiter {
  constructor(private readonly kv: KvNamespaceLike) {}

  async hit(
    key: string,
    max: number,
    windowSec: number,
  ): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / windowSec) * windowSec;
    const rlKey = `rl:${key}:${windowStart}`;

    const current = Number((await this.kv.get(rlKey, "text")) ?? 0);
    if (current >= max) {
      return { allowed: false, retryAfterSec: Math.max(1, windowStart + windowSec - now) };
    }

    // KV expirationTtl must be >= 60s.
    await this.kv.put(rlKey, String(current + 1), { expirationTtl: Math.max(60, windowSec + 60) });
    return { allowed: true, retryAfterSec: 0 };
  }
}
