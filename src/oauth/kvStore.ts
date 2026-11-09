import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  PendingAuthorization,
  StoredAuthCode,
  StoredRefreshToken,
  StoredUser,
} from "./store.js";

/** Minimal structural type for a Cloudflare KV namespace (avoids a workers-types dependency). */
export interface KvNamespaceLike {
  get(key: string, type?: "text" | "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * KV-backed OAuth state store for Cloudflare Workers.
 *
 * NOTE: KV is eventually consistent — single-use auth codes may have a short
 * replay window. For strong single-use guarantees, use Durable Objects.
 */
export class KvStore {
  constructor(private readonly kv: KvNamespaceLike) {}

  async getUser(id: string): Promise<StoredUser | null> {
    return (await this.kv.get(`user:${id}`, "json")) as StoredUser | null;
  }

  async getUserByEmail(email: string): Promise<StoredUser | null> {
    const id = (await this.kv.get(`user_email:${email}`, "text")) as string | null;
    return id ? this.getUser(id) : null;
  }

  async putUser(user: StoredUser): Promise<void> {
    await Promise.all([
      this.kv.put(`user:${user.id}`, JSON.stringify(user)),
      this.kv.put(`user_email:${user.email}`, user.id),
    ]);
  }

  async getClient(id: string): Promise<OAuthClientInformationFull | null> {
    return (await this.kv.get(`client:${id}`, "json")) as OAuthClientInformationFull | null;
  }

  async putClient(client: OAuthClientInformationFull): Promise<void> {
    await this.kv.put(`client:${client.client_id}`, JSON.stringify(client));
  }

  async getCode(code: string): Promise<StoredAuthCode | null> {
    return (await this.kv.get(`code:${code}`, "json")) as StoredAuthCode | null;
  }

  async putCode(code: string, record: StoredAuthCode, ttlSec: number): Promise<void> {
    await this.kv.put(`code:${code}`, JSON.stringify(record), { expirationTtl: ttlSec });
  }

  async deleteCode(code: string): Promise<void> {
    await this.kv.delete(`code:${code}`);
  }

  async getRefresh(token: string): Promise<StoredRefreshToken | null> {
    return (await this.kv.get(`refresh:${token}`, "json")) as StoredRefreshToken | null;
  }

  async putRefresh(token: string, record: StoredRefreshToken, ttlSec: number): Promise<void> {
    await this.kv.put(`refresh:${token}`, JSON.stringify(record), { expirationTtl: ttlSec });
  }

  async deleteRefresh(token: string): Promise<void> {
    await this.kv.delete(`refresh:${token}`);
  }

  async getPending(loginId: string): Promise<PendingAuthorization | null> {
    return (await this.kv.get(`pending:${loginId}`, "json")) as PendingAuthorization | null;
  }

  async putPending(loginId: string, record: PendingAuthorization, ttlSec: number): Promise<void> {
    await this.kv.put(`pending:${loginId}`, JSON.stringify(record), { expirationTtl: ttlSec });
  }

  async deletePending(loginId: string): Promise<void> {
    await this.kv.delete(`pending:${loginId}`);
  }
}
