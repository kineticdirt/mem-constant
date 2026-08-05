#!/usr/bin/env python3
"""Shared model-budget CLI for Hermes / dashboard / swarms.

  python3 model-budget.py status
  python3 model-budget.py decide [--pool ops]
  python3 model-budget.py record <model> <ok|fail|rate_limit|moderation|daily_limit>
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(os.environ.get("AGENT_DUMP", Path.home() / "agent-dump"))
CONFIG = REPO / "agents" / "model-budget" / "config.json"
STATE = REPO / "agents" / "state" / "model-budget.json"


def utc_day() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def load_state() -> dict:
    try:
        raw = json.loads(STATE.read_text(encoding="utf-8"))
        if raw.get("day") != utc_day():
            return {"day": utc_day(), "models": {}, "lanes": {"free_ok": 0, "paid_ok": 0}}
        raw.setdefault("models", {})
        raw.setdefault("lanes", {"free_ok": 0, "paid_ok": 0})
        return raw
    except (OSError, json.JSONDecodeError):
        return {"day": utc_day(), "models": {}, "lanes": {"free_ok": 0, "paid_ok": 0}}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def decide(pool: str = "ops") -> dict:
    cfg = load_config()
    state = load_state()
    routing = cfg.get("routing") or {}
    free = list(routing.get("free_models") or [])
    paid = list(routing.get("paid_models_ops") or [])
    soft = cfg.get("soft_caps") or {}
    free_cap = int(soft.get("free_attempts_per_day") or 80)
    paid_cap = int(soft.get("paid_attempts_per_day") or 40)

    def score(mid: str, is_free: bool) -> tuple:
        row = state["models"].get(mid) or {}
        attempts = int(row.get("attempts") or 0)
        cap = free_cap if is_free else paid_cap
        pen = attempts + (1000 if attempts >= cap else 0)
        return (pen, int(row.get("last_used") or 0))

    free_sorted = sorted(free, key=lambda m: score(m, True))
    paid_sorted = sorted(paid, key=lambda m: score(m, False))
    prefer_free = bool(routing.get("prefer_free", True))
    order = (free_sorted + paid_sorted) if prefer_free else (paid_sorted + free_sorted)
    return {
        "policy": cfg.get("policy"),
        "pool": pool,
        "prefer_free": prefer_free,
        "order": order,
        "free": free_sorted,
        "paid": paid_sorted,
        "ops_daily_usd_target": (cfg.get("pools") or {}).get("ops", {}).get("daily_usd_target"),
        "day": state["day"],
    }


def record(model: str, outcome: str) -> dict:
    state = load_state()
    row = state["models"].setdefault(
        model,
        {"attempts": 0, "ok": 0, "fail": 0, "rate_limit": 0, "moderation": 0, "daily_limit": 0, "last_used": 0},
    )
    row["attempts"] = int(row.get("attempts") or 0) + 1
    row["last_used"] = int(time.time() * 1000)
    key = outcome if outcome in row else "fail"
    if outcome == "ok":
        key = "ok"
    elif outcome in ("rate_limit", "429"):
        key = "rate_limit"
    elif outcome == "moderation":
        key = "moderation"
    elif outcome == "daily_limit":
        key = "daily_limit"
    else:
        key = "fail"
    row[key] = int(row.get(key) or 0) + 1
    if outcome == "ok":
        lane = "free_ok" if ":free" in model else "paid_ok"
        state["lanes"][lane] = int(state["lanes"].get(lane) or 0) + 1
    save_state(state)
    return row


def status() -> dict:
    cfg = load_config()
    state = load_state()
    return {
        "config": {
            "policy": cfg.get("policy"),
            "ops_daily_usd_target": (cfg.get("pools") or {}).get("ops", {}).get("daily_usd_target"),
            "rp_daily_usd_target": (cfg.get("pools") or {}).get("rp", {}).get("daily_usd_target"),
        },
        "state": state,
        "decide": decide(),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="model-budget control plane")
    ap.add_argument("cmd", choices=["status", "decide", "record"])
    ap.add_argument("model", nargs="?")
    ap.add_argument("outcome", nargs="?")
    ap.add_argument("--pool", default="ops")
    args = ap.parse_args()
    if args.cmd == "status":
        print(json.dumps(status(), indent=2))
    elif args.cmd == "decide":
        print(json.dumps(decide(args.pool), indent=2))
    elif args.cmd == "record":
        if not args.model or not args.outcome:
            print("usage: record <model> <ok|fail|rate_limit|moderation|daily_limit>", file=sys.stderr)
            return 2
        print(json.dumps(record(args.model, args.outcome), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
