#!/usr/bin/env python3
"""GM polygon stats for campaigns/tropic-gooner/map/regions-ui.json — shared deploy gates."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def _parse_areas(data: dict[str, Any]) -> list[dict[str, Any]]:
    areas = data.get("areas") or []
    if isinstance(areas, dict):
        return list(areas.values())
    return [a for a in areas if isinstance(a, dict)]


def poly_vert_count(area: dict[str, Any]) -> int:
    shape = area.get("shape")
    pts = area.get("points")
    if shape == "ellipse":
        return 0
    if isinstance(pts, list):
        return len(pts) if len(pts) >= 3 else 0
    s = str(pts or "").strip()
    if not s or len(s) <= 2:
        return 0
    return len([p for p in s.split() if p and "," in p])


def stats(path_or_data: str | Path | dict[str, Any]) -> dict[str, Any]:
    if isinstance(path_or_data, dict):
        data = path_or_data
    else:
        data = json.loads(Path(path_or_data).read_text(encoding="utf-8"))

    polys: dict[str, int] = {}
    has_ellipse = False
    total = 0
    for a in _parse_areas(data):
        n = poly_vert_count(a)
        if n >= 3:
            aid = str(a.get("id") or "?")
            polys[aid] = n
            total += n
        if a.get("shape") == "ellipse":
            has_ellipse = True

    poly_count = len(polys)
    doc = str(data.get("_doc") or "")
    ellipse_stub_doc = "ellipses" in doc.lower() and poly_count == 0

    return {
        "version": data.get("version"),
        "enabled": data.get("enabled"),
        "total_verts": total,
        "polys": polys,
        "poly_count": poly_count,
        "has_ellipse": has_ellipse,
        "ellipse_stub_doc": ellipse_stub_doc,
        "is_empty_or_stub": poly_count == 0 and (has_ellipse or ellipse_stub_doc or not _parse_areas(data)),
    }


def would_clobber_remote(local: dict[str, Any], remote: dict[str, Any]) -> str | None:
    ls = stats(local)
    rs = stats(remote)
    if rs["poly_count"] == 0:
        return None
    if ls["is_empty_or_stub"]:
        return (
            f"local empty/stub (polys={ls['poly_count']}) vs remote "
            f"polys={rs['poly_count']} verts={rs['total_verts']}"
        )
    if ls["total_verts"] < rs["total_verts"]:
        return (
            f"local verts {ls['total_verts']} < remote {rs['total_verts']} "
            f"(polys local={ls['poly_count']} remote={rs['poly_count']})"
        )
    return None


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: regions-ui-gm-stats.py <regions-ui.json> [--json]", file=sys.stderr)
        return 2
    path = argv[1]
    out = stats(path)
    if "--json" in argv:
        print(json.dumps(out, indent=2))
    else:
        print(
            f"v={out['version']} polys={out['poly_count']} verts={out['total_verts']} "
            f"stub={out['is_empty_or_stub']}"
        )
        if out["polys"]:
            print(",".join(f"{k}:{v}" for k, v in sorted(out["polys"].items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
