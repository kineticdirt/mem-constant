#!/usr/bin/env python3
"""Trace Freeway/highway polylines from black road markers on master-enhanced.png.

The green+black-dot network on the terrain IS the mapped SoT. This script reads those
black squares, chains them into routes (city corridors + leftover trunks), and writes
map/highways.json.

Does NOT touch city pins or regions-ui.json.

  python scripts/tableslop/extract-art-highways.py
  python scripts/tableslop/extract-art-highways.py --self-check
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "campaigns" / "tropic-gooner" / "map"
IMG = MAP_DIR / "master-enhanced.png"
MAP_JSON = MAP_DIR / "map.json"
OUT = MAP_DIR / "highways.json"
PROPOSALS_BAK = MAP_DIR / "highways-proposals-aug10.json"

MAX_D = 7.0  # map-% neighbor link
DOT_SIZE = (2, 160)

# Diegetic corridors: walk shortest paths on the art-marker graph between cities.
CORRIDORS = [
    {
        "id": "hwy-bay-ring",
        "name": "Bay Ring",
        "ref": "IP-1",
        "kind": "freeway",
        "cities": ["Paradise", "Porto Lujara", "Jackedsonville", "Paradise"],
    },
    {
        "id": "hwy-switchback",
        "name": "SwitchBack",
        "ref": "IP-2",
        "kind": "freeway",
        "cities": ["Paradise", "Sierra Dorado", "InterFederal Shores"],
    },
    {
        "id": "hwy-south-coastal",
        "name": "South Coastal",
        "ref": "IP-3",
        "kind": "freeway",
        "cities": ["Villa Miel", "Ruby Harbor", "San Aurelio"],
    },
    {
        "id": "hwy-lagooni",
        "name": "Lagooni Spur",
        "ref": "IP-4",
        "kind": "highway",
        "cities": ["Portview", "Lagooni Seika"],
    },
    {
        "id": "hwy-seaside",
        "name": "Seaside Connector",
        "ref": "IP-5",
        "kind": "highway",
        "cities": ["Seaside Springs", "East Bayby", "Portview"],
    },
]


def load_cities() -> list[dict]:
    data = json.loads(MAP_JSON.read_text(encoding="utf-8"))
    cities = []
    for m in data.get("markers") or []:
        if m.get("x_pct") is None or m.get("y_pct") is None:
            continue
        cities.append(
            {
                "id": m.get("id"),
                "name": m.get("label") or m.get("name") or m.get("id"),
                "x": float(m["x_pct"]),
                "y": float(m["y_pct"]),
            }
        )
    return cities


def find_city(cities: list[dict], name: str) -> dict | None:
    want = name.lower()
    for c in cities:
        if (c["name"] or "").lower() == want:
            return c
    for c in cities:
        if want in (c["name"] or "").lower():
            return c
    return None


def extract_dots(img_path: Path) -> np.ndarray:
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
        raise SystemExit("no road-marker dots found")
    cent = np.array(ndimage.center_of_mass(black, lab, dot_ids))  # y, x
    pts = np.column_stack([cent[:, 1] / w * 100.0, cent[:, 0] / h * 100.0])
    return pts


def build_graph(pts: np.ndarray, max_d: float = MAX_D):
    n = len(pts)
    edges = []
    for i in range(n):
        d = np.linalg.norm(pts - pts[i], axis=1)
        order = np.argsort(d)
        cnt = 0
        for j in order[1:]:
            if d[j] > max_d:
                break
            if i < j:
                edges.append((i, j, float(d[j])))
            cnt += 1
            if cnt >= 6:
                break
    adj: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for i, j, dist in edges:
        adj[i].append((j, dist))
        adj[j].append((i, dist))
    return adj, edges


def components(n: int, adj) -> list[list[int]]:
    seen: set[int] = set()
    comps: list[list[int]] = []
    for i in range(n):
        if i in seen:
            continue
        stack = [i]
        seen.add(i)
        comp: list[int] = []
        while stack:
            u = stack.pop()
            comp.append(u)
            for v, _ in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)


def nearest_dot(xy: tuple[float, float], pts: np.ndarray) -> int:
    d = np.linalg.norm(pts - np.array(xy), axis=1)
    return int(np.argmin(d))


def dijkstra(start: int, goal: int, adj) -> list[int] | None:
    import heapq

    if start == goal:
        return [start]
    pq = [(0.0, start)]
    dist = {start: 0.0}
    parent = {start: None}
    while pq:
        cost, u = heapq.heappop(pq)
        if u == goal:
            break
        if cost > dist.get(u, 1e18):
            continue
        for v, w in adj[u]:
            nd = cost + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                parent[v] = u
                heapq.heappush(pq, (nd, v))
    if goal not in parent and start != goal:
        return None
    out = []
    cur = goal
    while cur is not None:
        out.append(cur)
        cur = parent.get(cur)
    return out[::-1]


def bfs_farthest(start: int, nodeset: set[int], adj):
    q = [start]
    dist = {start: 0}
    parent = {start: None}
    while q:
        u = q.pop(0)
        for v, _ in adj[u]:
            if v not in nodeset or v in dist:
                continue
            dist[v] = dist[u] + 1
            parent[v] = u
            q.append(v)
    far = max(dist, key=dist.get)
    return far, parent


def path_to_root(end: int, parent: dict) -> list[int]:
    out = []
    cur = end
    while cur is not None:
        out.append(cur)
        cur = parent[cur]
    return out[::-1]


def poly_from(idxs: list[int], pts: np.ndarray) -> list[list[float]]:
    return [[round(float(pts[i, 0]), 3), round(float(pts[i, 1]), 3)] for i in idxs]


def poly_len(poly: list[list[float]]) -> float:
    total = 0.0
    for k in range(len(poly) - 1):
        total += (
            (poly[k][0] - poly[k + 1][0]) ** 2 + (poly[k][1] - poly[k + 1][1]) ** 2
        ) ** 0.5
    return total


def chain_cities(city_names: list[str], cities: list[dict], pts: np.ndarray, adj) -> list[int] | None:
    dots = []
    for name in city_names:
        c = find_city(cities, name)
        if not c:
            return None
        dots.append(nearest_dot((c["x"], c["y"]), pts))
    path: list[int] = []
    for a, b in zip(dots, dots[1:]):
        seg = dijkstra(a, b, adj)
        if not seg:
            return None
        if path and seg[0] == path[-1]:
            path.extend(seg[1:])
        else:
            path.extend(seg)
    return path


def build_routes(pts: np.ndarray, cities: list[dict]) -> list[dict]:
    adj, _edges = build_graph(pts)
    routes: list[dict] = []
    used_nodes: set[int] = set()

    for corr in CORRIDORS:
        idxs = chain_cities(corr["cities"], cities, pts, adj)
        if not idxs or len(idxs) < 2:
            print(f"WARN: corridor {corr['name']} not connected on art graph")
            continue
        poly = poly_from(idxs, pts)
        used_nodes.update(idxs)
        routes.append(
            {
                "id": corr["id"],
                "name": corr["name"],
                "ref": corr["ref"],
                "canon": "art-traced",
                "kind": corr["kind"],
                "note": (
                    "Traced along black road markers on master-enhanced "
                    f"(cities: {' → '.join(corr['cities'])}). Green art = SoT."
                ),
                "points": poly,
                "label_at": poly[len(poly) // 2],
            }
        )

    # Leftover large components → extra freeways/highways not covered by corridors
    comps = components(len(pts), adj)
    extra_i = 0
    for comp in comps:
        if len(comp) < 5:
            continue
        # skip if mostly already used by a corridor
        overlap = sum(1 for i in comp if i in used_nodes) / len(comp)
        if overlap >= 0.55:
            continue
        nodeset = set(comp)
        a, _ = bfs_farthest(comp[0], nodeset, adj)
        b, parent = bfs_farthest(a, nodeset, adj)
        trunk = path_to_root(b, parent)
        if len(trunk) < 4:
            continue
        poly = poly_from(trunk, pts)
        length = poly_len(poly)
        if length < 6:
            continue
        extra_i += 1
        kind = "freeway" if length >= 12 else "highway"
        routes.append(
            {
                "id": f"hwy-art-extra-{extra_i:02d}",
                "name": f"Art corridor {extra_i}",
                "ref": None,
                "canon": "art-traced",
                "kind": kind,
                "note": "Extra trunk from black road markers not covered by named corridors.",
                "points": poly,
                "label_at": poly[len(poly) // 2],
            }
        )
        used_nodes.update(trunk)

    return routes


def load_proposals() -> list:
    proposals = []
    if PROPOSALS_BAK.exists():
        prev = json.loads(PROPOSALS_BAK.read_text(encoding="utf-8"))
        proposals = list(prev.get("routes") or prev.get("proposals") or [])
    elif OUT.exists():
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        if prev.get("proposals"):
            proposals = list(prev["proposals"])
        else:
            for r in prev.get("routes") or []:
                if r.get("canon") == "proposal":
                    proposals.append(r)
    return proposals


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--write", action="store_true", default=True)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    write = args.write and not args.no_write

    pts = extract_dots(IMG)
    cities = load_cities()
    routes = build_routes(pts, cities)
    assert len(pts) >= 50, f"expected many road markers, got {len(pts)}"
    assert len(routes) >= 3, f"expected several routes, got {len(routes)}"
    refs = {r.get("ref") for r in routes if r.get("ref")}
    assert "IP-1" in refs and "IP-2" in refs, f"Bay Ring/SwitchBack missing: {refs}"
    freeways = [r for r in routes if r["kind"] == "freeway"]
    assert freeways, "need at least one freeway"

    proposals = load_proposals()
    out = {
        "version": 2,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "viewBox": "0 0 100 100",
        "_doc": (
            "Main Freeway/highway geometry traced from black road markers on "
            "master-enhanced.png (green art = SoT). Prior yellow proposal sketches "
            "kept under proposals[] for reference. Does NOT touch pins/regions-ui."
        ),
        "style": "google_maps_road",
        "source": "art-black-markers",
        "marker_count": int(len(pts)),
        "routes": routes,
        "proposals": proposals,
    }

    print(f"markers={len(pts)} routes={len(routes)} freeways={len(freeways)}")
    for r in routes:
        print(
            f"  {r['id']:24} {r['kind']:8} {(r.get('ref') or '-'):5} "
            f"{r['name']}  pts={len(r['points'])}"
        )

    if args.self_check:
        print("SELF_CHECK_OK")
        return 0

    if write:
        OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
