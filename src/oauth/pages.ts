export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = `
  :root {
    --da-forest: #0f1f0f;
    --da-forest-2: #162616;
    --da-forest-3: #1d341e;
    --da-gold: #c9970a;
    --da-gold-lt: #f0b400;
    --da-cream: #faf7f2;
    --da-warm-gray: #f0ece5;
    --da-text: #1a1a1a;
    --da-muted: #5a5450;
    --da-ember: #c8260d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--da-cream);
    background:
      radial-gradient(1100px 520px at 88% -10%, rgba(240,180,0,0.20), transparent 55%),
      radial-gradient(900px 620px at -10% 112%, rgba(201,151,10,0.12), transparent 55%),
      linear-gradient(160deg, var(--da-forest) 0%, var(--da-forest-2) 55%, var(--da-forest-3) 100%);
  }
  .page { width: 100%; display: flex; justify-content: center; }
  .card {
    width: 100%;
    max-width: 420px;
    background: var(--da-cream);
    color: var(--da-text);
    border: 1px solid rgba(240,180,0,0.28);
    border-radius: 18px;
    padding: 40px 34px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.38);
  }
  .brand { text-align: center; margin-bottom: 24px; }
  .logo-img { display: block; height: auto; margin: 0 auto; }
  h1 {
    font-family: 'Sofia Sans', Georgia, serif;
    font-weight: 700;
    font-size: 23px;
    color: var(--da-forest);
    margin: 0 0 6px;
  }
  .lead { margin: 0 0 22px; color: var(--da-muted); font-size: 14px; line-height: 1.5; }
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--da-forest);
    margin: 0 0 6px;
  }
  input {
    width: 100%;
    padding: 12px 14px;
    margin-bottom: 16px;
    border: 1px solid #d9d2c4;
    border-radius: 10px;
    font: inherit;
    font-size: 15px;
    color: var(--da-text);
    background: #fff;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  input:focus {
    outline: none;
    border-color: var(--da-gold);
    box-shadow: 0 0 0 3px rgba(240,180,0,0.22);
  }
  .btn {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 13px;
    border: none;
    border-radius: 10px;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    color: var(--da-forest);
    background: linear-gradient(180deg, var(--da-gold-lt), var(--da-gold));
    box-shadow: 0 6px 18px rgba(201,151,10,0.30);
    transition: filter .15s ease, transform .05s ease;
  }
  .btn:hover { filter: brightness(1.05); }
  .btn:active { transform: translateY(1px); }
  .foot { margin-top: 20px; text-align: center; font-size: 13px; color: var(--da-muted); }
  .foot a { color: var(--da-forest); font-weight: 600; text-decoration: none; }
  .foot a:hover { text-decoration: underline; }
  .note {
    background: #fdf6e0;
    border: 1px solid var(--da-gold);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--da-forest);
  }
  .error {
    background: rgba(200,38,13,0.08);
    border: 1px solid rgba(200,38,13,0.35);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
    font-size: 14px;
    color: var(--da-ember);
  }
  .consent {
    background: #fdf6e0;
    border: 1px solid var(--da-gold);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--da-forest);
  }
  .consent code { word-break: break-all; font-weight: 700; }
  .consent .warn { display: block; margin-top: 8px; font-size: 13px; color: var(--da-muted); }
  .btn-secondary {
    background: transparent;
    box-shadow: none;
    border: 1px solid #d9d2c4;
    margin-top: 10px;
  }
  .site-footer { margin-top: 22px; text-align: center; font-size: 12px; }
  .site-footer a { color: rgba(250,247,242,0.72); text-decoration: none; }
  .site-footer a:hover { color: var(--da-gold-lt); text-decoration: underline; }
`;

export function brand(): string {
  return `<div class="brand">
    <img class="logo-img" src="https://cdn.drukasia.com/www/images/media/da-icon-highres.webp" alt="Druk Asia" width="150" />
  </div>`;
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <link rel="icon" href="https://www.drukasia.com/favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sofia+Sans:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>${STYLES}</style>
  </head>
  <body>
    <main class="page">${body}</main>
    <footer class="site-footer"><a href="https://www.drukasia.com/privacy-policy/">Privacy Policy</a></footer>
  </body>
</html>`;
}

/**
 * Security headers for the auth pages: no framing (clickjacking of the consent
 * screen), no referrer (login_id lives in the URL), no caching.
 *
 * `form-action` is intentionally omitted: the login POST redirects to the
 * client's redirect_uri, and browsers apply form-action to that redirect.
 */
export const AUTH_PAGE_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src https://cdn.drukasia.com https://www.drukasia.com; " +
    "frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

/** Body shown when a login link is opened outside the browser that started the flow. */
export function loginLinkInvalidPage(): string {
  return layout(
    "Sign-in link not valid",
    `<div class="card">
      ${brand()}
      <h1>Sign-in link not valid</h1>
      <div class="error">This sign-in link has expired or was opened in a different browser.</div>
      <p class="lead">Start the connection again from your AI app (Claude, ChatGPT, …).
      Never sign in from a link someone else sent you.</p>
    </div>`,
  );
}

/** Combined sign-in + consent form for a pending OAuth authorization. */
export function loginConsentPage(opts: {
  loginId: string;
  csrfToken: string;
  clientName: string | undefined;
  redirectTo: string;
  email: string;
  signedUp: boolean;
}): string {
  const app = opts.clientName?.trim()
    ? `<strong>${esc(opts.clientName.trim().slice(0, 100))}</strong> (name supplied by the app, not verified)`
    : "<strong>An application</strong>";
  return layout(
    "Sign in",
    `<div class="card">
      ${brand()}
      <h1>Sign in and allow access</h1>
      ${opts.signedUp ? '<div class="note">Account created — please sign in.</div>' : ""}
      <div class="consent">
        ${app} wants to access your Druk Asia account. It will be able to view and create
        members and bookings and create payment links on your behalf.
        <br />After you allow access you will be sent to: <code>${esc(opts.redirectTo)}</code>
        <span class="warn">Only continue if you started this connection yourself and recognise that address.</span>
      </div>
      <form method="POST" action="/oauth/login">
        <input type="hidden" name="login_id" value="${esc(opts.loginId)}" />
        <input type="hidden" name="csrf_token" value="${esc(opts.csrfToken)}" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="${esc(opts.email)}" placeholder="you@example.com" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" required />
        <button class="btn" type="submit" name="decision" value="allow">Sign in and allow</button>
      </form>
      <form method="POST" action="/oauth/login">
        <input type="hidden" name="login_id" value="${esc(opts.loginId)}" />
        <input type="hidden" name="csrf_token" value="${esc(opts.csrfToken)}" />
        <button class="btn btn-secondary" type="submit" name="decision" value="deny">Cancel</button>
      </form>
      <p class="foot">No account? <a href="/oauth/signup?login_id=${encodeURIComponent(opts.loginId)}">Create one</a></p>
    </div>`,
  );
}
