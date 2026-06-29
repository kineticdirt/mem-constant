#!/usr/bin/env python3
"""Mazda3 build price monitor — re-check tracked part prices, log changes.

Runs every 3 days (cron/systemd timer). For each part with a URL it fetches the page,
extracts the current price with layered heuristics, and if the price changed it updates
`current_price` and appends a `price_history` row. Parts without a URL (e.g. the wheels
spec) are skipped. Writes a short run report to reports/mazda3/.

ponytail: price extraction is heuristic (JSON-LD price -> meta price -> first $N.NN).
Vendors differ; if a part stops resolving, add a per-vendor selector in extract_price().
Unresolved parts are left untouched (never overwrite a known price with a guess).

Usage: python price_monitor.py [--parts PATH] [--no-net]
"""
from __future__ import annotations  # linuxbox runs Python 3.9; keep `X | None` annotations lazy

import argparse
import datetime
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_PARTS = REPO / "projects" / "mazda3-sports-build" / "parts.json"
REPORT_DIR = REPO / "reports" / "mazda3"
UA = "Mozilla/5.0 (price-monitor; +abhinavall.net)"


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            charset = r.headers.get_content_charset() or "utf-8"
            return r.read().decode(charset, errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def _to_float(s: str) -> float | None:
    s = s.replace(",", "").strip()
    try:
        v = float(s)
        return v if 0 < v < 1_000_000 else None
    except ValueError:
        return None


def extract_price(html: str) -> float | None:
    # 1) JSON-LD / structured price, decimal form: "price":"272.30" or "price": 272.30
    #    Require the .NN — Shopify also embeds an integer cents field ("price":27230)
    #    that must NOT be read as dollars.
    for m in re.finditer(r'"price"\s*:\s*"?(\d[\d,]*\.\d{2})"?', html):
        v = _to_float(m.group(1))
        if v:
            return v
    # 2) meta itemprop/property price content
    for pat in (
        r'itemprop=["\']price["\'][^>]*content=["\']([\d,]+\.?\d{0,2})',
        r'content=["\']([\d,]+\.?\d{0,2})["\'][^>]*itemprop=["\']price["\']',
        r'property=["\']product:price:amount["\']\s*content=["\']([\d,]+\.?\d{0,2})',
    ):
        m = re.search(pat, html)
        if m:
            v = _to_float(m.group(1))
            if v:
                return v
    # 3) first $-amount on the page (last resort)
    m = re.search(r"\$\s*([\d,]+\.\d{2})", html)
    return _to_float(m.group(1)) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", default=str(DEFAULT_PARTS))
    ap.add_argument("--no-net", action="store_true")
    ns = ap.parse_args()

    parts_path = Path(ns.parts)
    data = json.loads(parts_path.read_text(encoding="utf-8"))
    today = datetime.date.today().isoformat()
    lines = [f"# Mazda3 price monitor: {today}", ""]
    changes = 0

    for part in data.get("parts", []):
        url = part.get("url")
        name = part.get("name", part.get("id", "?"))
        if not url:
            lines.append(f"- skip (no url): {name}")
            continue
        if ns.no_net:
            lines.append(f"- skip (--no-net): {name}")
            continue
        html = fetch(url)
        if html is None:
            lines.append(f"- UNREACHABLE: {name}")
            continue
        price = extract_price(html)
        old = part.get("current_price")
        if price is None:
            lines.append(f"- unresolved price (kept {old}): {name}")
            continue
        if old is None or abs(price - old) >= 0.01:
            part.setdefault("price_history", []).append(
                {"date": today, "price": price, "note": f"auto: was {old}"}
            )
            part["current_price"] = price
            changes += 1
            arrow = "->" if old is not None else "(new)"
            lines.append(f"- CHANGED {name}: {old} {arrow} {price}")
        else:
            lines.append(f"- no change {name}: {price}")

    data.setdefault("monitor", {})["last_run"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    data["updated_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    parts_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    lines.append("")
    lines.append(f"**{changes} change(s).**")
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / f"price-monitor-{today}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
