#!/usr/bin/env python3
"""Copy green+black highway art from master-enhanced into wireframe components.

Template (cup model): terrain green/black IS the guide. We skeletonize it into
dense polylines, write highways.json, and export SVG for map overlay / Blender.

Does NOT touch city pins or regions-ui.json.

  python scripts/tableslop/extract-art-highways.py
  python scripts/tableslop/extract-art-highways.py --self-check
  python scripts/tableslop/extract-art-highways.py --blender-plane
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

try:
    from skimage.morphology import skeletonize
except ImportError:  # pragma: no cover
    skeletonize = None

ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "campaigns" / "tropic-gooner" / "map"
IMG = MAP_DIR / "master-enhanced.png"
OUT = MAP_DIR / "highways.json"
SVG_OUT = MAP_DIR / "highways-wireframe.svg"
PNG_OUT = MAP_DIR / "highways-wireframe.png"
BLEND_SCRIPT = MAP_DIR / "highways-blender-plane.py"
PROPOSALS_BAK = MAP_DIR / "highways-proposals-aug10.json"

DOT_SIZE = (2, 160)
DILATE_ITERS = 14
GREEN_GROW = 40  # flood steps along green from marker seeds
SIMPLIFY_TOL = 0.045  # map-% — keep wireframe close to art


def extract_mask(img_path: Path):
    im = Image.open(img_path).convert("RGB")
    a = np.asarray(im)
    h, w = a.shape[:2]
    r = a[:, :, 0].astype(np.int16)
    g = a[:, :, 1].astype(np.int16)
    b = a[:, :, 2].astype(np.int16)
    black = (r < 35) & (g < 35) & (b < 35)
    lab, n = ndimage.label(black)
    sizes = ndimage.sum(black, lab, index=np.arange(1, n + 1))
    lo, hi = DOT_SIZE
    dot_ids = np.where((sizes >= lo) & (sizes <= hi))[0] + 1
    if len(dot_ids) == 0:
        raise SystemExit("no black road markers found")
    cent = np.array(ndimage.center_of_mass(black, lab, dot_ids))  # y,x
    dots_yx = cent  # float

    # Green paint near black markers (+ markers themselves) = road ribbon
    dil = ndimage.binary_dilation(black, iterations=DILATE_ITERS)
    green = (g > r + 12) & (g > b + 8) & (g > 85) & (g < 210) & (r > 45) & (r < 175)
    ribbon = dil & green
    # Grow along green corridors from marker seeds (copy the painted lines, not invents)
    seeds = np.zeros_like(ribbon, dtype=bool)
    for y, x in dots_yx:
        yy, xx = int(round(y)), int(round(x))
        if 0 <= yy < h and 0 <= xx < w:
            seeds[yy, xx] = True
    grown = seeds.copy()
    frontier = seeds.copy()
    struct = ndimage.generate_binary_structure(2, 2)
    for _ in range(GREEN_GROW):
        ring = ndimage.binary_dilation(frontier, structure=struct) & green & ~grown
        if not ring.any():
            break
        grown |= ring
        frontier = ring
    ribbon = ribbon | grown
    # Keep small black squares in the mask so dots sit on the line
    for y, x in dots_yx:
        yy, xx = int(round(y)), int(round(x))
        if 0 <= yy < h and 0 <= xx < w:
            ribbon[yy, xx] = True
            ribbon[
                max(0, yy - 1) : min(h, yy + 2),
                max(0, xx - 1) : min(w, xx + 2),
            ] = True

    if skeletonize is None:
        sk = ndimage.binary_erosion(ribbon, iterations=1) & ribbon
    else:
        sk = skeletonize(ribbon)

    return {
        "h": h,
        "w": w,
        "ribbon": ribbon,
        "skel": sk,
        "dots_yx": dots_yx,
        "dot_count": int(len(dot_ids)),
    }


def neighbors8(y: int, x: int, h: int, w: int):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                yield ny, nx


def skeleton_graph(skel: np.ndarray):
    ys, xs = np.where(skel)
    nodes = set(zip(ys.tolist(), xs.tolist()))
    deg = {}
    adj = defaultdict(list)
    for y, x in nodes:
        nbrs = [(ny, nx) for ny, nx in neighbors8(y, x, skel.shape[0], skel.shape[1]) if (ny, nx) in nodes]
        deg[(y, x)] = len(nbrs)
        adj[(y, x)] = nbrs
    return nodes, adj, deg


def trace_polylines(skel: np.ndarray) -> list[list[tuple[int, int]]]:
    """Walk skeleton into polylines (junction-to-junction / endpoint-to-endpoint)."""
    nodes, adj, deg = skeleton_graph(skel)
    if not nodes:
        return []

    def is_end(p):
        return deg[p] == 1

    def is_junc(p):
        return deg[p] >= 3

    visited_edges = set()
    polylines: list[list[tuple[int, int]]] = []

    def edge_key(a, b):
        return (a, b) if a < b else (b, a)

    starts = [p for p in nodes if is_end(p) or is_junc(p)]
    if not starts:
        starts = [next(iter(nodes))]

    for start in starts:
        for nxt in adj[start]:
            ek = edge_key(start, nxt)
            if ek in visited_edges:
                continue
            path = [start]
            prev = start
            cur = nxt
            visited_edges.add(ek)
            while True:
                path.append(cur)
                if is_end(cur) or is_junc(cur):
                    break
                nbrs = [n for n in adj[cur] if n != prev]
                if not nbrs:
                    break
                # prefer continuing
                n2 = nbrs[0]
                ek2 = edge_key(cur, n2)
                if ek2 in visited_edges:
                    break
                visited_edges.add(ek2)
                prev, cur = cur, n2
            if len(path) >= 2:
                polylines.append(path)

    # leftover unvisited edges (loops)
    for a in nodes:
        for b in adj[a]:
            ek = edge_key(a, b)
            if ek in visited_edges:
                continue
            path = [a]
            prev = a
            cur = b
            visited_edges.add(ek)
            guard = 0
            while guard < 100000:
                guard += 1
                path.append(cur)
                nbrs = [n for n in adj[cur] if n != prev]
                if not nbrs:
                    break
                n2 = None
                for cand in nbrs:
                    if edge_key(cur, cand) not in visited_edges:
                        n2 = cand
                        break
                if n2 is None:
                    break
                visited_edges.add(edge_key(cur, n2))
                prev, cur = cur, n2
                if cur == a:
                    path.append(cur)
                    break
            if len(path) >= 3:
                polylines.append(path)

    return polylines


def simplify(pts_xy: list[list[float]], tol: float = 0.08) -> list[list[float]]:
    """Ramer-ish lightweight: drop points closer than tol map-% to chord."""
    if len(pts_xy) <= 2:
        return pts_xy

    def dist(a, b, p):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        qx, qy = ax + t * dx, ay + t * dy
        return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5

    def rec(pts):
        if len(pts) <= 2:
            return pts
        a, b = pts[0], pts[-1]
        far_i = 1
        far_d = -1.0
        for i in range(1, len(pts) - 1):
            d = dist(a, b, pts[i])
            if d > far_d:
                far_d = d
                far_i = i
        if far_d > tol:
            left = rec(pts[: far_i + 1])
            right = rec(pts[far_i:])
            return left[:-1] + right
        return [a, b]

    return rec(pts_xy)


def px_to_pct(y: int, x: int, h: int, w: int) -> list[float]:
    return [round(100.0 * x / w, 3), round(100.0 * y / h, 3)]


def build_routes(mask) -> list[dict]:
    h, w = mask["h"], mask["w"]
    polylines = trace_polylines(mask["skel"])
    routes = []
    for i, path in enumerate(polylines):
        raw = [px_to_pct(y, x, h, w) for y, x in path]
        # Decimate by stride first (keep fidelity), then light RDP
        if len(raw) > 40:
            step = max(1, len(raw) // 80)
            raw = raw[::step]
            if raw[-1] != [px_to_pct(path[-1][0], path[-1][1], h, w)[0], px_to_pct(path[-1][0], path[-1][1], h, w)[1]]:
                raw.append(px_to_pct(path[-1][0], path[-1][1], h, w))
        pts = simplify(raw, tol=SIMPLIFY_TOL)
        if len(pts) < 2:
            continue
        length = 0.0
        for a, b in zip(pts, pts[1:]):
            length += ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
        if length < 0.25:
            continue
        # drop micro stubs unless they still have several verts
        if length < 0.8 and len(pts) < 4:
            continue
        kind = "freeway" if length >= 4.0 else "highway"
        mid = pts[len(pts) // 2]
        routes.append(
            {
                "id": f"hwy-wire-{i + 1:03d}",
                "name": f"Wire {i + 1}",
                "ref": None,
                "canon": "art-wireframe",
                "kind": kind,
                "note": "Skeletonized from green+black road art on master-enhanced (template copy).",
                "points": pts,
                "label_at": mid,
                "_length": round(length, 3),
                "_raw_px": len(path),
            }
        )

    # Named corridors by proximity to known cities (labels only; geometry unchanged)
    cities = []
    map_json = MAP_DIR / "map.json"
    if map_json.exists():
        data = json.loads(map_json.read_text(encoding="utf-8"))
        for m in data.get("markers") or []:
            if m.get("x_pct") is None:
                continue
            cities.append(
                {
                    "name": m.get("label") or m.get("name") or m.get("id"),
                    "x": float(m["x_pct"]),
                    "y": float(m["y_pct"]),
                }
            )

    lore = [
        ("Bay Ring", "IP-1", ["Paradise", "Porto", "Jacked"]),
        ("SwitchBack", "IP-2", ["Sierra", "Dorado", "Paradise"]),
        ("South Coastal", "IP-3", ["Ruby", "Aurelio", "Villa"]),
        ("Lagooni Spur", "IP-4", ["Lagoon"]),
        ("Seaside Connector", "IP-5", ["Seaside", "Harbor", "Spring"]),
    ]
    used = set()
    for name, ref, keys in lore:
        best = None
        best_sc = -1.0
        for r in routes:
            if r["id"] in used:
                continue
            sc = 0.0
            for c in cities:
                if not any(k.lower() in (c["name"] or "").lower() for k in keys):
                    continue
                for p in r["points"]:
                    d = ((p[0] - c["x"]) ** 2 + (p[1] - c["y"]) ** 2) ** 0.5
                    if d < 4.5:
                        sc += 1.0 + r["_length"] * 0.05
                        break
            if sc > best_sc:
                best_sc = sc
                best = r
        if best and best_sc > 0:
            best["name"] = name
            best["ref"] = ref
            if name in ("Bay Ring", "SwitchBack"):
                best["kind"] = "freeway"
            used.add(best["id"])

    for r in routes:
        r.pop("_length", None)
        r.pop("_raw_px", None)
    return routes


def write_wireframe_png(mask, out: Path) -> None:
    """Exact copy of green+black road art as cyan wireframe + yellow nodes on transparent PNG."""
    h, w = mask["h"], mask["w"]
    # Dilate skeleton slightly so wire reads at fit zoom
    sk = ndimage.binary_dilation(mask["skel"], iterations=1)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[sk, 0] = 126
    rgba[sk, 1] = 246
    rgba[sk, 2] = 255
    rgba[sk, 3] = 230
    # Black road markers → yellow dots (draw filled discs)
    yy, xx = np.ogrid[:h, :w]
    for y, x in mask["dots_yx"]:
        cy, cx = int(round(y)), int(round(x))
        rad = 4
        disc = (yy - cy) ** 2 + (xx - cx) ** 2 <= rad * rad
        rgba[disc, 0] = 255
        rgba[disc, 1] = 251
        rgba[disc, 2] = 150
        rgba[disc, 3] = 255
        ring = ((yy - cy) ** 2 + (xx - cx) ** 2 <= (rad + 1) ** 2) & ~disc
        rgba[ring, 0] = 13
        rgba[ring, 1] = 2
        rgba[ring, 2] = 33
        rgba[ring, 3] = 255
    Image.fromarray(rgba, "RGBA").save(out, optimize=True)


def write_svg(routes: list[dict], nodes: list[dict], out: Path, w: int, h: int) -> None:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{w}" height="{h}">',
        "<!-- Wireframe highways traced from green+black terrain art -->",
        '<g fill="none" stroke="#7ef6ff" stroke-width="0.28" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">',
    ]
    for r in routes:
        pts = r.get("points") or []
        if len(pts) < 2:
            continue
        d = "M " + " L ".join(f"{p[0]} {p[1]}" for p in pts)
        parts.append(f'  <path id="{r["id"]}" d="{d}" />')
    parts.append("</g>")
    parts.append('<g fill="#0d0221" stroke="#fffb96" stroke-width="0.06">')
    for i, n in enumerate(nodes):
        parts.append(
            f'  <circle cx="{n["x"]}" cy="{n["y"]}" r="0.22" data-node="{i}" />'
        )
    parts.append("</g>")
    parts.append("</svg>")
    out.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_blender_plane(out: Path, svg_name: str = "highways-wireframe.svg") -> None:
    """Generate a Blender script: textured plane + curve import for wireframe roads."""
    code = f'''# Blender 3.x+ — run from Blender: Scripting → Open → Run Script
# Plane = map template; curves = wireframe highways traced from green+black art.
import bpy
from pathlib import Path

MAP_DIR = Path(r"{MAP_DIR.as_posix()}")
TEX = MAP_DIR / "master-enhanced.png"
SVG = MAP_DIR / "{svg_name}"

# Clear mesh objects
for obj in list(bpy.data.objects):
    if obj.type in {{"MESH", "CURVE"}}:
        bpy.data.objects.remove(obj, do_unlink=True)

# Plane sized to image aspect (width=10 Blender units)
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
plane = bpy.context.active_object
plane.name = "IslaPrimavera_MapPlane"
aspect = 4176 / 4096
plane.scale = (1.0, aspect, 1.0)

mat = bpy.data.materials.new("MapTerrain")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
out_n = nt.nodes.new("ShaderNodeOutputMaterial")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(str(TEX))
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(bsdf.outputs["BSDF"], out_n.inputs["Surface"])
plane.data.materials.append(mat)

# Wireframe overlay plane (expanded same size, slightly above)
WIRE = MAP_DIR / "highways-wireframe.png"
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0.02))
wire = bpy.context.active_object
wire.name = "Hwy_Wireframe_Overlay"
wire.scale = (1.0, aspect, 1.0)
wmat = bpy.data.materials.new("HwyWireframe")
wmat.use_nodes = True
wmat.blend_method = "BLEND"
wnt = wmat.node_tree
wnt.nodes.clear()
wout = wnt.nodes.new("ShaderNodeOutputMaterial")
wbsdf = wnt.nodes.new("ShaderNodeBsdfPrincipled")
wtex = wnt.nodes.new("ShaderNodeTexImage")
if WIRE.exists():
    wtex.image = bpy.data.images.load(str(WIRE))
    wtex.image.alpha_mode = "STRAIGHT"
wnt.links.new(wtex.outputs["Color"], wbsdf.inputs["Base Color"])
wnt.links.new(wtex.outputs["Alpha"], wbsdf.inputs["Alpha"])
wnt.links.new(wbsdf.outputs["BSDF"], wout.inputs["Surface"])
wire.data.materials.append(wmat)

print("Done: map plane + wireframe overlay. Template = master-enhanced; roads = highways-wireframe.png")
'''
    out.write_text(code, encoding="utf-8")


def load_proposals() -> list:
    if PROPOSALS_BAK.exists():
        prev = json.loads(PROPOSALS_BAK.read_text(encoding="utf-8"))
        return list(prev.get("routes") or prev.get("proposals") or [])
    if OUT.exists():
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        return list(prev.get("proposals") or [])
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--blender-plane", action="store_true", help="also write Blender plane script")
    args = ap.parse_args()

    mask = extract_mask(IMG)
    routes = build_routes(mask)
    assert mask["dot_count"] >= 50, mask["dot_count"]
    assert len(routes) >= 5, len(routes)
    total_pts = sum(len(r["points"]) for r in routes)
    assert total_pts >= 200, total_pts

    out = {
        "version": 3,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "viewBox": "0 0 100 100",
        "_doc": (
            "Wireframe highway components copied from green+black road art on "
            "master-enhanced.png (template → skeleton → polylines). Render as "
            "wireframe overlay on the map plane. Does NOT touch pins/regions-ui."
        ),
        "style": "wireframe",
        "source": "art-green-black-skeleton",
        "marker_count": mask["dot_count"],
        "skel_px": int(mask["skel"].sum()),
        "routes": routes,
        "proposals": load_proposals(),
        "exports": {
            "png": "map/highways-wireframe.png",
            "svg": "map/highways-wireframe.svg",
            "blender": "map/highways-blender-plane.py",
        },
    }

    print(
        f"dots={mask['dot_count']} skel_px={int(mask['skel'].sum())} "
        f"routes={len(routes)} pts={total_pts}"
    )
    for r in routes[:12]:
        print(
            f"  {r['id']:16} {r['kind']:8} {(r.get('ref') or '-'):5} "
            f"{r['name']:22} pts={len(r['points'])}"
        )

    if args.self_check:
        print("SELF_CHECK_OK")
        return 0

    if not args.no_write:
        dots = []
        for y, x in mask["dots_yx"]:
            dots.append(px_to_pct(int(round(y)), int(round(x)), mask["h"], mask["w"]))
        nodes = [{"x": d[0], "y": d[1]} for d in dots]
        out["nodes"] = nodes
        OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        write_wireframe_png(mask, PNG_OUT)
        write_svg(routes, nodes, SVG_OUT, mask["w"], mask["h"])
        write_blender_plane(BLEND_SCRIPT)
        print(f"wrote {OUT}")
        print(f"wrote {PNG_OUT}")
        print(f"wrote {SVG_OUT}")
        print(f"wrote {BLEND_SCRIPT}")

    if args.blender_plane:
        write_blender_plane(BLEND_SCRIPT)
        print(f"blender script {BLEND_SCRIPT}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
