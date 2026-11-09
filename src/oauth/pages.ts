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
