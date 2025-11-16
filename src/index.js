export default {
  async fetch(request) {
    // ========== CONFIG ==========
    // Change these to your brand / credentials
    const ADMIN_USER = "admin";
    const ADMIN_PASS = "strongpassword"; // change this

    // Items: add / edit panels here.
    // Each item: id (unique), title, desc, filename, content (script or file content)
    // For permanent dynamic storage, use Workers KV or Pages + GitHub instead of editing code.
    const ITEMS = [
      {
        id: "panel-1",
        title: "Installer - Example A",
        desc: "Auto-installer for Example A (run with curl | bash).",
        filename: "installer-example-a.sh",
        content: `#!/usr/bin/env bash
echo "Running Example A installer..."
# put real install steps here
sleep 1
echo "Done Example A!"
`
      },
      {
        id: "panel-2",
        title: "Tool - Example B",
        desc: "Small tool script B",
        filename: "tool-b.sh",
        content: `#!/usr/bin/env bash
echo "Tool B started"
# tool commands...
`
      }
      // Add more items up to whatever you want.
    ];

    // ========== Helpers ==========
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Basic auth check helper
    function parseBasicAuth(header) {
      if (!header) return null;
      if (!header.startsWith("Basic ")) return null;
      try {
        const creds = atob(header.split(" ")[1]);
        const [u, p] = creds.split(":");
        return {u, p};
      } catch (e) { return null; }
    }

    // ---------- ROUTES ----------

    // 1) API: list items JSON
    if (pathname === "/api/list") {
      return new Response(JSON.stringify(ITEMS, null, 2), {
        headers: { "Content-Type": "application/json;charset=utf-8" }
      });
    }

    // 2) API: admin add (POST) - only for demonstration (in-memory only)
    if (pathname === "/api/admin/add" && request.method === "POST") {
      const auth = parseBasicAuth(request.headers.get("authorization") || "");
      if (!auth || auth.u !== ADMIN_USER || auth.p !== ADMIN_PASS) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Admin"' }
        });
      }
      try {
        const body = await request.json();
        // Expect body: { id, title, desc, filename, content }
        if (!body?.id || !body?.title || !body?.content || !body?.filename) {
          return new Response("Bad request - id/title/filename/content required", { status: 400 });
        }
        // NOTE: This adds only in-memory for this instance. Deploy changes or use KV for persistence.
        ITEMS.push({
          id: String(body.id),
          title: String(body.title),
          desc: String(body.desc || ""),
          filename: String(body.filename),
          content: String(body.content)
        });
        return new Response("Added (in-memory) - restart or redeploy required for permanent storage", { status: 200 });
      } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    // 3) Download endpoint: /download/{id}
    if (pathname.startsWith("/download/")) {
      const id = decodeURIComponent(pathname.split("/").pop());
      const item = ITEMS.find(i => i.id === id);
      if (!item) return new Response("Not found", { status: 404 });
      // Serve as downloadable file, with basic headers for curl/wget and browser.
      return new Response(item.content, {
        headers: {
          "Content-Type": "application/x-sh; charset=utf-8",
          "Content-Disposition": `attachment; filename="${item.filename}"`,
          // Encourage curl to show progress in terminal
          "Cache-Control": "no-cache"
        }
      });
    }

    // 4) Root: serve HTML panel (single-file app)
    if (pathname === "/" || pathname === "") {
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Mr.TypeVC Panel</title>
<style>
  :root{--bg:#0f1724;--card:#0b1220;--accent:#00c2ff;--muted:#9aa5b1;--white:#e6eef6}
  body{margin:0;font-family:Inter,system-ui,Segoe UI,Arial;background:linear-gradient(180deg,#071129 0%,#07182b 100%);color:var(--white)}
  .wrap{max-width:980px;margin:28px auto;padding:18px}
  header{display:flex;align-items:center;gap:14px}
  .logo{width:64px;height:64px;background:var(--card);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:22px}
  h1{margin:0;font-size:20px}
  p.lead{color:var(--muted);margin:6px 0 18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
  .card{background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:14px;border-radius:12px;box-shadow:0 4px 18px rgba(2,6,23,0.6)}
  .card h3{margin:0 0 8px}
  .card p{margin:0 0 12px;color:var(--muted);font-size:14px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .btn{background:var(--accent);color:#001827;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:600;border:none;cursor:pointer}
  .btn.ghost{background:transparent;color:var(--accent);border:1px solid rgba(255,255,255,0.06)}
  footer{margin-top:18px;color:var(--muted);font-size:13px}
  .note{font-size:12px;color:var(--muted);margin-top:8px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">MR</div>
    <div>
      <h1>Mr.TypeVC — Download Panel</h1>
      <p class="lead">Click an item to download. Use the terminal command example for one-line install (curl | bash).</p>
    </div>
  </header>

  <div id="items" class="grid" style="margin-top:18px"></div>

  <div class="note">
    <strong>Terminal / one-line:</strong>
    <div style="margin-top:6px"><code id="curlExample">curl -L -o installer.sh "DOWNLOAD_URL" && bash installer.sh</code></div>
    <div style="margin-top:6px;color:var(--muted)">Or: <code>curl -L "DOWNLOAD_URL" | bash</code> (use only trusted sources)</div>
  </div>

  <footer>Managed by Mr.TypeVC • Edit the worker to add more panels or use KV for dynamic storage.</footer>
</div>

<script>
const ITEMS = ${JSON.stringify(ITEMS)};
const base = location.origin;

function mkCard(item) {
  const div = document.createElement("div");
  div.className = "card";
  const title = document.createElement("h3"); title.textContent = item.title;
  const desc = document.createElement("p"); desc.textContent = item.desc || "";
  const row = document.createElement("div"); row.className = "row";
  const dl = document.createElement("a"); dl.className="btn"; dl.href = base + "/download/" + encodeURIComponent(item.id);
  dl.textContent = "Download";
  dl.setAttribute("download", item.filename);
  const cmd = document.createElement("button"); cmd.className = "btn ghost";
  cmd.textContent = "Copy curl && Run";
  cmd.onclick = () => {
    const url = base + "/download/" + encodeURIComponent(item.id);
    const example = \`curl -L "\${url}" | bash\`;
    navigator.clipboard?.writeText(example).then(()=>alert("Command copied to clipboard:\n"+example));
  };
  row.appendChild(dl); row.appendChild(cmd);
  div.appendChild(title); div.appendChild(desc); div.appendChild(row);
  return div;
}

const el = document.getElementById("items");
for (const it of ITEMS) el.appendChild(mkCard(it));

// update curl example with first item by default
if (ITEMS.length>0) {
  const url = location.origin + "/download/" + encodeURIComponent(ITEMS[0].id);
  document.getElementById("curlExample").textContent = \`curl -L "\${url}" | bash\`;
}
</script>
</body>
</html>
`;
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Default: 404
    return new Response("Not found", { status: 404 });
  }
};
