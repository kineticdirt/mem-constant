#!/usr/bin/env node
/**
 * Runnable check for tableslop Discord auth (roles + sessions + token store).
 * PC/local only — spawns the real server on a scratch port with TABLESLOP_DEV_AUTH=1.
 *
 * GM-sacred file guard: regions-ui.json is backed up before the admin-save step and
 * restored afterward; any `.bak-autosave-*` files created by the test are removed.
 *
 *   node scripts/linuxbox/test-tableslop-auth.js
 *
 * Exit 0 = all checks passed.
 */
"use strict";

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const SERVER = path.join(__dirname, "tableslop-server.js");
const REGIONS_UI = path.join(REPO, "campaigns", "tropic-gooner", "map", "regions-ui.json");
const SCRATCH = path.join(REPO, ".staging", "tableslop-auth-test");
const DB_PATH = path.join(SCRATCH, "auth.db");
const PORT = parseInt(process.env.TABLESLOP_AUTH_TEST_PORT || "8799", 10);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`);
  }
}

function startServer(env) {
  const childEnv = { ...process.env };
  for (const k of Object.keys(childEnv)) {
    if (k.startsWith("TABLESLOP_") || k.startsWith("DISCORD_")) delete childEnv[k];
  }
  Object.assign(childEnv, { TABLESLOP_PORT: String(PORT), TABLESLOP_HOST: "127.0.0.1" }, env);
  const child = spawn(process.execPath, [SERVER], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  child.stderrBuf = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => {
    child.stderrBuf += d;
    process.stderr.write(`[server] ${d}`);
  });
  return child;
}

async function waitUp(child, expectedGating) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}): ${child.stderrBuf.slice(-400)}`);
    }
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) {
        const h = await r.json();
        // Guard against a stale/foreign server already holding the port (Windows
        // orphans a killed child's listener sometimes) — never test against it.
        if (Boolean(h.auth_gating) !== expectedGating) {
          throw new Error(
            `port ${PORT} answered by a different tableslop instance (auth_gating=${h.auth_gating})` +
              ` — free it or set TABLESLOP_AUTH_TEST_PORT`
          );
        }
        return;
      }
    } catch (e) {
      if (e.message && e.message.includes("different tableslop")) throw e;
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null) {
        console.log("WARN: child ignored SIGTERM, escalating to SIGKILL");
        child.kill("SIGKILL");
      }
      resolve();
    }, 3000);
  });
}

function cookieOf(res) {
  const sc = res.headers.get("set-cookie") || "";
  const m = sc.match(/tableslop_session=([^;]*)/);
  return m ? `tableslop_session=${m[1]}` : null;
}

/** Read the current file and POST back its first area unchanged (merge-by-id; net-zero edit). */
function regionsUiPayload() {
  const ui = JSON.parse(fs.readFileSync(REGIONS_UI, "utf8"));
  const area = (ui.areas || []).find((a) => a && a.id && a.points);
  if (!area) throw new Error("no existing area to re-save");
  return JSON.stringify({ area });
}

async function postRegionsUi(cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`${BASE}/api/map/regions-ui`, {
    method: "POST",
    headers,
    body: regionsUiPayload(),
  });
  return r.status;
}

async function devLogin(as) {
  const r = await fetch(`${BASE}/auth/dev-login?as=${as}`, { redirect: "manual" });
  if (r.status !== 302) throw new Error(`dev-login ${as} → ${r.status}`);
  return cookieOf(r);
}

