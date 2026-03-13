import type { FastifyInstance } from "fastify";
import { hasAuthenticatedSession } from "../auth/session.js";

function loginHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Cost Tracker - Login</title>
  <style>
    :root {
      --bg: #f8efe2;
      --bg2: #f2f8ff;
      --ink: #1f262f;
      --accent: #e1562b;
      --panel: #ffffff;
      --shadow: rgba(25, 31, 39, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at 0% 0%, #ffd8bc 0%, transparent 45%),
                  radial-gradient(circle at 100% 100%, #c6e4ff 0%, transparent 45%),
                  linear-gradient(140deg, var(--bg), var(--bg2));
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(460px, 100%);
      background: var(--panel);
      border-radius: 20px;
      padding: 34px 28px;
      box-shadow: 0 20px 45px var(--shadow);
      animation: rise 350ms ease-out;
    }
    h1 { margin: 0 0 10px; font-size: 2rem; letter-spacing: -0.03em; }
    p { margin: 0 0 22px; color: #4e5d6f; }
    label { display: block; font-weight: 600; margin-bottom: 8px; }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 2px solid #d7dee8;
      border-radius: 12px;
      font: inherit;
      margin-bottom: 14px;
      transition: border-color 140ms ease;
    }
    input:focus { outline: none; border-color: #6f9fd4; }
    button {
      width: 100%;
      border: 0;
      border-radius: 12px;
      background: linear-gradient(90deg, #e1562b, #ec7b35);
      color: #fff;
      font: inherit;
      font-weight: 700;
      padding: 12px 14px;
      cursor: pointer;
    }
    #error {
      min-height: 1.2em;
      color: #b50000;
      margin-top: 12px;
      font-size: 0.95rem;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>AI Cost Tracker</h1>
    <p>Sign in with your server password.</p>
    <form id="login-form">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
      <div id="error"></div>
    </form>
  </main>
  <script>
    const form = document.getElementById("login-form");
    const errorEl = document.getElementById("error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.textContent = "";
      const password = document.getElementById("password").value;
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        errorEl.textContent = "Login failed.";
        return;
      }
      location.href = "/";
    });
  </script>
</body>
</html>`;
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Cost Tracker</title>
  <style>
    :root {
      --bg: #fafafa;
      --ink: #161616;
      --muted: #666666;
      --panel: #ffffff;
      --line: #d9d9d9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
      padding: 20px;
    }
    .shell {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    .cards {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .card-line {
      font-size: 0.98rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .meta {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      margin-bottom: 16px;
    }
    .server-notice {
      display: none;
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid #e5b566;
      background: #fff6e5;
      color: #6a4b14;
      line-height: 1.4;
    }
    .server-notice.visible {
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 880px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--line);
      font-size: 0.95rem;
    }
    th {
      background: #f3f3f3;
      font-weight: 600;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    .toolbar {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      border: 0;
      border-radius: 11px;
      background: #202a38;
      color: #fff;
      font: inherit;
      padding: 10px 14px;
      cursor: pointer;
    }
    .details {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 16px;
    }
    .detail-card {
      background: linear-gradient(180deg, #ffffff, #fbfcff);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
    }
    .detail-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
    }
    .detail-title {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .detail-status {
      border-radius: 999px;
      padding: 4px 9px;
      background: #edf1f7;
      color: #233043;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: minmax(110px, 150px) minmax(0, 1fr);
      gap: 8px 12px;
      margin: 0;
    }
    .detail-grid dt {
      margin: 0;
      color: var(--muted);
      font-size: 0.84rem;
      font-weight: 600;
    }
    .detail-grid dd {
      margin: 0;
      font-size: 0.92rem;
      line-height: 1.35;
      word-break: break-word;
    }
    @media (max-width: 800px) {
      .cards {
        grid-template-columns: 1fr;
      }
      .details {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>AI Cost Tracker</h1>
      <div class="meta">Updated: <span id="updated-at">-</span></div>
    </header>
    <section class="cards" id="cards"></section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr id="table-head"></tr>
        </thead>
        <tbody id="table-body"></tbody>
      </table>
    </section>
    <section class="server-notice" id="server-notice" aria-live="polite"></section>
    <section class="details" id="provider-details"></section>
    <div class="toolbar">
      <button id="refresh-btn" type="button">Refresh Now</button>
      <button id="logout-btn" type="button">Logout</button>
    </div>
  </div>
  <script>
    const cardsEl = document.getElementById("cards");
    const headEl = document.getElementById("table-head");
    const bodyEl = document.getElementById("table-body");
    const updatedEl = document.getElementById("updated-at");
    const providerDetailsEl = document.getElementById("provider-details");
    const serverNoticeEl = document.getElementById("server-notice");

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function render(snapshot) {
      updatedEl.textContent = new Date(snapshot.generatedAt).toLocaleString();
      cardsEl.innerHTML = snapshot.summaryCards.map((card) => {
        return '<article class="card">' +
          '<div class="card-line">' + escapeHtml(card.provider) + ': ' + escapeHtml(card.remaining) + '</div>' +
        '</article>';
      }).join("");
      headEl.innerHTML = snapshot.headers.map((header) => "<th>" + escapeHtml(header) + "</th>").join("");
      bodyEl.innerHTML = snapshot.rows.map((row) => {
        return "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>";
      }).join("");
      providerDetailsEl.innerHTML = snapshot.providerDetails.map((card) => {
        const rows = card.entries.map((entry) => {
          return "<dt>" + escapeHtml(entry.label) + "</dt><dd>" + escapeHtml(entry.value) + "</dd>";
        }).join("");
        return '<article class="detail-card">' +
          '<div class="detail-head">' +
            '<h2 class="detail-title">' + escapeHtml(card.title) + '</h2>' +
            '<div class="detail-status">' + escapeHtml(card.status) + '</div>' +
          '</div>' +
          '<dl class="detail-grid">' + rows + '</dl>' +
        '</article>';
      }).join("");
    }

    function clearServerNotice() {
      serverNoticeEl.textContent = "";
      serverNoticeEl.classList.remove("visible");
    }

    function setServerNotice(message) {
      serverNoticeEl.textContent = message;
      serverNoticeEl.classList.add("visible");
    }

    async function loadSnapshot() {
      try {
        const response = await fetch("/api/snapshot", { credentials: "same-origin" });
        if (response.status === 401) {
          location.href = "/login";
          return;
        }
        if (!response.ok) {
          throw new Error("Snapshot failed: " + response.status);
        }
        const snapshot = await response.json();
        render(snapshot);
        clearServerNotice();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown snapshot error.";
        setServerNotice("Server refresh failed. Showing the last available data. " + reason);
        throw error;
      }
    }

    async function logout() {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      location.href = "/login";
    }

    document.getElementById("refresh-btn").addEventListener("click", () => loadSnapshot().catch(console.error));
    document.getElementById("logout-btn").addEventListener("click", () => logout().catch(console.error));

    loadSnapshot().catch(console.error);
    setInterval(() => loadSnapshot().catch(console.error), 60000);
  </script>
</body>
</html>`;
}

export async function registerWebRoutes(app: FastifyInstance): Promise<void> {
  app.get("/login", async (request, reply) => {
    if (hasAuthenticatedSession(request)) {
      return reply.redirect("/");
    }
    return reply.type("text/html; charset=utf-8").send(loginHtml());
  });

  app.get("/", async (request, reply) => {
    if (!hasAuthenticatedSession(request)) {
      return reply.redirect("/login");
    }
    return reply.type("text/html; charset=utf-8").send(dashboardHtml());
  });
}
