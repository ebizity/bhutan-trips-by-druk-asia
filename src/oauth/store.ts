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
  /**
   * Hex SHA-256 of a random nonce stored in an HttpOnly cookie on the browser
   * that started /authorize. The login form is only accepted from that browser,
   * so a login_id link cannot be handed to a victim to sign in on.
   */
  browserBindingHash: string;
  /** Random token echoed in the login form (defence in depth against CSRF). */
  csrfToken: string;
}

/** Name of the cookie that binds a pending authorization to one browser. */
export function bindingCookieName(loginId: string): string {
  return `__Host-da_login_${loginId}`;
}

/** Read one cookie from a raw `Cookie` header. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

const BLOCKED_REDIRECT_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate a redirect URI supplied at dynamic client registration:
 * https anywhere, http only on loopback, custom (native-app) schemes allowed,
 * script-capable schemes and fragments rejected.
 */
export function isAcceptableRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || BLOCKED_REDIRECT_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  return true;
}

/** Human-readable destination shown on the consent screen. */
export function redirectDisplay(value: string): string {
  try {
    const url = new URL(value);
    return url.host ? `${url.protocol}//${url.host}` : `${url.protocol}${url.pathname}`;
  } catch {
    return value;
  }
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
