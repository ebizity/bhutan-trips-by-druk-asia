/**
 * Self-contained HTML documentation page served at /docs.
 *
 * The page fetches README.md from the repository's default branch and renders it
 * with marked.js, so the README stays the single source of truth and the docs page
 * always reflects the latest documentation.
 */
export const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bhutan Trips by Druk Asia — MCP Server</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  a { color: #2f6feb; }
  h1, h2 { border-bottom: 1px solid #e5e5e5; padding-bottom: .3em; }
  pre { background: #f6f8fa; padding: 1em; border-radius: 6px; overflow-x: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; background: #f0f0f0; padding: .15em .3em; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: .4em .7em; text-align: left; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e6e6; background: #0d1117; }
    h1, h2 { border-color: #30363d; }
    pre, code { background: #161b22; }
    th, td { border-color: #30363d; }
  }
</style>
</head>
<body>
<main id="content"><p>Loading documentation…</p></main>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
fetch('https://raw.githubusercontent.com/ebizity/bhutan-trips-by-druk-asia/main/README.md')
  .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then(function (md) { document.getElementById('content').innerHTML = marked.parse(md); })
  .catch(function () {
    document.getElementById('content').innerHTML =
      '<p>Failed to load documentation. See <a href="https://github.com/ebizity/bhutan-trips-by-druk-asia">github.com/ebizity/bhutan-trips-by-druk-asia</a>.</p>';
  });
</script>
</body>
</html>`;
