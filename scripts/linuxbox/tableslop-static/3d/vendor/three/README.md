# Vendored three.js (tableslop 3D view)

Pinned copy for `map.tableslop.org/3d` — the box must serve it offline (Tailscale/LAN, no CDN).
Lives inside the self-contained 3D static dir (`scripts/linuxbox/tableslop-static/3d/`);
the page resolves it via the import map at `/3d/vendor/three/` (see `../../INTEGRATION-NOTE.md`).

- **Version:** three@0.185.1 (r185)
- **Source:** `npm pack three@0.185.1` → https://registry.npmjs.org/three/-/three-0.185.1.tgz
- **License:** MIT — see `LICENSE` (copied verbatim from the package).

## Files

| File | Package path | Why |
|---|---|---|
| `three.module.min.js` | `build/three.module.min.js` | ES module build; imports `./three.core.min.js` |
| `three.core.min.js` | `build/three.core.min.js` | Core half of the split build (required at runtime) |
| `OrbitControls.js` | `examples/jsm/controls/OrbitControls.js` | Camera controls; imports bare `three` (resolved by the page import map) |

## Upgrade

Supply-chain gate first (`safe-update-check.sh`), then `npm pack three@<new>` and re-copy
the same four paths. Keep the version line above in sync.
