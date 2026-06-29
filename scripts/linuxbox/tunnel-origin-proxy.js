#!/usr/bin/env node
/**
 * Cloudflare tunnel origin on :8780.
 *   /Intel*     -> public viewer dashboard :8790 (/viewer/*, no auth)
 *   /Linuxbox*  -> admin dashboard :8790 (Cloudflare Access + Basic auth)
 *   everything else -> portfolio Node app :3000
 */
const http = require("http");

const LISTEN_PORT = 8780;
const TARGET_HOST = "127.0.0.1";
const PORTFOLIO_PORT = 3000;
const LINUXBOX_PORT = 8790;
const LINUXBOX_PREFIX = "/Linuxbox";
const INTEL_PREFIX = "/Intel";

function pickTarget(url) {
  const lower = url.split("?")[0].toLowerCase();
  if (lower === INTEL_PREFIX.toLowerCase() || lower.startsWith(`${INTEL_PREFIX.toLowerCase()}/`)) {
    const stripped = url.slice(INTEL_PREFIX.length) || "/";
    const rest = stripped.startsWith("/") ? stripped : `/${stripped}`;
    return { port: LINUXBOX_PORT, path: rest === "/" ? "/viewer/" : `/viewer${rest}` };
  }
  if (lower === LINUXBOX_PREFIX.toLowerCase() || lower.startsWith(`${LINUXBOX_PREFIX.toLowerCase()}/`)) {
    const stripped = url.slice(LINUXBOX_PREFIX.length) || "/";
    return { port: LINUXBOX_PORT, path: stripped.startsWith("/") ? stripped : `/${stripped}` };
  }
  return { port: PORTFOLIO_PORT, path: url };
}

const server = http.createServer((clientReq, clientRes) => {
  const target = pickTarget(clientReq.url || "/");
  const headers = { ...clientReq.headers, host: `${TARGET_HOST}:${target.port}` };

  const upstream = http.request(
    {
      hostname: TARGET_HOST,
      port: target.port,
      path: target.path,
      method: clientReq.method,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    }
  );

  upstream.on("error", () => {
    clientRes.writeHead(502, { "Content-Type": "text/plain" });
    clientRes.end(`Bad gateway: origin on :${target.port} unreachable`);
  });

  clientReq.pipe(upstream);
});

server.listen(LISTEN_PORT, "::", () => {
  console.log(
    `tunnel origin proxy [::]:${LISTEN_PORT} -> portfolio :${PORTFOLIO_PORT}, ${INTEL_PREFIX}* -> :${LINUXBOX_PORT}/viewer, ${LINUXBOX_PREFIX}* -> :${LINUXBOX_PORT}`
  );
});
