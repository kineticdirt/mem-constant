#!/usr/bin/env python3
"""One-shot triage of open Hub user-tasks (wishlist thrash cleanup).

Marks already-shipped items done, defers pure wishlist, assigns lanes
(hermes vs cursor) on what stays open.

Usage:
  python3 scripts/linuxbox/triage-open-user-tasks.py --repo REPO [--apply]
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

# id -> done note (feature already exists or process fix shipped)
ALREADY_DONE: dict[str, str] = {
    "hw-lepotato-thermal-monitor": "thermal-monitor.sh already ships; cron wired by install tick. Hub host-resources exposes SoC temp.",
    "hermes-adaptive-think-interval": "THINK_INTERVAL_SEC=480 already gates think LLM; resource_governor + cursor offload cover load.",
    "monitoring-service-health-endpoint": "/api/status + /api/host-resources exist; /api/health added as thin alias.",
    "testing-playwright-hub-smoke-cron": "scripts/linuxbox/run-dashboard-ui-smoke.sh exists; think continuity seeds smoke when queue empty.",
    "sim-isla-primavera-hub-tab": "Live on tableslop /sim (map.tableslop.org/sim) — product silo, not Hub embed.",
    "cursor-sdk-auto-pipeline": "Agent 2 tick agent-cycle-cursor-tick.sh parallel to Hermes think.",
    "d449c41f-4029-4bc1-8b2d-abdbc2dc9aac": "Idle/money burn addressed: work packets + no timeout_124 Hub promote + Cursor parallel lane.",
    "hub-stock-market-tracker": "Hub News already expands stocks; dedicated tab deferred.",
    "think-tick-schedule-optimizer": "Covered by THINK_INTERVAL_SEC + resource_governor plan_tick.",
    "log-rotation-archive-health": "Archive paths + /mnt/archive/logs already SoT; no extra agent task.",
    "backup-staleness-monitor": "verify-runtime-state + archive backups; soft-close until dedicated alert asked.",
    "rss-blogwatcher-formal-lane": "Intel/News RSS set already formal; AwesomeFOSS ask-before-wire policy.",
}

# prefix or id substring → deferred wishlist (not building now)
WISHLIST_PREFIXES = (
    "[gaming]",
    "[media]",
    "[voice]",
    "[email]",
    "[mcp]",
    "[youtube]",
    "[notion]",
    "[spotify]",
    "[polymarket]",
    "[photography]",
    "[weather]",
    "[calendar]",
    "[homeassistant]",
    "[automotive]",
    "[comfyui]",
    "[ci]",
    "[declarative]",
    "[analytics]",
    "[proxy]",
    "[finance]",
    "[disaster-recovery]",
    "[security]",
    "[red-teaming]",
)

# stay open — Cursor product lane
CURSOR_KEEP = {
    "hub-papercuts-live-panel",
    "tableslop-faction-territory-tracker",
    "tableslop-world-editor",
    "tableslop-campaign-manager",
    "camp-nyc-borough-content-audit",
    "pixi-world-delta-automation",
    "blog-engineering-essays-backlog",
    "github-code-discovery-automation",
    "docs-runbook-consolidation",
    "infranet-mesh-topology-doc",
    "mazda3-build-progress-dashboard",
    "discord-bot-health-dashboard",
}

# stay open — Hermes ops lane
HERMES_KEEP = {
    "cloudflare-tunnel-health-monitor",  # if not wishlist-closed
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".", type=Path)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    repo = args.repo.resolve()
    fp = repo / "agents" / "user-tasks.json"
    data = json.loads(fp.read_text(encoding="utf-8"))
    tasks = data.get("tasks") or []
    now = _now()
    stats = {"done": 0, "deferred": 0, "cursor": 0, "hermes": 0, "skipped": 0}

    for t in tasks:
        if not isinstance(t, dict):
            continue
        st = str(t.get("status") or "").lower()
        if st not in ("open", "pending", ""):
            stats["skipped"] += 1
            continue
        tid = str(t.get("id") or "")
        title = str(t.get("title") or t.get("blurb") or "")

        if tid in ALREADY_DONE:
            t["status"] = "done"
            t["updated_at"] = now
            t["notes"] = ((t.get("notes") or "") + " | triage: " + ALREADY_DONE[tid])[:800]
            t.setdefault("context", {})
            if isinstance(t["context"], dict):
                t["context"]["assigned_lane"] = "closed"
            stats["done"] += 1
            continue

        if any(title.startswith(p) for p in WISHLIST_PREFIXES) and tid not in CURSOR_KEEP:
            t["status"] = "done"
            t["updated_at"] = now
            t["notes"] = (
                (t.get("notes") or "")
                + " | triage: wishlist soft-closed — reopen when GM prioritizes (ponytail YAGNI)"
            )[:800]
            stats["deferred"] += 1
            continue

        lane = "cursor" if tid in CURSOR_KEEP or any(
            title.startswith(p)
            for p in (
                "[tableslop]",
                "[campaign]",
                "[hub]",
                "[pixi]",
                "[blog]",
                "[docs]",
                "[sim]",
                "[cursor]",
                "[mazda3]",
                "[infranet]",
                "[github]",
            )
        ) else "hermes"
        if tid in HERMES_KEEP:
            lane = "hermes"
        t.setdefault("context", {})
        if isinstance(t["context"], dict):
            t["context"]["assigned_lane"] = lane
        t["updated_at"] = now
        if lane == "cursor":
            stats["cursor"] += 1
        else:
            stats["hermes"] += 1

    print(json.dumps({"ok": True, "apply": args.apply, **stats}, indent=2))
    if args.apply:
        data["updated_at"] = now
        fp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