async function rotationCheck() {
  console.log("\n— refresh-token rotation (mock Discord token endpoint)");
  const seen = { grant: null };
  const mock = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/oauth2/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.grant = new URLSearchParams(body).get("grant_type");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ access_token: "rotated-at", refresh_token: "rotated-rt", expires_in: 3600 })
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  const mockPort = mock.address().port;
  const prevBase = process.env.DISCORD_API_BASE;
  process.env.DISCORD_API_BASE = `http://127.0.0.1:${mockPort}`;
  delete require.cache[require.resolve("./tableslop-auth.js")];
  const { TableslopAuth } = require("./tableslop-auth.js");
  const rotDb = path.join(SCRATCH, "rotation.db");
  const store = await new TableslopAuth(rotDb, "").init();
  store.upsertUser({ discordId: "rot-user", username: "rot", avatarHash: null });
  store.saveTokens("rot-user", { access_token: "old-at", refresh_token: "old-rt", expires_in: 0 });
  const out = await store.ensureFreshTokens("rot-user", "cid", "csecret");
  check("rotation used refresh_token grant", seen.grant === "refresh_token", seen.grant);
  check("rotation stored rotated tokens", Boolean(out && out.refresh_token === "rotated-rt"));
  const reloaded = await new TableslopAuth(rotDb, "").init();
  check(
    "rotated tokens persisted to disk",
    reloaded.getTokens("rot-user").refresh_token === "rotated-rt"
  );
  if (prevBase == null) delete process.env.DISCORD_API_BASE;
  else process.env.DISCORD_API_BASE = prevBase;
  await new Promise((r) => mock.close(r));
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  for (const f of ["auth.db", "rotation.db"]) {
    try {
      fs.unlinkSync(path.join(SCRATCH, f));
    } catch {
      /* fresh */
    }
  }

  const bakBEFORE = new Set(
    fs.readdirSync(path.dirname(REGIONS_UI)).filter((f) => f.includes(".bak-autosave-"))
  );
  const backup = REGIONS_UI + ".test-backup-" + process.pid;
  fs.copyFileSync(REGIONS_UI, backup);

  let child = null;
  try {
    console.log("— gated server (TABLESLOP_DEV_AUTH=1, REQUIRE=1)");
    child = startServer({
      TABLESLOP_DEV_AUTH: "1",
      TABLESLOP_REQUIRE_DISCORD_AUTH: "1",
      TABLESLOP_AUTH_DB: DB_PATH,
    });
    await waitUp(child, true);

    const root = await fetch(`${BASE}/`);
    check("logged-out GET / → 200 (public view)", root.status === 200, String(root.status));
    const map = await fetch(`${BASE}/api/map`);
    check("logged-out GET /api/map → 200 (public view)", map.status === 200, String(map.status));
    const meAnon = await (await fetch(`${BASE}/api/me`)).json();
    check("anon /api/me: logged_in=false, gating on", meAnon.logged_in === false && meAnon.auth_gating === true);
    check("anon edit POST → 401", (await postRegionsUi(null)) === 401);

    const userCookie = await devLogin("user");
    check("dev-login user → session cookie minted", Boolean(userCookie));
    const meUser = await (
      await fetch(`${BASE}/api/me`, { headers: { Cookie: userCookie } })
    ).json();
    check("user role=user, can_edit=false", meUser.role === "user" && meUser.can_edit === false);
    check("user edit POST → 403", (await postRegionsUi(userCookie)) === 403);
    const usersAsUser = await fetch(`${BASE}/api/auth/users`, { headers: { Cookie: userCookie } });
    check("user GET /api/auth/users → 403", usersAsUser.status === 403, String(usersAsUser.status));

    const adminCookie = await devLogin("admin");
    check("admin edit POST → 200 (regions-ui save)", (await postRegionsUi(adminCookie)) === 200);

    const ownerCookie = await devLogin("owner");
    const usersRes = await fetch(`${BASE}/api/auth/users`, { headers: { Cookie: ownerCookie } });
    const users = (await usersRes.json()).users || [];
    check("owner GET /api/auth/users → 200 with 3 dev users", usersRes.status === 200 && users.length === 3);
    const promote = await fetch(`${BASE}/api/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ id: "dev-user", role: "admin" }),
    });
    const promoted = (await promote.json()).users.find((u) => u.discord_id === "dev-user");
    check("owner promotes dev-user → admin", promote.status === 200 && promoted.role === "admin");
    const grantOwner = await fetch(`${BASE}/api/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ id: "dev-user", role: "owner" }),
    });
    check("API refuses to grant owner (env-only)", grantOwner.status === 400, String(grantOwner.status));
    const badRole = await fetch(`${BASE}/api/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ id: "dev-user", role: "superadmin" }),
    });
    check("API rejects invalid role", badRole.status === 400, String(badRole.status));

    // tampered cookie must fail
    const tampered = ownerCookie.slice(0, -4) + "AAAA";
    const meTampered = await (
      await fetch(`${BASE}/api/me`, { headers: { Cookie: tampered } })
    ).json();
    check("tampered session cookie → logged out", meTampered.logged_in === false);

    console.log("\n— restart (session persistence)");
    await stopServer(child);
    child = startServer({
      TABLESLOP_DEV_AUTH: "1",
      TABLESLOP_REQUIRE_DISCORD_AUTH: "1",
      TABLESLOP_AUTH_DB: DB_PATH,
    });
    await waitUp(child, true);
    const meAfter = await (
      await fetch(`${BASE}/api/me`, { headers: { Cookie: ownerCookie } })
    ).json();
    check("owner session survives server restart", meAfter.logged_in === true && meAfter.role === "owner");
    await stopServer(child);
    child = null;

    console.log("\n— DB inspection (vendored sql.js, after shutdown)");
    const initSqlJs = require("./vendor/sql-js/sql-wasm.js");
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(__dirname, "vendor", "sql-js", f),
    });
    const db = new SQL.Database(fs.readFileSync(DB_PATH));
    const q = (sql) => {
      const r = db.exec(sql);
      return r.length ? r[0].values : [];
    };
    const usersRows = q("SELECT discord_id, role FROM users ORDER BY discord_id");
    check("users rows: 3 dev users with roles", usersRows.length === 3, JSON.stringify(usersRows));
    const tok = q("SELECT refresh_token, expires_at FROM oauth_tokens WHERE user_id='dev-owner'")[0];
    check(
      "oauth_tokens row: refresh token + future expiry",
      Boolean(tok && tok[0] && tok[1] > Date.now())
    );
    const sess = q("SELECT COUNT(*) FROM sessions")[0];
    check("sessions rows persisted", sess && sess[0] >= 3, String(sess));
    const magic = fs.readFileSync(DB_PATH).slice(0, 15).toString();
    check("DB file is real SQLite format 3", magic === "SQLite format 3", magic);
    db.close();

    console.log("\n— zero-env parity (no TABLESLOP_*/DISCORD_* set)");
    child = startServer({});
    await waitUp(child, false);
    const root2 = await fetch(`${BASE}/`);
    check("zero-env GET / → 200", root2.status === 200);
    const me2 = await (await fetch(`${BASE}/api/me`)).json();
    check("zero-env /api/me: gating off, logged out", me2.auth_gating === false && me2.logged_in === false);
    check("zero-env edit POST → 200 (open, today's behavior)", (await postRegionsUi(null)) === 200);
    const devOff = await fetch(`${BASE}/auth/dev-login?as=owner`, { redirect: "manual" });
    check("zero-env /auth/dev-login → 404 (stub hidden)", devOff.status === 404, String(devOff.status));
    const usersOff = await fetch(`${BASE}/api/auth/users`);
    check("zero-env /api/auth/users → 404", usersOff.status === 404, String(usersOff.status));
    await stopServer(child);
    child = null;

    await rotationCheck();
  } finally {
    if (child) await stopServer(child);
    fs.copyFileSync(backup, REGIONS_UI);
    fs.unlinkSync(backup);
    const after = fs.readdirSync(path.dirname(REGIONS_UI)).filter((f) => f.includes(".bak-autosave-"));
    for (const f of after) {
      if (!bakBEFORE.has(f)) fs.unlinkSync(path.join(path.dirname(REGIONS_UI), f));
    }
  }

  console.log(`\n${failed ? "FAILED" : "PASSED"} — ${passed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
