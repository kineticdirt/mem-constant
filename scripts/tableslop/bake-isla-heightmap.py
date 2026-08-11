#!/usr/bin/env python3
"""Bake Isla Primavera heightmap + road mask for Minecraft-like /3d terrain.

Guide: master-enhanced.png (painted relief) + highways.json (green/black roads).
Does NOT touch city pins or regions-ui.json.

  python scripts/tableslop/bake-isla-heightmap.py
  python scripts/tableslop/bake-isla-heightmap.py --self-check
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "campaigns" / "tropic-gooner" / "map"
IMG = MAP_DIR / "master-enhanced.png"
HWY = MAP_DIR / "highways.json"
OUT_H = MAP_DIR / "heightmap-256.bin"
OUT_R = MAP_DIR / "roadmask-256.bin"
OUT_META = MAP_DIR / "heightmap-256.json"

GRID = 256
MAX_H = 32


def rgb_to_hsv_arr(rgb: np.ndarray):
    """rgb uint8 HxWx3 → h,s,v float arrays in [0,1] (h as 0..1)."""
    r = rgb[:, :, 0].astype(np.float32) / 255.0
    g = rgb[:, :, 1].astype(np.float32) / 255.0
    b = rgb[:, :, 2].astype(np.float32) / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    df = mx - mn
    v = mx
    s = np.where(mx > 1e-6, df / np.maximum(mx, 1e-6), 0.0)
    h = np.zeros_like(mx)
    mask = df > 1e-6
    # r max
    rm = mask & (mx == r)
    h[rm] = ((g[rm] - b[rm]) / df[rm]) % 6.0
    gm = mask & (mx == g)
    h[gm] = (b[gm] - r[gm]) / df[gm] + 2.0
    bm = mask & (mx == b)
    h[bm] = (r[bm] - g[bm]) / df[bm] + 4.0
    h = (h / 6.0) % 1.0
    return h, s, v


def water_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    # ocean / bay blues (painted sky-water, not pure blue)
    return (b > r + 20) & (b > g) & (b > 180) & (r < 200) & (g > 150)


def road_mask_from_art(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    black = (r < 35) & (g < 35) & (b < 35)
    dil = ndimage.binary_dilation(black, iterations=10)
    green = (g > r + 12) & (g > b + 8) & (g > 85) & (g < 210) & (r > 45) & (r < 175)
    return dil & green | ndimage.binary_dilation(black, iterations=2)


def road_mask_from_highways(h: int, w: int) -> np.ndarray:
    """Rasterize highways.json polylines into a boolean mask at image resolution."""
    mask = np.zeros((h, w), dtype=bool)
    if not HWY.exists():
        return mask
    data = json.loads(HWY.read_text(encoding="utf-8"))
    for route in data.get("routes") or []:
        pts = route.get("points") or []
        if len(pts) < 2:
            continue
        for a, b in zip(pts, pts[1:]):
            x0, y0 = float(a[0]), float(a[1])
            x1, y1 = float(b[0]), float(b[1])
            # percent → pixel
            px0, py0 = x0 / 100.0 * (w - 1), y0 / 100.0 * (h - 1)
            px1, py1 = x1 / 100.0 * (w - 1), y1 / 100.0 * (h - 1)
            steps = max(2, int(np.hypot(px1 - px0, py1 - py0)))
            for t in range(steps + 1):
                u = t / steps
                x = int(round(px0 + (px1 - px0) * u))
                y = int(round(py0 + (py1 - py0) * u))
                if 0 <= y < h and 0 <= x < w:
                    mask[y, x] = True
    return ndimage.binary_dilation(mask, iterations=4)


def height_from_color(rgb: np.ndarray, water: np.ndarray, roads: np.ndarray) -> np.ndarray:
    """Relative height 0..1 on land; water=0; roads excluded from sample (nan)."""
    h, s, v = rgb_to_hsv_arr(rgb)
    # green (~0.25–0.45) low; yellow/brown (~0.08–0.18) mid; white = high v + low s
    # Distance from green hue toward brown/white
    # Prefer: low when hue near green and mid v; high when brown or bright white
    greenness = np.exp(-((h - 0.33) ** 2) / (2 * 0.08**2))  # peak at green
    brownness = np.exp(-((h - 0.08) ** 2) / (2 * 0.06**2))
    whiteness = (v > 0.78) & (s < 0.35)
    # base: invert greenness, add brown + white
    rel = (1.0 - greenness) * 0.45 + brownness * 0.35 + v * 0.35
    rel = np.clip(rel, 0.0, 1.0)
    rel = np.where(whiteness, np.maximum(rel, 0.75 + (v - 0.78) * 0.8), rel)
    rel = np.where(water, 0.0, rel)
    rel = np.where(roads, np.nan, rel)
    return rel


def downsample_nanmean(arr: np.ndarray, grid: int) -> np.ndarray:
    h, w = arr.shape
    out = np.zeros((grid, grid), dtype=np.float32)
    ys = np.linspace(0, h, grid + 1).astype(int)
    xs = np.linspace(0, w, grid + 1).astype(int)
    for gy in range(grid):
        for gx in range(grid):
            block = arr[ys[gy] : ys[gy + 1], xs[gx] : xs[gx + 1]]
            if block.size == 0:
                out[gy, gx] = 0.0
                continue
            if np.all(np.isnan(block)):
                out[gy, gx] = np.nan
            else:
                out[gy, gx] = np.nanmean(block)
    return out


def downsample_any(mask: np.ndarray, grid: int) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros((grid, grid), dtype=np.uint8)
    ys = np.linspace(0, h, grid + 1).astype(int)
    xs = np.linspace(0, w, grid + 1).astype(int)
    for gy in range(grid):
        for gx in range(grid):
            block = mask[ys[gy] : ys[gy + 1], xs[gx] : xs[gx + 1]]
            out[gy, gx] = 1 if block.any() else 0
    return out


def fill_nans_from_neighbors(grid: np.ndarray) -> np.ndarray:
    out = grid.copy()
    nan = np.isnan(out)
    if not nan.any():
        return out
    # replace nan with local mean of finite neighbors (iterate)
    for _ in range(12):
        nan = np.isnan(out)
        if not nan.any():
            break
        filled = out.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted = np.roll(out, (dy, dx), axis=(0, 1))
            # avoid wrap pollution on edges — zero those
            if dy == -1:
                shifted[-1, :] = np.nan
            if dy == 1:
                shifted[0, :] = np.nan
            if dx == -1:
                shifted[:, -1] = np.nan
            if dx == 1:
                shifted[:, 0] = np.nan
            use = nan & np.isfinite(shifted)
            filled = np.where(use & np.isnan(filled), shifted, filled)
            both = use & np.isfinite(filled) & (filled != shifted)
            filled = np.where(both, (filled + shifted) * 0.5, filled)
        # simpler: ndimage with nan→0 then restore water
        tmp = out.copy()
        tmp[nan] = 0
        mean = ndimage.uniform_filter(np.nan_to_num(out, nan=0.0), size=3)
        count = ndimage.uniform_filter((~nan).astype(np.float32), size=3)
        est = np.where(count > 1e-3, mean / np.maximum(count, 1e-3), 0.0)
        out = np.where(nan, est, out)
    out = np.nan_to_num(out, nan=0.0)
    return out


def bake():
    im = Image.open(IMG).convert("RGB")
    rgb = np.asarray(im)
    h, w = rgb.shape[:2]
    water = water_mask(rgb)
    roads_art = road_mask_from_art(rgb)
    roads_hwy = road_mask_from_highways(h, w)
    roads = roads_art | roads_hwy

    rel = height_from_color(rgb, water, roads)
    # also zero water in downsample via setting 0 (not nan) for water
    rel = np.where(water, 0.0, rel)

    hi = downsample_nanmean(rel, GRID)
    road_g = downsample_any(roads & ~water, GRID)
    water_g = downsample_any(water, GRID)

    hi = fill_nans_from_neighbors(hi)
    # smooth lightly
    hi = ndimage.gaussian_filter(hi, sigma=0.8)
    # water cells stay 0
    hi = np.where(water_g > 0, 0.0, hi)
    # fill under roads: ensure road cells have nearby land height
    for _ in range(3):
        for gy, gx in zip(*np.where(road_g > 0)):
            if hi[gy, gx] > 0.02:
                continue
            vals = []
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = gy + dy, gx + dx
                    if 0 <= yy < GRID and 0 <= xx < GRID and not (dy == 0 and dx == 0):
                        if water_g[yy, xx]:
                            continue
                        if hi[yy, xx] > 0.02:
                            vals.append(hi[yy, xx])
            if vals:
                hi[gy, gx] = float(np.mean(vals))
            else:
                hi[gy, gx] = 0.12  # coastal road fallback

    # normalize land to 1..MAX_H
    land = hi > 0.02
    if land.any():
        lo = float(np.percentile(hi[land], 5))
        hi_p = float(np.percentile(hi[land], 98))
        span = max(hi_p - lo, 1e-4)
        norm = (hi - lo) / span
        norm = np.clip(norm, 0.0, 1.0)
        height_u8 = np.zeros((GRID, GRID), dtype=np.uint8)
        height_u8[land] = np.clip(np.round(1 + norm[land] * (MAX_H - 1)), 1, MAX_H).astype(
            np.uint8
        )
    else:
        height_u8 = np.zeros((GRID, GRID), dtype=np.uint8)
    height_u8 = np.where(water_g > 0, 0, height_u8).astype(np.uint8)

    return height_u8, road_g.astype(np.uint8), {
        "version": 1,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "w": GRID,
        "h": GRID,
        "maxH": MAX_H,
        "viewBox": "0 0 100 100",
        "source_image": "map/master-enhanced.png",
        "roads_source": "art+highways.json",
        "block_vu": 100.0 / GRID,
        "stats": {
            "land_cells": int((height_u8 > 0).sum()),
            "road_cells": int((road_g > 0).sum()),
            "water_cells": int((water_g > 0).sum()),
            "max_height": int(height_u8.max()),
            "mean_land_h": float(height_u8[height_u8 > 0].mean()) if (height_u8 > 0).any() else 0.0,
            "corner_NW": int(height_u8[0, 0]),
            "corner_SE": int(height_u8[-1, -1]),
            "center": int(height_u8[GRID // 2, GRID // 2]),
        },
    }


def self_check(height_u8: np.ndarray, road_g: np.ndarray, meta: dict) -> None:
    st = meta["stats"]
    g = height_u8.shape[0]
    # Ocean is east/north of the painted map; SW corner is black letterbox → allow 0
    east_strip = height_u8[:, -8:]
    assert float(east_strip.mean()) < 4.0, f"east strip not sea: {east_strip.mean()}"
    assert st["center"] >= 8, f"center too low: {st['center']}"
    assert st["land_cells"] > 5000, st
    assert st["land_cells"] < g * g * 0.85, f"too much land: {st}"
    assert st["road_cells"] > 50, st
    road_on_land = ((road_g > 0) & (height_u8 > 0)).sum()
    assert road_on_land >= st["road_cells"] * 0.6, (road_on_land, st["road_cells"])
    print("SELF_CHECK_OK", st)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    height_u8, road_g, meta = bake()
    print(
        f"land={meta['stats']['land_cells']} roads={meta['stats']['road_cells']} "
        f"centerH={meta['stats']['center']} maxH={meta['stats']['max_height']}"
    )
    self_check(height_u8, road_g, meta)
    if args.self_check:
        return 0
    if not args.no_write:
        OUT_H.write_bytes(height_u8.tobytes())
        OUT_R.write_bytes(road_g.tobytes())
        OUT_META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {OUT_H} ({OUT_H.stat().st_size} B)")
        print(f"wrote {OUT_R} ({OUT_R.stat().st_size} B)")
        print(f"wrote {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
