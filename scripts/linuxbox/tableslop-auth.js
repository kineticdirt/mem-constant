/**
 * tableslop Discord auth store — users / roles / OAuth tokens / sessions.
 *
 * DB: sql.js (SQLite→WASM, pure JS). Chosen over better-sqlite3 because sql.js
 * needs zero native builds (better-sqlite3 build-from-source on the 2 GB ARM
 * linuxbox is the known failure mode); the DB buffer is persisted to disk
 * atomically (tmp + rename) after every mutation. Real "SQLite format 3" file,
 * so it can be inspected with any sqlite3 CLI.
 *
 * No secrets are logged. Tokens stay server-side; the client only ever holds
 * the opaque session cookie.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const initSqlJs = require("./vendor/sql-js/sql-wasm.js");

const ROLES = Object.freeze(["owner", "admin", "user"]);
const EDIT_ROLES = Object.freeze(new Set(["owner", "admin"]));
const DISCORD_API_BASE = process.env.DISCORD_API_BASE || "https://discord.com/api";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  discord_id    TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner','admin','user')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id       TEXT PRIMARY KEY REFERENCES users(discord_id),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(discord_id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`;

function avatarUrl(discordId, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
  }
  return "";
}

class TableslopAuth {
  constructor(dbPath, ownerDiscordId) {
    this.dbPath = dbPath;
    this.ownerDiscordId = ownerDiscordId || "";
    this.db = null;
  }

  async init() {
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(__dirname, "vendor", "sql-js", f),
    });
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    if (fs.existsSync(this.dbPath) && fs.statSync(this.dbPath).size > 0) {
      this.db = new SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new SQL.Database();
    }
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run(SCHEMA);
    this._persist();
    return this;
  }

  /** Atomic write: full buffer to tmp file, then rename over the DB. */
  _persist() {
    const buf = Buffer.from(this.db.export());
    const tmp = `${this.dbPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, this.dbPath);
  }

  _one(sql, params) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params || []);
      return stmt.step() ? stmt.getAsObject() : null;
    } finally {
      stmt.free();
    }
  }

  _all(sql, params) {
    const stmt = this.db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params || []);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  _run(sql, params) {
    this.db.run(sql, params || []);
    this._persist();
  }

  getUser(discordId) {
    return this._one("SELECT * FROM users WHERE discord_id = ?", [String(discordId)]);
  }

  listUsers() {
    return this._all(
      "SELECT discord_id, username, avatar, role, created_at, last_login_at FROM users ORDER BY created_at ASC"
    );
  }

  /**
   * Insert or refresh a user at login. Role resolution:
   *  - env owner id always wins (bootstrap / re-assert on every login),
   *  - existing role is preserved,
   *  - brand-new users default to 'user'.
   * forceRole is dev-login only (TABLESLOP_DEV_AUTH) — never from the OAuth path.
   */
  upsertUser({ discordId, username, avatarHash, forceRole }) {
    const id = String(discordId);
    const now = Date.now();
    const existing = this.getUser(id);
    let role = existing ? existing.role : "user";
    if (this.ownerDiscordId && id === this.ownerDiscordId) role = "owner";
    if (forceRole && ROLES.includes(forceRole)) role = forceRole;
    const avatar = avatarUrl(id, avatarHash) || (existing ? existing.avatar : "");
    if (existing) {
      this._run(
        "UPDATE users SET username = ?, avatar = ?, role = ?, last_login_at = ? WHERE discord_id = ?",
        [String(username || existing.username), avatar, role, now, id]
      );
    } else {
      this._run(
        "INSERT INTO users (discord_id, username, avatar, role, created_at, last_login_at) VALUES (?,?,?,?,?,?)",
        [id, String(username || id), avatar, role, now, now]
      );
    }
    return this.getUser(id);
  }

  /**
   * Owner-only role management. The env-bootstrapped owner row can neither be
   * demoted nor can owner be granted over the API — owner comes from env only,
   * so a bad click can never lock the GM out.
   */
  setUserRole(discordId, role) {
    const id = String(discordId);
    if (role === "owner" || !ROLES.includes(role)) {
      throw new Error("role must be admin or user (owner comes from TABLESLOP_OWNER_DISCORD_ID)");
    }
    if (this.ownerDiscordId && id === this.ownerDiscordId) {
      throw new Error("cannot change the env-bootstrapped owner's role");
    }
    if (!this.getUser(id)) throw new Error("unknown user");
    this._run("UPDATE users SET role = ? WHERE discord_id = ?", [role, id]);
    return this.getUser(id);
  }

  saveTokens(userId, tok) {
    const now = Date.now();
    const expiresAt = now + Math.max(0, Number(tok.expires_in) || 0) * 1000;
    const prev = this._one("SELECT refresh_token FROM oauth_tokens WHERE user_id = ?", [userId]);
    const refresh = tok.refresh_token || (prev && prev.refresh_token) || "";
    this._run(
      `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      [userId, String(tok.access_token || ""), refresh, expiresAt, now]
    );
    return this.getTokens(userId);
  }

  getTokens(userId) {
    return this._one("SELECT * FROM oauth_tokens WHERE user_id = ?", [userId]);
  }

  deleteTokens(userId) {
    this._run("DELETE FROM oauth_tokens WHERE user_id = ?", [userId]);
  }

  createSession(userId, days) {
    const id = crypto.randomBytes(24).toString("base64url");
    const now = Date.now();
    const expiresAt = now + days * 86400000;
    this._run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)", [
      id,
      userId,
      now,
      expiresAt,
    ]);
    return { id, expiresAt };
  }

  /** Joined session+user, or null when missing/expired (expired rows are reaped). */
  getSessionUser(sid) {
    const row = this._one(
      `SELECT s.id AS sid, s.expires_at AS session_expires_at,
              u.discord_id AS id, u.username, u.avatar, u.role
         FROM sessions s JOIN users u ON u.discord_id = s.user_id
        WHERE s.id = ?`,
      [String(sid)]
    );
    if (!row) return null;
    if (Date.now() > row.session_expires_at) {
      this._run("DELETE FROM sessions WHERE id = ?", [row.sid]);
      return null;
    }
    return row;
  }

  deleteSession(sid) {
    this._run("DELETE FROM sessions WHERE id = ?", [String(sid)]);
  }

  pruneExpiredSessions() {
    this._run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  }

  // --- Discord OAuth HTTP (authorization-code flow; base overridable for tests) ---

  async _tokenRequest(params) {
    const r = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    if (!r.ok) throw new Error(`discord token ${r.status}`);
    return r.json();
  }

  exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    return this._tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  }

  /** Refresh-token rotation: Discord hands back a NEW refresh token; both are stored. */
  async refreshTokens({ userId, clientId, clientSecret }) {
    const cur = this.getTokens(userId);
    if (!cur || !cur.refresh_token) return null;
    const tok = await this._tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: cur.refresh_token,
    });
    return this.saveTokens(userId, tok);
  }

  /**
   * Rotate only when expired (60 s skew). Returns fresh tokens, current tokens,
   * or null when nothing usable remains (dead tokens are deleted so we never
   * retry-loop against Discord).
   */
  async ensureFreshTokens(userId, clientId, clientSecret) {
    const cur = this.getTokens(userId);
    if (!cur) return null;
    if (Date.now() + 60000 < cur.expires_at) return cur;
    try {
      return await this.refreshTokens({ userId, clientId, clientSecret });
    } catch {
      this.deleteTokens(userId);
      return null;
    }
  }

  async fetchDiscordUser(accessToken) {
    const r = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`discord user ${r.status}`);
    return r.json();
  }
}

module.exports = { TableslopAuth, ROLES, EDIT_ROLES, avatarUrl };
