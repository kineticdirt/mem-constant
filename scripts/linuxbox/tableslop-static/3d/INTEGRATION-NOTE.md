# INTEGRATION-NOTE — Isla Primavera 3D island view

**What this dir is:** the static home of the stylized three.js 3D view
(spec: `docs/tableslop-3d-aesthetic.md`). Region border polygons become procedural
city blocks (Havana/Honolulu pastel; Paradise art-deco, Porto docks, Jackedsonville neon).
Rendering is 100% client-side — the server only streams files and JSON.

Shipped 2026-08-06 as **new standalone files only** — `tableslop-server.js`, the radio
lane, and auth files were intentionally NOT touched (other lanes have them open). This
note is the wiring list for whoever takes the server window. The sim lane's
`../sim/INTEGRATION-NOTE.md` already assumes the `/3d` static pattern below exists.

## Files

| File | Kind | Notes |
|------|------|-------|
| `index.html`, `app.js` | **tracked code** | The 3D page. Fetches `/api/map`; optional `/api/cities/<id>`. No build step. |
| `vendor/three/*` | **tracked vendor** | Pinned three@0.185.1 (r185) + OrbitControls, MIT — see `vendor/three/README.md`. No runtime CDN. |

## 1. Mount on the map server (required)

One stanza, no new deps. The page needs `/3d` (this dir) only — vendored three.js rides
inside at `/3d/vendor/three/` (import map is already pointed there).

```js
const THREE_D_DIR = path.join(__dirname, "tableslop-static", "3d");
const STATIC_FILE_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
function serveStaticFile(res, abs, cacheSec) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  res.writeHead(200, {
    "Content-Type": STATIC_FILE_TYPES[path.extname(abs).toLowerCase()] || "application/octet-stream",
    "Cache-Control": `public, max-age=${cacheSec}`,
  });
  fs.createReadStream(abs).pipe(res);
}
// in the route table, next to the "/" viewer route:
if (url === "/3d" || url === "/3d/" || url === "/3d/index.html") {
  serveStaticFile(res, path.join(THREE_D_DIR, "index.html"), 300);
} else if (url.startsWith("/3d/")) {
  let rel = "";
  try { rel = decodeURIComponent(url.slice("/3d/".length)); } catch { rel = ""; }
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
    res.writeHead(404); res.end("Not found");
  } else {
    serveStaticFile(res, path.join(THREE_D_DIR, rel), 300);
  }
}
```

Public like the 2D map (no auth gate on viewing). Page then lives at
`https://map.tableslop.org/3d`.

## 2. Optional `/api/cities/<region-id>` JSON route (recommended)

`app.js` fetches `/api/cities/<region-id>` per region for district-level styling
(docks keywords -> industrial masses on those lots). If the route is missing or a
region has no file, the page degrades to region-wide styling — no errors, no blocker.
The existing `loadCityData(regionId)` helper (CITIES_DIR/cityCache) already does the
disk work; the route is three lines:

```js
if (url.startsWith("/api/cities/")) {
  const id = decodeURIComponent(url.slice("/api/cities/".length));
  const city = loadCityData(id);
  if (city) sendJson(res, city, 200, 60); else { res.writeHead(404); res.end("Not found"); }
  return;
}
```

## 3. Optional 2D HUD link

The 3D page links back via its own `2D map` button (`href="/"`). To link forward from
the 2D HUD, one anchor plus one CSS line in `viewerHtml`:

```html
<a class="hud-res" id="view3dLink" href="/3d" title="Stylized 3D island view (three.js)">3D</a>
```

```css
.hud a.hud-res { text-decoration:none; display:inline-flex; align-items:center; }
```

## 4. Deploy lists (already updated on PC)

- `scripts/pc/push-linuxbox.sh` — `scripts/linuxbox/tableslop-static/3d`
- `scripts/linuxbox/push-tableslop-map.sh` — `scripts/linuxbox/tableslop-static/3d`
- `agents/linuxbox-deploy-manifest.json` — `tableslop-map` bundle `paths_hint` entries

## 5. Verify after wiring

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/3d            # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/3d/vendor/three/three.module.min.js  # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/api/cities/r02-porto-lujuria         # 200 if route added, 404 acceptable
cd .staging/tableslop-3d && npm install && node tableslop-3d-smoke.mjs      # full smoke (spawns its own static mount + upstream proxy)
```
