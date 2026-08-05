#!/usr/bin/env python3
"""Probe intel feeds/stocks; write maintenance report; seed agent backlog on failures.

Run on linuxbox (stdlib only). Used by daily-maintenance cron before situation-rss.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INTEL = REPO / "agents" / "intel-trackers.json"
REPORT_DIR = REPO / "reports" / "maintenance"
BACKLOG = REPO / "agents" / "maintenance-progress.md"
UA = "Mozilla/5.0 (compatible; linuxbox-intel-health/1.0; +https://abhinavall.net/Intel/)"


def probe(url: str, timeout: int = 15) -> tuple[int | None, str | None]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            code = resp.getcode()
            body = resp.read(4096).decode("utf-8", errors="replace")
            if code >= 400:
                return code, f"HTTP {code}"
            if "<item" not in body.lower() and "<entry" not in body.lower():
                return code, "no_rss_items_in_body"
            return code, None
    except urllib.error.HTTPError as e:
        return e.code, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)


def reddit_host_alternate(url: str) -> str | None:
    if "old.reddit.com" in url:
        return url.replace("old.reddit.com", "www.reddit.com")
    if "www.reddit.com" in url:
        return url.replace("www.reddit.com", "old.reddit.com")
    return None


def candidates(feed: dict) -> list[str]:
    primary = feed.get("rss_url", "")
    urls: list[str] = []
    if primary:
        urls.append(primary)
    if feed.get("platform") == "reddit":
        alt = reddit_host_alternate(primary)
        if alt and alt not in urls:
            urls.append(alt)
    for u in feed.get("fallback_rss_urls") or []:
        if u and u not in urls:
            urls.append(u)
    return urls


def main() -> int:
    if not INTEL.is_file():
        print(f"missing {INTEL}", file=sys.stderr)
        return 2

    cfg = json.loads(INTEL.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    failures: list[str] = []
    lines = [f"# Intel feed health — {now}", ""]

    for feed in cfg.get("social_feeds") or []:
        name = feed.get("name", "?")
        ok = False
        detail = ""
        for url in candidates(feed):
            code, err = probe(url)
            if err is None:
                ok = True
                detail = f"OK ({url})"
                break
            detail = f"{url} → {err}"
        status = "PASS" if ok else "FAIL"
        lines.append(f"- **{name}** ({feed.get('platform', '?')}): {status} — {detail}")
        if not ok:
            failures.append(name)

    lines.append("")
    lines.append("## Stocks (Yahoo spark API)")
    symbols = [s["symbol"] for s in (cfg.get("stocks") or [])[:4]]
    if symbols:
        qurl = (
            "https://query1.finance.yahoo.com/v7/finance/spark?symbols="
            + ",".join(symbols)
            + "&range=1d&interval=5m"
        )
        req = urllib.request.Request(qurl, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read(4096).decode("utf-8", errors="replace")
                if '"regularMarketPrice"' in body or '"spark"' in body:
                    lines.append("- PASS — Yahoo spark API reachable")
                else:
                    lines.append("- FAIL — unexpected spark body")
                    failures.append("stocks-yahoo-spark")
        except Exception as e:  # noqa: BLE001
            lines.append(f"- FAIL — {e}")
            failures.append("stocks-yahoo-spark")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = REPORT_DIR / f"intel-health-{date}.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    (REPORT_DIR / "LATEST-INTEL-HEALTH.md").write_text(report.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"wrote {report}")

    if failures:
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        entry = (
            f"- [ ] {stamp} Intel feeds failing: {', '.join(failures)} — "
            "see `reports/maintenance/LATEST-INTEL-HEALTH.md`; "
            "fix per `agents/DAILY_MAINTENANCE_TASK.md` (try fallbacks, GitHub search, patch `intel-trackers.json`, restart `linuxbox-status`)"
        )
        if BACKLOG.is_file():
            text = BACKLOG.read_text(encoding="utf-8")
            if entry not in text:
                BACKLOG.write_text(text.rstrip() + "\n" + entry + "\n", encoding="utf-8")
        else:
            BACKLOG.write_text(
                "# Daily maintenance backlog\n\nAuto-seeded by `intel-feed-health.py`.\n\n" + entry + "\n",
                encoding="utf-8",
            )
        print(f"failures={len(failures)} backlog_updated=yes")
        return 1

    print("all_pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
