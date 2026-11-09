import { randomUUID } from "node:crypto";
import { Router } from "express";
import { hashPassword, verifyPassword, type MemoryStore } from "./store.js";
import { brand, esc, layout } from "./pages.js";

/**
 * Custom login UI and user signup routes that pair with the SDK's OAuth router.
 */
export function oauthUiRoutes(
  store: MemoryStore,
  publicBaseUrl: string,
  upstreamBaseUrl: string,
): Router {
  const router = Router();

  // GET /oauth/login — sign-in form shown during /authorize.
  router.get("/oauth/login", (req, res) => {
    const loginId = String(req.query.login_id ?? "");
    const email = String(req.query.email ?? "");
    const signedUp = String(req.query.signed_up ?? "") === "1";
    const pending = store.pendingAuthorizations.get(loginId);
    if (!pending) {
      return res.status(400).send("Invalid or expired login session. Please start the flow again.");
    }
    res.type("html").send(
      layout(
        "Sign in",
        `<div class="card">
          ${brand()}
          <h1>Sign in</h1>
          <p class="lead">Sign in to continue.</p>
          ${signedUp ? '<div class="note">Account created — please sign in.</div>' : ""}
          <form method="POST" action="/oauth/login">
            <input type="hidden" name="login_id" value="${esc(loginId)}" />
            <label for="email">Email</label>
            <input id="email" name="email" type="email" value="${esc(email)}" placeholder="you@example.com" required />
            <label for="password">Password</label>
            <input id="password" name="password" type="password" placeholder="••••••••" required />
            <button class="btn" type="submit">Sign in</button>
          </form>
          <p class="foot">No account? <a href="/oauth/signup?login_id=${encodeURIComponent(loginId)}">Create one</a></p>
        </div>`,
      ),
    );
  });

  // POST /oauth/login — validates credentials and redirects back with the code.
  router.post("/oauth/login", (req, res) => {
    const loginId = String(req.body?.login_id ?? "");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const pending = store.pendingAuthorizations.get(loginId);
    if (!pending) {
      return res.status(400).send("Invalid or expired login session.");
    }

    const userId = store.usersByEmail.get(email);
    const user = userId ? store.users.get(userId) : undefined;
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return res.status(401).send("Invalid email or password.");
    }

    const code = createAuthCode(store, {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      userId: user.id,
    });
    store.pendingAuthorizations.delete(loginId);

    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.state) redirect.searchParams.set("state", pending.state);
    res.redirect(redirect.toString());
  });

  // GET /oauth/signup — account creation form.
  router.get("/oauth/signup", (req, res) => {
    const loginId = String(req.query.login_id ?? "");
    res.type("html").send(
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
  });

  // POST /oauth/signup — create account, then return to sign-in.
  router.post("/oauth/signup", async (req, res) => {
    const loginId = String(req.body?.login_id ?? "");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const fullname = String(req.body?.fullname ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).send("Please enter a valid email address.");
    }
    if (password.length < 8) {
      return res.status(400).send("Password must be at least 8 characters.");
    }
    if (!fullname) {
      return res.status(400).send("Full name is required.");
    }
    if (store.usersByEmail.has(email)) {
      return res.status(409).send("An account with this email already exists.");
    }

    const upstream = upstreamBaseUrl.replace(/\/+$/, "");
    const resp = await fetch(`${upstream}/v1/auth/bots/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_email: email, owner_fullname: fullname }),
    });
    const data = (await resp.json().catch(() => null)) as { data?: { api_key?: string }; error?: string } | null;
    if (!resp.ok || !data?.data?.api_key) {
      return res.status(resp.status || 502).send(data?.error ?? "Failed to create your API key. Please try again later.");
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      id: randomUUID(),
      email,
      fullname,
      passwordHash: hash,
      salt,
      drukasiaApiKey: data.data.api_key,
    };
    store.users.set(user.id, user);
    store.usersByEmail.set(email, user.id);

    const redirect = new URL("/oauth/login", publicBaseUrl);
    redirect.searchParams.set("login_id", loginId);
    redirect.searchParams.set("email", email);
    redirect.searchParams.set("signed_up", "1");
    res.redirect(redirect.toString());
  });

  // POST /auth/register — create a user account (mints a Druk Asia key if none supplied).
  router.post("/auth/register", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const fullname = String(req.body?.fullname ?? "").trim();
    const providedKey = String(req.body?.drukasia_api_key ?? "").trim();

    if (!email || !password || !fullname) {
      return res.status(400).json({ error: "email, password and fullname are required" });
    }
    if (store.usersByEmail.has(email)) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    let apiKey = providedKey;
    if (!apiKey) {
      const upstream = upstreamBaseUrl.replace(/\/+$/, "");
      const resp = await fetch(`${upstream}/v1/auth/bots/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_email: email, owner_fullname: fullname }),
      });
      const data = (await resp.json().catch(() => null)) as { data?: { api_key?: string } } | null;
      if (!resp.ok || !data?.data?.api_key) {
        return res.status(resp.status || 502).json(data ?? { error: "Failed to mint API key" });
      }
      apiKey = data.data.api_key;
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      id: randomUUID(),
      email,
      fullname,
      passwordHash: hash,
      salt,
      drukasiaApiKey: apiKey,
    };
    store.users.set(user.id, user);
    store.usersByEmail.set(email, user.id);

    res.status(201).json({ user_id: user.id, email: user.email });
  });

  return router;
}

function createAuthCode(
  store: MemoryStore,
  record: { clientId: string; redirectUri: string; codeChallenge: string; userId: string },
): string {
  const code = `${Date.now().toString(36)}-${randomUUID().replace(/-/g, "")}`;
  store.authCodes.set(code, { ...record, expiresAt: Date.now() + 5 * 60 * 1000 });
  return code;
}
