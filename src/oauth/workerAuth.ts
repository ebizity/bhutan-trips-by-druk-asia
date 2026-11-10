import { SignJWT, jwtVerify } from "jose";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { KvStore } from "./kvStore.js";
import {
  AUTH_PAGE_HEADERS,
  brand,
  esc,
  layout,
  loginConsentPage,
  loginLinkInvalidPage,
} from "./pages.js";
import {
  bindingCookieName,
  isAcceptableRedirectUri,
  readCookie,
  redirectDisplay,
  type PendingAuthorization,
  type StoredUser,
} from "./store.js";
import { loadJwtSecret } from "./secret.js";

const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const AUTH_CODE_TTL_SEC = 5 * 60; // 5 minutes
const PENDING_TTL_SEC = 5 * 60; // 5 minutes
const PBKDF2_ITERATIONS = 100_000;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function s256(verifier: string): Promise<string> {
  return b64url(await sha256(verifier));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt: toHex(salt), hash: toHex(hash) };
}

async function verifyPassword(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  const candidate = await pbkdf2(password, fromHex(saltHex), PBKDF2_ITERATIONS);
  return timingSafeEqual(candidate, fromHex(hashHex));
}

function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Ensure a base URL has a scheme (defaults to https) and no trailing slash. */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * RFC 8252 §7.3 redirect_uri matching: for loopback hosts any port is allowed
 * (native clients get an ephemeral port); scheme/host/path/query must still
 * match exactly. Mirrors the SDK's own implementation.
 */
function redirectUriMatches(requested: string, registered: string): boolean {
  if (requested === registered) return true;
  let req: URL;
  let reg: URL;
  try {
    req = new URL(requested);
    reg = new URL(registered);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTS.has(req.hostname) || !LOOPBACK_HOSTS.has(reg.hostname)) return false;
  return (
    req.protocol === reg.protocol &&
    req.hostname === reg.hostname &&
    req.pathname === reg.pathname &&
    req.search === reg.search
  );
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function html(status: number, body: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...AUTH_PAGE_HEADERS, ...extraHeaders },
  });
}

/** 302 redirect whose headers stay mutable (Response.redirect() headers are immutable). */
function redirect(location: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store", ...extraHeaders },
  });
}

