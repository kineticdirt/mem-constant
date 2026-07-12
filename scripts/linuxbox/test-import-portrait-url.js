/**
 * Self-check for portrait URL import validation + fetch (loopback dry-run).
 * Run: node scripts/linuxbox/test-import-portrait-url.js
 */
"use strict";

const http = require("http");
const path = require("path");

const CHAR_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const CHAR_PORTRAIT_UPLOAD_MAX = 4 * 1024 * 1024;
const CHAR_IMAGE_CT_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

function isBlockedPortraitFetchHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function assertPortraitFetchUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("bad_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url_http_https_only");
  }
  if (parsed.username || parsed.password) throw new Error("url_credentials_forbidden");
  if (isBlockedPortraitFetchHost(parsed.hostname)) throw new Error("url_host_blocked");
  return parsed;
}

function extFromContentType(ct) {
  const base = String(ct || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return CHAR_IMAGE_CT_EXT[base] || "";
}

function portraitFilenameFromUrl(parsedUrl, contentType) {
  let leaf = path.basename(parsedUrl.pathname || "") || "portrait";
  try {
    leaf = decodeURIComponent(leaf);
  } catch {
    /* keep */
  }
  leaf = leaf.split("?")[0].replace(/[^a-zA-Z0-9._-]+/g, "_") || "portrait";
  let ext = path.extname(leaf).toLowerCase();
  if (!CHAR_IMAGE_EXTS.has(ext)) {
    ext = extFromContentType(contentType) || ".jpg";
    leaf = `${path.basename(leaf, path.extname(leaf)) || "portrait"}${ext}`;
  }
  return leaf;
}

function fetchPortraitImageBuffer(imageUrl, timeoutMs = 5000, allowLoopbackPort) {
  const maxRedirects = 3;
  function getOnce(urlStr, redirectsLeft) {
    let parsed = new URL(String(urlStr || "").trim());
    if (
      !(
        allowLoopbackPort &&
        parsed.hostname === "127.0.0.1" &&
        parsed.port === String(allowLoopbackPort)
      )
    ) {
      parsed = assertPortraitFetchUrl(urlStr);
    } else if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("url_http_https_only");
    }
    return new Promise((resolve, reject) => {
      const lib = parsed.protocol === "https:" ? require("https") : http;
      const req = lib.get(
        parsed,
        {
          headers: {
            "User-Agent": "linuxbox-status-portrait-import/1.0",
            Accept: "image/*,*/*;q=0.8",
          },
          timeout: timeoutMs,
        },
        (res) => {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error("too_many_redirects"));
              return;
            }
            getOnce(new URL(res.headers.location, parsed).href, redirectsLeft - 1).then(resolve, reject);
            return;
          }
          if (code === 403) {
            res.resume();
            reject(new Error("fetch_forbidden_403"));
            return;
          }
          if (code === 404) {
            res.resume();
            reject(new Error("fetch_not_found_404"));
            return;
          }
          if (code >= 400) {
            res.resume();
            reject(new Error(`fetch_http_${code}`));
            return;
          }
          const ct = String(res.headers["content-type"] || "");
          const ctBase = ct.split(";")[0].trim().toLowerCase();
          if (ctBase && !ctBase.startsWith("image/")) {
            res.resume();
            reject(new Error("not_an_image"));
            return;
          }
          const chunks = [];
          let total = 0;
          res.on("data", (c) => {
            total += c.length;
            if (total > CHAR_PORTRAIT_UPLOAD_MAX) {
              req.destroy();
              reject(new Error("image_too_large"));
              return;
            }
            chunks.push(c);
          });
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            if (!buf.length) {
              reject(new Error("empty_image"));
              return;
            }
            const ext = extFromContentType(ct) || path.extname(parsed.pathname).toLowerCase();
            if (!ctBase && !CHAR_IMAGE_EXTS.has(ext)) {
              reject(new Error("not_an_image"));
              return;
            }
            resolve({ buf, filename: portraitFilenameFromUrl(parsed, ct), contentType: ctBase || "" });
          });
        }
      );
      req.on("error", (e) => reject(new Error(e.message || "fetch_failed")));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("fetch_timeout"));
      });
    });
  }
  return getOnce(String(imageUrl || "").trim(), maxRedirects);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isBlockedPortraitFetchHost("127.0.0.1"), "loopback blocked");
assert(isBlockedPortraitFetchHost("localhost"), "localhost blocked");
assert(isBlockedPortraitFetchHost("192.168.1.1"), "rfc1918 blocked");
assert(!isBlockedPortraitFetchHost("i.ytimg.com"), "ytimg allowed");
assert(!isBlockedPortraitFetchHost("cdn.discordapp.com"), "discord cdn allowed");

try {
  assertPortraitFetchUrl("file:///etc/passwd");
  throw new Error("file scheme should fail");
} catch (e) {
  assert(e.message === "url_http_https_only", `got ${e.message}`);
}

try {
  assertPortraitFetchUrl("http://127.0.0.1/x.png");
  throw new Error("loopback should fail");
} catch (e) {
  assert(e.message === "url_host_blocked", `got ${e.message}`);
}

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const srv = http.createServer((req, res) => {
  if (req.url === "/ok.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png1x1.length });
    res.end(png1x1);
    return;
  }
  if (req.url === "/html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html></html>");
    return;
  }
  if (req.url === "/forbid") {
    res.writeHead(403);
    res.end("no");
    return;
  }
  res.writeHead(404);
  res.end();
});

srv.listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  try {
    const ok = await fetchPortraitImageBuffer(`http://127.0.0.1:${port}/ok.png`, 5000, port);
    assert(ok.buf.length === png1x1.length, "png bytes");
    assert(ok.filename.endsWith(".png"), `filename ${ok.filename}`);

    let failed = "";
    try {
      await fetchPortraitImageBuffer(`http://127.0.0.1:${port}/html`, 5000, port);
    } catch (e) {
      failed = e.message;
    }
    assert(failed === "not_an_image", `html got ${failed}`);

    failed = "";
    try {
      await fetchPortraitImageBuffer(`http://127.0.0.1:${port}/forbid`, 5000, port);
    } catch (e) {
      failed = e.message;
    }
    assert(failed === "fetch_forbidden_403", `403 got ${failed}`);

    console.log("OK import-portrait-url self-check");
  } finally {
    srv.close();
  }
});
