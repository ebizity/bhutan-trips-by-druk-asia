import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { MemoryStore } from "./store.js";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class OAuthProvider implements OAuthServerProvider {
  constructor(
    private readonly store: MemoryStore,
    private readonly issuerUrl: URL,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.store.clients.get(clientId),
      registerClient: (client) => {
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        this.store.clients.set(full.client_id, full);
        return full;
      },
    };
  }

  /**
   * Start the authorization flow. Redirects the browser to our login page,
   * remembering the pending request so we can resume it after sign-in.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const loginId = randomUUID();
    this.store.pendingAuthorizations.set(loginId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
    });
    const loginUrl = new URL("/oauth/login", this.issuerUrl);
    loginUrl.searchParams.set("login_id", loginId);
    res.redirect(loginUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = this.store.authCodes.get(authorizationCode);
    if (!record) throw new Error("Invalid authorization code");
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const record = this.store.authCodes.get(authorizationCode);
    if (!record || record.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    if (record.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }
    this.store.authCodes.delete(authorizationCode);

    const accessToken = await this.signAccessToken(record.userId, client.client_id);
    const refreshToken = randomBytes(32).toString("hex");
    this.store.refreshTokens.set(refreshToken, {
      clientId: client.client_id,
      userId: record.userId,
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: "mcp",
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const record = this.store.refreshTokens.get(refreshToken);
    if (!record || record.expiresAt < Date.now()) {
      throw new Error("Invalid or expired refresh token");
    }
    if (record.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }
    this.store.refreshTokens.delete(refreshToken);

    const accessToken = await this.signAccessToken(record.userId, client.client_id);
    const newRefresh = randomBytes(32).toString("hex");
    this.store.refreshTokens.set(newRefresh, {
      clientId: client.client_id,
      userId: record.userId,
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: newRefresh,
      scope: scopes?.join(" ") || "mcp",
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: this.issuerUrl.toString(),
      audience: this.issuerUrl.toString(),
    });
    return {
      token,
      clientId: String(payload.client_id ?? ""),
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
      expiresAt: payload.exp ? Number(payload.exp) : undefined,
      extra: { userId: payload.sub },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    this.store.refreshTokens.delete(request.token);
    this.store.authCodes.delete(request.token);
  }

  issueAuthCode(record: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    userId: string;
  }): string {
    const code = createHash("sha256")
      .update(`${record.userId}:${record.codeChallenge}:${randomBytes(16).toString("hex")}`)
      .digest("hex");
    this.store.authCodes.set(code, { ...record, expiresAt: Date.now() + AUTH_CODE_TTL_MS });
    return code;
  }

  private async signAccessToken(userId: string, clientId: string): Promise<string> {
    return new SignJWT({ client_id: clientId, scope: "mcp" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(this.issuerUrl.toString())
      .setAudience(this.issuerUrl.toString())
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .sign(JWT_SECRET);
  }
}