function bindingCookie(loginId: string, value: string, maxAgeSec: number): string {
  return `${bindingCookieName(loginId)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

async function sameSecret(candidate: string, expectedHashHex: string): Promise<boolean> {
  if (!candidate || !expectedHashHex) return false;
  return timingSafeEqual(await sha256(candidate), fromHex(expectedHashHex));
}

export interface WorkerOAuthEnv {
  JWT_SECRET?: string;
  DRUKASIA_API_BASE_URL?: string;
}

/**
 * Web-standard OAuth 2.1 authorization server (authorization code + PKCE)
 * backed by KV, for Cloudflare Workers.
 */
export class WorkerOAuthService {
  private readonly jwtSecret: Uint8Array;
  private readonly issuer: string;

  constructor(
    private readonly store: KvStore,
    private readonly env: WorkerOAuthEnv,
    publicBaseUrl: string,
  ) {
    // Throws if JWT_SECRET is missing or weak — never fall back to a known value.
    this.jwtSecret = loadJwtSecret(env.JWT_SECRET);
    this.issuer = normalizeBaseUrl(publicBaseUrl);
  }

  asMetadata(): Response {
    return json({
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      registration_endpoint: `${this.issuer}/register`,
      revocation_endpoint: `${this.issuer}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp"],
    });
  }

  prmMetadata(): Response {
    return json({
      resource: `${this.issuer}/mcp`,
      authorization_servers: [this.issuer],
      scopes_supported: ["mcp"],
    });
  }

  async authorize(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge") ?? "";
    const method = url.searchParams.get("code_challenge_method") ?? "";
    const state = url.searchParams.get("state") ?? undefined;
    const responseType = url.searchParams.get("response_type") ?? "";

    // Phase 1: until client_id and redirect_uri are validated, errors must be
    // shown directly — never redirect to an unverified URI (open redirect).
    const client = clientId ? await this.store.getClient(clientId) : null;
    if (!client) return this.authorizeErrorPage("Unknown or missing client_id.");
    const redirectOk =
      isAcceptableRedirectUri(redirectUri) &&
      client.redirect_uris.some((registered) => redirectUriMatches(redirectUri, registered));
    if (!redirectOk) {
      return this.authorizeErrorPage("redirect_uri is missing or not registered for this client.");
    }

    // Phase 2: redirect_uri is trusted; protocol errors go back to the client.
    const fail = (error: string, description: string) =>
      this.authorizeError(redirectUri, state, error, description);

    if (responseType !== "code") return fail("unsupported_response_type", "Only code is supported");
    if (method !== "S256") return fail("invalid_request", "code_challenge_method must be S256");
    if (!codeChallenge) return fail("invalid_request", "code_challenge is required");

    const loginId = crypto.randomUUID();
    const browserNonce = randomToken();
    const pending: PendingAuthorization = {
      clientId,
      redirectUri,
      codeChallenge,
      state,
      browserBindingHash: toHex(await sha256(browserNonce)),
      csrfToken: randomToken(),
    };
    await this.store.putPending(loginId, pending, PENDING_TTL_SEC);

    const loginUrl = new URL(`${this.issuer}/oauth/login`);
    loginUrl.searchParams.set("login_id", loginId);
    return redirect(loginUrl.toString(), {
      "Set-Cookie": bindingCookie(loginId, browserNonce, PENDING_TTL_SEC),
    });
  }

  /** True if this request comes from the browser that started the authorization. */
  private async isBoundBrowser(request: Request, loginId: string, pending: PendingAuthorization): Promise<boolean> {
    const nonce = readCookie(request.headers.get("Cookie"), bindingCookieName(loginId));
    return sameSecret(nonce ?? "", pending.browserBindingHash);
  }

  async loginPage(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const loginId = params.get("login_id") ?? "";
    const pending = loginId ? await this.store.getPending(loginId) : null;
    if (!pending || !(await this.isBoundBrowser(request, loginId, pending))) {
      return html(400, loginLinkInvalidPage());
    }
    const client = await this.store.getClient(pending.clientId);
    return html(
      200,
      loginConsentPage({
        loginId,
        csrfToken: pending.csrfToken,
        clientName: typeof client?.client_name === "string" ? client.client_name : undefined,
        redirectTo: redirectDisplay(pending.redirectUri),
        email: params.get("email") ?? "",
        signedUp: params.get("signed_up") === "1",
      }),
    );
  }

  async loginSubmit(request: Request): Promise<Response> {
    const body = new URLSearchParams(await request.text());
    const loginId = body.get("login_id") ?? "";
    const email = (body.get("email") ?? "").trim().toLowerCase();
    const password = body.get("password") ?? "";

    const pending = loginId ? await this.store.getPending(loginId) : null;
    if (
      !pending ||
      !(await this.isBoundBrowser(request, loginId, pending)) ||
      body.get("csrf_token") !== pending.csrfToken
    ) {
      return html(400, loginLinkInvalidPage());
    }
    const clearCookie = { "Set-Cookie": bindingCookie(loginId, "", 0) };

    if (body.get("decision") === "deny") {
      await this.store.deletePending(loginId);
      const denied = new URL(pending.redirectUri);
      denied.searchParams.set("error", "access_denied");
      denied.searchParams.set("error_description", "The user denied the request");
      if (pending.state) denied.searchParams.set("state", pending.state);
      return redirect(denied.toString(), clearCookie);
    }

    const user = await this.store.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.salt, user.passwordHash))) {
      const back = new URL(`${this.issuer}/oauth/login`);
      back.searchParams.set("login_id", loginId);
      return html(
        401,
        layout(
          "Sign in failed",
          `<div class="card">
            ${brand()}
            <h1>Sign in failed</h1>
            <div class="error">Invalid email or password.</div>
            <a class="btn" href="${esc(back.pathname + back.search)}">Try again</a>
          </div>`,
        ),
      );
    }

    const code = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    await this.store.putCode(
      code,
      {
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        userId: user.id,
        expiresAt: Date.now() + AUTH_CODE_TTL_SEC * 1000,
      },
      AUTH_CODE_TTL_SEC,
    );
    await this.store.deletePending(loginId);

    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", code);
    if (pending.state) target.searchParams.set("state", pending.state);
    return redirect(target.toString(), clearCookie);
  }

  async token(request: Request): Promise<Response> {
    const body = new URLSearchParams(await request.text());
    const grantType = body.get("grant_type") ?? "";
    const clientId = body.get("client_id") ?? "";

    const client = await this.store.getClient(clientId);
    if (!client) return json({ error: "invalid_client" }, 401);

    if (grantType === "authorization_code") {
      const code = body.get("code") ?? "";
      const verifier = body.get("code_verifier") ?? "";
      const record = await this.store.getCode(code);
      if (!record || record.clientId !== clientId || record.expiresAt < Date.now()) {
        return json({ error: "invalid_grant" }, 400);
      }
      if ((await s256(verifier)) !== record.codeChallenge) {
        return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
      }
      await this.store.deleteCode(code);
      return json(await this.issueTokens(record.userId, clientId));
    }

    if (grantType === "refresh_token") {
      const refresh = body.get("refresh_token") ?? "";
      const record = await this.store.getRefresh(refresh);
      if (!record || record.clientId !== clientId || record.expiresAt < Date.now()) {
        return json({ error: "invalid_grant" }, 400);
      }
      await this.store.deleteRefresh(refresh);
      return json(await this.issueTokens(record.userId, clientId));
    }

    return json({ error: "unsupported_grant_type" }, 400);
  }

  async registerClient(request: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const rawUris: unknown[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    const redirectUris = rawUris.filter((u): u is string => typeof u === "string");
    if (
      redirectUris.length === 0 ||
      redirectUris.length !== rawUris.length ||
      !redirectUris.every(isAcceptableRedirectUri)
    ) {
      return json(
        {
          error: "invalid_redirect_uri",
          error_description: "redirect_uris must be https (or http on loopback) or a native-app scheme",
        },
        400,
      );
    }

    const client: OAuthClientInformationFull = {
      ...(body as Omit<OAuthClientInformationFull, "client_id">),
      redirect_uris: redirectUris,
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    await this.store.putClient(client);
    return json(client, 201);
  }

  async registerUser(request: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullname = String(body.fullname ?? "").trim();
    // A caller-supplied Druk Asia key is deliberately not accepted: every
    // account gets a key minted for it by the upstream API.
    const result = await this.createUser(email, password, fullname);
    if (!result.ok) return json({ error: result.message }, result.status);
    return json({ user_id: result.user.id, email: result.user.email }, 201);
  }

  signupPage(request: Request): Response {
    const loginId = new URL(request.url).searchParams.get("login_id") ?? "";
    return html(
      200,
      layout(
        "Sign up",
        `<div class="card">
          ${brand()}
          <h1>Create your account</h1>
          <p class="lead">to continue with Bhutan Trips by Druk Asia</p>
          <form method="POST" action="/oauth/signup">
            <input type="hidden" name="login_id" value="${esc(loginId)}" />
            <label for="fullname">Full name</label>
            <input id="fullname" name="fullname" placeholder="Full Name" required />
            <label for="email">Email</label>
            <input id="email" name="email" type="email" placeholder="you@example.com" required />
            <label for="password">Password</label>
            <input id="password" name="password" type="password" minlength="8" placeholder="At least 8 characters" required />
            <button class="btn" type="submit">Create account</button>
          </form>
          <p class="foot">Already have an account? <a href="/oauth/login?login_id=${encodeURIComponent(loginId)}">Sign in</a></p>
        </div>`,
      ),
    );
  }

  async signupSubmit(request: Request): Promise<Response> {
    const body = new URLSearchParams(await request.text());
    const loginId = body.get("login_id") ?? "";
    const email = (body.get("email") ?? "").trim().toLowerCase();
    const password = body.get("password") ?? "";
    const fullname = (body.get("fullname") ?? "").trim();

    const result = await this.createUser(email, password, fullname);
    if (!result.ok) {
      return html(
        result.status,
        layout(
          "Sign up failed",
          `<div class="card">
            ${brand()}
            <h1>Sign up failed</h1>
            <div class="error">${esc(result.message)}</div>
            <a class="btn" href="/oauth/signup?login_id=${encodeURIComponent(loginId)}">Try again</a>
          </div>`,
        ),
      );
    }

    const next = new URL(`${this.issuer}/oauth/login`);
    next.searchParams.set("login_id", loginId);
    next.searchParams.set("email", email);
    next.searchParams.set("signed_up", "1");
    return redirect(next.toString());
  }

  private async createUser(
    email: string,
    password: string,
    fullname: string,
  ): Promise<{ ok: true; user: StoredUser } | { ok: false; status: number; message: string }> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, status: 400, message: "Please enter a valid email address." };
    }
    if (password.length < 8) {
      return { ok: false, status: 400, message: "Password must be at least 8 characters." };
    }
    if (!fullname) {
      return { ok: false, status: 400, message: "Full name is required." };
    }
    if (await this.store.getUserByEmail(email)) {
      return { ok: false, status: 409, message: "An account with this email already exists." };
    }

    let apiKey: string;
    {
      const upstream = (this.env.DRUKASIA_API_BASE_URL ?? "https://api.bhutan.pro").replace(/\/+$/, "");
      const resp = await fetch(`${upstream}/v1/auth/bots/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_email: email, owner_fullname: fullname }),
      });
      const data = (await resp.json().catch(() => null)) as { data?: { api_key?: string }; error?: string } | null;
      if (!resp.ok || !data?.data?.api_key) {
        return {
          ok: false,
          status: resp.status || 502,
          message: data?.error ?? "Failed to create your API key. Please try again later.",
        };
      }
      apiKey = data.data.api_key;
    }

    const { salt, hash } = await hashPassword(password);
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      fullname,
      passwordHash: hash,
      salt,
      drukasiaApiKey: apiKey,
    };
    await this.store.putUser(user);
    return { ok: true, user };
  }

  async revoke(request: Request): Promise<Response> {
    const body = new URLSearchParams(await request.text());
    const token = body.get("token") ?? "";
    await this.store.deleteRefresh(token);
    await this.store.deleteCode(token);
    return new Response(null, { status: 200 });
  }

  async verifyAccessToken(token: string): Promise<{ userId: string }> {
    const { payload } = await jwtVerify(token, this.jwtSecret, {
      algorithms: ["HS256"],
      issuer: this.issuer,
      audience: this.issuer,
    });
    return { userId: String(payload.sub ?? "") };
  }

  /** Resolve a Druk Asia API key from legacy headers or an OAuth access token. */
  async resolveApiKey(request: Request): Promise<string | undefined> {
    const headerKey = request.headers.get("x-api-key");
    if (headerKey?.trim()) return headerKey.trim();

    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length).trim();
      if (token.startsWith("da_live_")) return token;
      try {
        const { userId } = await this.verifyAccessToken(token);
        const user = await this.store.getUser(userId);
        return user?.drukasiaApiKey;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private async issueTokens(userId: string, clientId: string): Promise<OAuthTokens> {
    const accessToken = await this.signAccessToken(userId, clientId);
    const refreshToken = randomToken();
    await this.store.putRefresh(
      refreshToken,
      { clientId, userId, expiresAt: Date.now() + REFRESH_TOKEN_TTL_SEC * 1000 },
      REFRESH_TOKEN_TTL_SEC,
    );
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope: "mcp",
    };
  }

  private signAccessToken(userId: string, clientId: string): Promise<string> {
    return new SignJWT({ client_id: clientId, scope: "mcp" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.issuer)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.jwtSecret);
  }

  private authorizeError(
    redirectUri: string,
    state: string | undefined,
    error: string,
    description: string,
  ): Response {
    // Only called after redirectUri was matched against the client's registration.
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return redirect(url.toString());
  }

  private authorizeErrorPage(description: string): Response {
    return html(
      400,
      layout(
        "Authorization error",
        `<div class="card">
          ${brand()}
          <h1>Authorization error</h1>
          <div class="error">${esc(description)}</div>
        </div>`,
      ),
    );
  }
}
