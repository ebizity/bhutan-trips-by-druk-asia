import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface StoredUser {
  id: string;
  email: string;
  fullname: string;
  passwordHash: string;
  salt: string;
  drukasiaApiKey: string;
}

export interface StoredAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  expiresAt: number;
}

export interface StoredRefreshToken {
  clientId: string;
  userId: string;
  expiresAt: number;
}

export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
}

/**
 * In-memory stores for the OAuth server.
 *
 * NOTE: Demo-grade only — state is lost on restart and is not shared across
 * instances. Use a database / KV store in production.
 */
export class MemoryStore {
  users = new Map<string, StoredUser>();
  usersByEmail = new Map<string, string>();
  clients = new Map<string, OAuthClientInformationFull>();
  authCodes = new Map<string, StoredAuthCode>();
  refreshTokens = new Map<string, StoredRefreshToken>();
  pendingAuthorizations = new Map<string, PendingAuthorization>();
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
